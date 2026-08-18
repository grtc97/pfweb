import smtplib
import socket
from email.message import EmailMessage

from app.core.config import settings


class EmailServiceError(Exception):
    """Raised when sending the contact-form email fails in an expected way."""


def send_contact_email(*, name: str, email: str, subject: str, message: str) -> None:
    if settings.contact_mode == "mock":
        return

    if not settings.smtp_user or not settings.smtp_password:
        raise ValueError("Email delivery is not configured on the server.")

    mail = EmailMessage()
    mail["Subject"] = f"[Portfolio Contact] {subject}"
    mail["From"] = settings.smtp_user
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

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(mail)
    except smtplib.SMTPAuthenticationError as exc:
        raise EmailServiceError("Email delivery is misconfigured on the server.") from exc
    except (smtplib.SMTPException, socket.timeout, OSError) as exc:
        raise EmailServiceError("Unable to send your message right now. Please try again shortly.") from exc
