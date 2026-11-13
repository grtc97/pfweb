"""Contact-form email delivery.

Supports three delivery modes, selected with the ``CONTACT_MODE`` setting:

- ``mock``   — nothing is sent; for local development and tests only. It is
  refused when ``ENVIRONMENT=production`` so a misconfigured deployment can
  never report success without delivering anything.
- ``resend`` — sends via the Resend HTTPS API. Use this on hosts that block
  outbound SMTP (e.g. Render's free plan).
- ``smtp``   — sends via an SMTP server such as Gmail (needs an App Password).

``send_contact_email`` returns ``True`` only when an email was actually handed
to a provider, so callers can tell visitors the truth.
"""

import logging
import smtplib
import socket
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr

import httpx

from app.core.config import settings

logger = logging.getLogger("webpf")

MODE_MOCK = "mock"
MODE_SMTP = "smtp"
MODE_RESEND = "resend"
SUPPORTED_MODES = (MODE_MOCK, MODE_SMTP, MODE_RESEND)

PLACEHOLDER_RECIPIENT = "you@example.com"
RESEND_API_URL = "https://api.resend.com/emails"
REQUEST_TIMEOUT_SECONDS = 30

NOT_CONFIGURED_MESSAGE = "Email delivery is not configured on the server."
MISCONFIGURED_MESSAGE = "Email delivery is misconfigured on the server."
RETRY_LATER_MESSAGE = "Unable to send your message right now. Please try again shortly."


class EmailServiceError(Exception):
    """Raised when sending the contact-form email fails in an expected way."""


class EmailConfigurationError(EmailServiceError):
    """Raised when the server is not set up to deliver email in the current mode."""


@dataclass(frozen=True)
class ContactSubmission:
    """A visitor's contact-form message, already validated by the API schema."""

    name: str
    email: str
    subject: str
    message: str


# --------------------------------------------------------------------------- #
# Configuration checks
# --------------------------------------------------------------------------- #


def get_contact_mode() -> str:
    """Return the configured delivery mode, normalised to lower case."""
    return settings.contact_mode.strip().lower()


def _is_production() -> bool:
    return settings.environment.strip().lower() == "production"


def _recipient_problem() -> str | None:
    recipient = settings.contact_email_to.strip()
    if not recipient or recipient == PLACEHOLDER_RECIPIENT:
        return "CONTACT_EMAIL_TO is not set to a real address"
    return None


def _mode_specific_problem(mode: str) -> str | None:
    if mode == MODE_SMTP and not (settings.smtp_user and settings.smtp_password):
        return "SMTP_USER / SMTP_PASSWORD are not set"
    if mode == MODE_RESEND and not settings.resend_api_key:
        return "RESEND_API_KEY is not set"
    if mode == MODE_RESEND and not settings.contact_email_from.strip():
        return "CONTACT_EMAIL_FROM is not set"
    return None


def find_configuration_problems() -> list[str]:
    """List everything preventing real email delivery (empty list = ready).

    Mock mode counts as "ready" outside production, since it is meant for
    local development and tests.
    """
    mode = get_contact_mode()
    if mode not in SUPPORTED_MODES:
        return [f"CONTACT_MODE '{mode}' is not one of {', '.join(SUPPORTED_MODES)}"]
    if mode == MODE_MOCK:
        return ["CONTACT_MODE=mock is not allowed in production"] if _is_production() else []

    problems = [_recipient_problem(), _mode_specific_problem(mode)]
    return [problem for problem in problems if problem]


def is_email_configured() -> bool:
    """True when the contact form can deliver (or, in development, mock) email."""
    return not find_configuration_problems()


def _ensure_configured() -> None:
    problems = find_configuration_problems()
    if problems:
        logger.error("Contact-form email is not configured: %s", "; ".join(problems))
        raise EmailConfigurationError(NOT_CONFIGURED_MESSAGE)


# --------------------------------------------------------------------------- #
# Message building (shared by every provider)
# --------------------------------------------------------------------------- #


def sanitize_header_value(value: str, fallback: str) -> str:
    """Collapse whitespace/newlines so visitor text can't inject email headers."""
    sanitized = " ".join(value.split())
    return sanitized or fallback


def build_from_header(name: str, subject: str, sender_address: str) -> str:
    """Show the visitor's name and subject in the From display name.

    The address itself must stay the authenticated sender's — providers
    reject or flag a From address that isn't theirs — so the visitor's own
    address goes in Reply-To instead.
    """
    safe_name = sanitize_header_value(name, "Portfolio visitor")
    safe_subject = sanitize_header_value(subject, "No subject")
    return formataddr((f"{safe_name}: {safe_subject} (via website message)", sender_address))


def build_subject(subject: str) -> str:
    """Return the email subject line for a contact-form message."""
    return f"[Portfolio Contact] {sanitize_header_value(subject, 'No subject')}"


def build_body(submission: ContactSubmission) -> str:
    """Return the plain-text email body for a contact-form message."""
    return "\n".join(
        [
            "New message from your portfolio contact form.",
            "",
            f"Name: {submission.name}",
            f"Email: {submission.email}",
            f"Subject: {submission.subject}",
            "",
            "Message:",
            submission.message,
        ]
    )


# --------------------------------------------------------------------------- #
# Providers
# --------------------------------------------------------------------------- #


def _build_smtp_message(submission: ContactSubmission) -> EmailMessage:
    mail = EmailMessage()
    mail["Subject"] = build_subject(submission.subject)
    mail["From"] = build_from_header(submission.name, submission.subject, settings.smtp_user)
    mail["To"] = settings.contact_email_to
    mail["Reply-To"] = submission.email
    mail.set_content(build_body(submission))
    return mail


def _send_via_smtp(submission: ContactSubmission) -> None:
    mail = _build_smtp_message(submission)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=REQUEST_TIMEOUT_SECONDS) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(mail)
    except smtplib.SMTPAuthenticationError as exc:
        logger.exception("Contact-form SMTP authentication failed")
        raise EmailServiceError(MISCONFIGURED_MESSAGE) from exc
    except (smtplib.SMTPException, socket.timeout, OSError) as exc:
        logger.exception("Contact-form SMTP send failed (host may block outbound SMTP)")
        raise EmailServiceError(RETRY_LATER_MESSAGE) from exc


def build_resend_payload(submission: ContactSubmission) -> dict[str, object]:
    """Return the JSON body for Resend's POST /emails endpoint."""
    return {
        "from": build_from_header(submission.name, submission.subject, settings.contact_email_from.strip()),
        "to": [settings.contact_email_to.strip()],
        "subject": build_subject(submission.subject),
        "text": build_body(submission),
        "reply_to": submission.email,
    }


def _raise_for_resend_status(response: httpx.Response) -> None:
    if response.is_success:
        return
    # Resend's error bodies describe the problem (e.g. unverified sender) and
    # contain no secrets, so they are safe and useful to log.
    logger.error("Resend rejected the contact-form email: %s %s", response.status_code, response.text[:500])
    if response.status_code in (401, 403, 422):
        raise EmailServiceError(MISCONFIGURED_MESSAGE)
    raise EmailServiceError(RETRY_LATER_MESSAGE)


def _send_via_resend(submission: ContactSubmission) -> None:
    headers = {"Authorization": f"Bearer {settings.resend_api_key}"}
    try:
        response = httpx.post(
            RESEND_API_URL,
            json=build_resend_payload(submission),
            headers=headers,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except httpx.HTTPError as exc:
        logger.exception("Contact-form request to Resend failed")
        raise EmailServiceError(RETRY_LATER_MESSAGE) from exc
    _raise_for_resend_status(response)


_PROVIDERS = {
    MODE_SMTP: _send_via_smtp,
    MODE_RESEND: _send_via_resend,
}


# --------------------------------------------------------------------------- #
# Public entry point
# --------------------------------------------------------------------------- #


def send_contact_email(*, name: str, email: str, subject: str, message: str) -> bool:
    """Deliver a contact-form message.

    Returns True when the email was handed to a provider, or False in mock
    mode (nothing sent). Raises EmailServiceError (or its subclass
    EmailConfigurationError) when delivery is impossible or fails.
    """
    _ensure_configured()
    mode = get_contact_mode()

    if mode == MODE_MOCK:
        logger.info("Contact-form submission received (mock mode, no email sent)")
        return False

    submission = ContactSubmission(name=name, email=email, subject=subject, message=message)
    _PROVIDERS[mode](submission)
    logger.info("Contact-form email sent via %s", mode)
    return True
