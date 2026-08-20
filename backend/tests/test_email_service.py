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


class _RecordingSMTP:
    """Fake SMTP server that succeeds and records the message it was asked to send."""

    sent_messages: list = []

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        pass

    def __enter__(self) -> "_RecordingSMTP":
        return self

    def __exit__(self, *_exc_info: object) -> None:
        return None

    def starttls(self) -> None:
        pass

    def login(self, *_args: object, **_kwargs: object) -> None:
        pass

    def send_message(self, mail: object) -> None:
        _RecordingSMTP.sent_messages.append(mail)


def test_send_contact_email_shows_visitor_name_in_from_but_keeps_reply_to_theirs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services import email_service

    monkeypatch.setattr(email_service.settings, "contact_mode", "smtp")
    monkeypatch.setattr(email_service.settings, "smtp_user", "sender@example.com")
    monkeypatch.setattr(email_service.settings, "smtp_password", "app-password")
    _RecordingSMTP.sent_messages = []
    monkeypatch.setattr(email_service.smtplib, "SMTP", _RecordingSMTP)

    send_contact_email(
        name="Jane Doe",
        email="jane@example.com",
        subject="Hello",
        message="Test message",
    )

    sent = _RecordingSMTP.sent_messages[0]
    assert sent["From"] == '"Jane Doe: Hello (via website message)" <sender@example.com>'
    assert sent["Reply-To"] == "jane@example.com"


def test_send_contact_email_sanitizes_a_name_with_embedded_newlines(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import email_service

    monkeypatch.setattr(email_service.settings, "contact_mode", "smtp")
    monkeypatch.setattr(email_service.settings, "smtp_user", "sender@example.com")
    monkeypatch.setattr(email_service.settings, "smtp_password", "app-password")
    _RecordingSMTP.sent_messages = []
    monkeypatch.setattr(email_service.smtplib, "SMTP", _RecordingSMTP)

    send_contact_email(
        name="Evil\r\nBcc: attacker@example.com",
        email="jane@example.com",
        subject="Hello",
        message="Test message",
    )

    sent = _RecordingSMTP.sent_messages[0]
    assert "\n" not in sent["From"]
    assert "\r" not in sent["From"]
    assert sent["From"] == '"Evil Bcc: attacker@example.com: Hello (via website message)" <sender@example.com>'


def test_send_contact_email_sanitizes_a_subject_with_embedded_newlines(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import email_service

    monkeypatch.setattr(email_service.settings, "contact_mode", "smtp")
    monkeypatch.setattr(email_service.settings, "smtp_user", "sender@example.com")
    monkeypatch.setattr(email_service.settings, "smtp_password", "app-password")
    _RecordingSMTP.sent_messages = []
    monkeypatch.setattr(email_service.smtplib, "SMTP", _RecordingSMTP)

    send_contact_email(
        name="Jane Doe",
        email="jane@example.com",
        subject="Evil\r\nBcc: attacker@example.com",
        message="Test message",
    )

    sent = _RecordingSMTP.sent_messages[0]
    assert "\n" not in sent["From"]
    assert "\r" not in sent["From"]
    assert "\n" not in sent["Subject"]
    assert "\r" not in sent["Subject"]
    assert sent["From"] == '"Jane Doe: Evil Bcc: attacker@example.com (via website message)" <sender@example.com>'
    assert sent["Subject"] == "[Portfolio Contact] Evil Bcc: attacker@example.com"


def test_send_contact_email_falls_back_to_a_generic_name_when_blank(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import email_service

    monkeypatch.setattr(email_service.settings, "contact_mode", "smtp")
    monkeypatch.setattr(email_service.settings, "smtp_user", "sender@example.com")
    monkeypatch.setattr(email_service.settings, "smtp_password", "app-password")
    _RecordingSMTP.sent_messages = []
    monkeypatch.setattr(email_service.smtplib, "SMTP", _RecordingSMTP)

    send_contact_email(
        name="   ",
        email="jane@example.com",
        subject="Hello",
        message="Test message",
    )

    sent = _RecordingSMTP.sent_messages[0]
    assert sent["From"] == '"Portfolio visitor: Hello (via website message)" <sender@example.com>'


def test_send_contact_email_falls_back_to_a_generic_subject_when_blank(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import email_service

    monkeypatch.setattr(email_service.settings, "contact_mode", "smtp")
    monkeypatch.setattr(email_service.settings, "smtp_user", "sender@example.com")
    monkeypatch.setattr(email_service.settings, "smtp_password", "app-password")
    _RecordingSMTP.sent_messages = []
    monkeypatch.setattr(email_service.smtplib, "SMTP", _RecordingSMTP)

    send_contact_email(
        name="Jane Doe",
        email="jane@example.com",
        subject="   ",
        message="Test message",
    )

    sent = _RecordingSMTP.sent_messages[0]
    assert sent["Subject"] == "[Portfolio Contact] No subject"
    assert sent["From"] == '"Jane Doe: No subject (via website message)" <sender@example.com>'
