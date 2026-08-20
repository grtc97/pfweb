import logging
import smtplib
import socket
from email.message import EmailMessage
from email.utils import formataddr

from app.core.config import settings

logger = logging.getLogger("webpf")


class EmailServiceError(Exception):
    """Raised when sending the contact-form email fails in an expected way."""


def _sanitize_header_value(value: str, fallback: str) -> str:
    # Visitor-supplied text lands in headers (From, Subject), not just the
    # body, so collapse any embedded newlines/control whitespace before it's
    # used — otherwise a crafted value could break header folding or inject
    # content.
    sanitized = " ".join(value.split())
    return sanitized or fallback


def _ensure_smtp_configured() -> None:
    if not settings.smtp_user or not settings.smtp_password:
        raise ValueError("Email delivery is not configured on the server.")


def _build_from_header(name: str, subject: str) -> str:
    safe_name = _sanitize_header_value(name, "Portfolio visitor")
    safe_subject = _sanitize_header_value(subject, "No subject")
    return formataddr((f"{safe_name}: {safe_subject} (via website message)", settings.smtp_user))


def _build_message(*, name: str, email: str, subject: str, message: str) -> EmailMessage:
    safe_subject = _sanitize_header_value(subject, "No subject")

    mail = EmailMessage()
    mail["Subject"] = f"[Portfolio Contact] {safe_subject}"
    # Shows the visitor's name and subject in the "From" display (e.g.
    # `"Jane Doe: Freelance inquiry (via website message)" <smtp_user>`),
    # while the actual sending address stays smtp_user — email providers
    # reject/flag a "From" address that isn't the authenticated account, so
    # the address itself can't be the visitor's.
    mail["From"] = _build_from_header(name, subject)
    mail["To"] = settings.contact_email_to
    mail["Reply-To"] = email
    mail.set_content(
        "\n".join(
            [
                "New message from your portfolio contact form.",
                "",
                f"Name: {name}",
                f"Email: {email}",
                f"Subject: {subject}",
                "",
                "Message:",
                message,
            ]
        )
    )
    return mail


def _send_via_smtp(mail: EmailMessage) -> None:
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(mail)
    except smtplib.SMTPAuthenticationError as exc:
        logger.exception("Contact-form SMTP authentication failed")
        raise EmailServiceError("Email delivery is misconfigured on the server.") from exc
    except (smtplib.SMTPException, socket.timeout, OSError) as exc:
        logger.exception("Contact-form SMTP send failed")
        raise EmailServiceError("Unable to send your message right now. Please try again shortly.") from exc


def send_contact_email(*, name: str, email: str, subject: str, message: str) -> None:
    if settings.contact_mode == "mock":
        logger.info("Contact-form submission received (mock mode, not sent)")
        return

    _ensure_smtp_configured()
    mail = _build_message(name=name, email=email, subject=subject, message=message)
    _send_via_smtp(mail)
    logger.info("Contact-form email sent successfully")
