"""Tests for contact-form email delivery (mock, SMTP and Resend modes)."""

import os
import smtplib

import httpx
import pytest

os.environ["CONTACT_MODE"] = "mock"

from app.core.config import get_settings  # noqa: E402
import app.core.config as config_module  # noqa: E402

get_settings.cache_clear()
config_module.settings = get_settings()

from app.services import email_service  # noqa: E402
from app.services.email_service import (  # noqa: E402
    EmailConfigurationError,
    EmailServiceError,
    find_configuration_problems,
    send_contact_email,
)

VALID_SUBMISSION = {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "subject": "Hello",
    "message": "Test message",
}


def _send(**overrides: str) -> bool:
    return send_contact_email(**{**VALID_SUBMISSION, **overrides})


# --------------------------------------------------------------------------- #
# Fixtures and fakes
# --------------------------------------------------------------------------- #


@pytest.fixture
def mock_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(email_service.settings, "contact_mode", "mock")
    monkeypatch.setattr(email_service.settings, "environment", "development")


@pytest.fixture
def smtp_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(email_service.settings, "contact_mode", "smtp")
    monkeypatch.setattr(email_service.settings, "contact_email_to", "owner@example.org")
    monkeypatch.setattr(email_service.settings, "smtp_user", "sender@example.com")
    monkeypatch.setattr(email_service.settings, "smtp_password", "app-password")


@pytest.fixture
def resend_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(email_service.settings, "contact_mode", "resend")
    monkeypatch.setattr(email_service.settings, "contact_email_to", "owner@example.org")
    monkeypatch.setattr(email_service.settings, "contact_email_from", "onboarding@resend.dev")
    monkeypatch.setattr(email_service.settings, "resend_api_key", "re_test_key")


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


@pytest.fixture
def recording_smtp(monkeypatch: pytest.MonkeyPatch) -> type[_RecordingSMTP]:
    _RecordingSMTP.sent_messages = []
    monkeypatch.setattr(email_service.smtplib, "SMTP", _RecordingSMTP)
    return _RecordingSMTP


class _FakeResend:
    """Records the request sent to Resend and returns a canned response."""

    def __init__(self, status_code: int = 200, raise_error: Exception | None = None) -> None:
        self.status_code = status_code
        self.raise_error = raise_error
        self.calls: list[dict] = []

    def __call__(self, url: str, **kwargs: object) -> httpx.Response:
        self.calls.append({"url": url, **kwargs})
        if self.raise_error:
            raise self.raise_error
        request = httpx.Request("POST", url)
        return httpx.Response(self.status_code, json={"id": "email_123"}, request=request)


# --------------------------------------------------------------------------- #
# Mock mode
# --------------------------------------------------------------------------- #


def test_mock_mode_reports_not_delivered(mock_mode: None) -> None:
    assert _send() is False


def test_mock_mode_is_refused_in_production(mock_mode: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(email_service.settings, "environment", "production")

    with pytest.raises(EmailConfigurationError, match="not configured"):
        _send()


def test_unknown_mode_is_a_configuration_problem(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(email_service.settings, "contact_mode", "carrier-pigeon")

    problems = find_configuration_problems()

    assert len(problems) == 1
    assert "carrier-pigeon" in problems[0]


# --------------------------------------------------------------------------- #
# SMTP mode
# --------------------------------------------------------------------------- #


def test_smtp_requires_credentials(smtp_mode: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(email_service.settings, "smtp_user", "")
    monkeypatch.setattr(email_service.settings, "smtp_password", "")

    with pytest.raises(EmailConfigurationError, match="not configured"):
        _send()


def test_placeholder_recipient_is_rejected(smtp_mode: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(email_service.settings, "contact_email_to", "you@example.com")

    assert "CONTACT_EMAIL_TO is not set to a real address" in find_configuration_problems()
    with pytest.raises(EmailConfigurationError):
        _send()


def test_smtp_translates_auth_error(smtp_mode: None, monkeypatch: pytest.MonkeyPatch) -> None:
    class _RaisingSMTP(_RecordingSMTP):
        def starttls(self) -> None:
            raise smtplib.SMTPAuthenticationError(535, b"Authentication failed")

    monkeypatch.setattr(email_service.smtplib, "SMTP", _RaisingSMTP)

    with pytest.raises(EmailServiceError, match="misconfigured"):
        _send()


def test_smtp_translates_connection_error(smtp_mode: None, monkeypatch: pytest.MonkeyPatch) -> None:
    class _RaisingSMTP:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            raise ConnectionRefusedError("connection refused")

    monkeypatch.setattr(email_service.smtplib, "SMTP", _RaisingSMTP)

    with pytest.raises(EmailServiceError, match="try again"):
        _send()


def test_smtp_sends_and_reports_delivered(smtp_mode: None, recording_smtp: type[_RecordingSMTP]) -> None:
    assert _send() is True

    sent = recording_smtp.sent_messages[0]
    assert sent["To"] == "owner@example.org"
    assert sent["From"] == '"Jane Doe: Hello (via website message)" <sender@example.com>'
    assert sent["Reply-To"] == "jane@example.com"


def test_smtp_sanitizes_a_name_with_embedded_newlines(smtp_mode: None, recording_smtp: type[_RecordingSMTP]) -> None:
    _send(name="Evil\r\nBcc: attacker@example.com")

    sent = recording_smtp.sent_messages[0]
    assert "\n" not in sent["From"] and "\r" not in sent["From"]
    assert sent["From"] == '"Evil Bcc: attacker@example.com: Hello (via website message)" <sender@example.com>'


def test_smtp_sanitizes_a_subject_with_embedded_newlines(
    smtp_mode: None, recording_smtp: type[_RecordingSMTP]
) -> None:
    _send(subject="Evil\r\nBcc: attacker@example.com")

    sent = recording_smtp.sent_messages[0]
    assert "\n" not in sent["Subject"] and "\r" not in sent["Subject"]
    assert sent["From"] == '"Jane Doe: Evil Bcc: attacker@example.com (via website message)" <sender@example.com>'
    assert sent["Subject"] == "[Portfolio Contact] Evil Bcc: attacker@example.com"


def test_smtp_falls_back_to_generic_name_and_subject(
    smtp_mode: None, recording_smtp: type[_RecordingSMTP]
) -> None:
    _send(name="   ", subject="   ")

    sent = recording_smtp.sent_messages[0]
    assert sent["Subject"] == "[Portfolio Contact] No subject"
    assert sent["From"] == '"Portfolio visitor: No subject (via website message)" <sender@example.com>'


# --------------------------------------------------------------------------- #
# Resend mode
# --------------------------------------------------------------------------- #


def test_resend_requires_api_key(resend_mode: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(email_service.settings, "resend_api_key", "")

    with pytest.raises(EmailConfigurationError, match="not configured"):
        _send()


def test_resend_sends_expected_request(resend_mode: None, monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeResend()
    monkeypatch.setattr(email_service.httpx, "post", fake)

    assert _send() is True

    call = fake.calls[0]
    assert call["url"] == "https://api.resend.com/emails"
    assert call["headers"] == {"Authorization": "Bearer re_test_key"}
    payload = call["json"]
    assert payload["to"] == ["owner@example.org"]
    assert payload["reply_to"] == "jane@example.com"
    assert payload["from"] == '"Jane Doe: Hello (via website message)" <onboarding@resend.dev>'
    assert payload["subject"] == "[Portfolio Contact] Hello"
    assert "Test message" in payload["text"]


@pytest.mark.parametrize("status_code", [401, 403, 422])
def test_resend_rejection_is_reported_as_misconfigured(
    resend_mode: None, monkeypatch: pytest.MonkeyPatch, status_code: int
) -> None:
    monkeypatch.setattr(email_service.httpx, "post", _FakeResend(status_code=status_code))

    with pytest.raises(EmailServiceError, match="misconfigured"):
        _send()


def test_resend_server_error_asks_visitor_to_retry(resend_mode: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(email_service.httpx, "post", _FakeResend(status_code=500))

    with pytest.raises(EmailServiceError, match="try again"):
        _send()


def test_resend_network_error_asks_visitor_to_retry(resend_mode: None, monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeResend(raise_error=httpx.ConnectTimeout("timed out"))
    monkeypatch.setattr(email_service.httpx, "post", fake)

    with pytest.raises(EmailServiceError, match="try again"):
        _send()
