import os
import smtplib

import pytest

from app.core.config import get_settings
import app.core.config as config_module
from app.services.email_service import EmailServiceError, send_contact_email

os.environ["CONTACT_MODE"] = "mock"

get_settings.cache_clear()
config_module.settings = get_settings()


def test_send_contact_email_mock_mode() -> None:
    send_contact_email(
        name="Jane Doe",
        email="jane@example.com",
        subject="Hello",
        message="Test message",
    )


def test_send_contact_email_requires_smtp_config(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import email_service

    monkeypatch.setattr(email_service.settings, "contact_mode", "smtp")
    monkeypatch.setattr(email_service.settings, "smtp_user", "")
    monkeypatch.setattr(email_service.settings, "smtp_password", "")

    with pytest.raises(ValueError, match="not configured"):
        send_contact_email(
            name="Jane Doe",
            email="jane@example.com",
            subject="Hello",
            message="Test message",
        )


def test_send_contact_email_translates_auth_error(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import email_service

    monkeypatch.setattr(email_service.settings, "contact_mode", "smtp")
    monkeypatch.setattr(email_service.settings, "smtp_user", "sender@example.com")
    monkeypatch.setattr(email_service.settings, "smtp_password", "app-password")

    class _RaisingSMTP:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            pass

        def __enter__(self) -> "_RaisingSMTP":
            return self

        def __exit__(self, *_exc_info: object) -> None:
            return None

        def starttls(self) -> None:
            raise smtplib.SMTPAuthenticationError(535, b"Authentication failed")

    monkeypatch.setattr(email_service.smtplib, "SMTP", _RaisingSMTP)

    with pytest.raises(EmailServiceError, match="misconfigured"):
        send_contact_email(
            name="Jane Doe",
            email="jane@example.com",
            subject="Hello",
            message="Test message",
        )


def test_send_contact_email_translates_connection_error(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import email_service

    monkeypatch.setattr(email_service.settings, "contact_mode", "smtp")
    monkeypatch.setattr(email_service.settings, "smtp_user", "sender@example.com")
    monkeypatch.setattr(email_service.settings, "smtp_password", "app-password")

    class _RaisingSMTP:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            raise ConnectionRefusedError("connection refused")

    monkeypatch.setattr(email_service.smtplib, "SMTP", _RaisingSMTP)

    with pytest.raises(EmailServiceError, match="try again"):
        send_contact_email(
            name="Jane Doe",
            email="jane@example.com",
            subject="Hello",
            message="Test message",
        )
