"""End-to-end API tests using FastAPI's TestClient (chat in mock mode)."""

import os

import pytest
from fastapi.testclient import TestClient

os.environ["CHAT_MODE"] = "mock"

from app.core.config import get_settings
import app.core.config as config_module

get_settings.cache_clear()
config_module.settings = get_settings()

from app.main import app
import app.api.routes.chat as chat_routes
import app.api.routes.contact as contact_routes
from app.services.email_service import EmailServiceError
from app.services.openai_service import ChatServiceError

client = TestClient(app)


def test_health_check() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] in {"ok", "degraded"}
    assert payload["chat_mode"] == "mock"
    assert payload["chat_content_loaded"] is True
    assert "contact_mode" in payload
    assert isinstance(payload["contact_configured"], bool)


def test_chat_mock_mode() -> None:
    response = client.post(
        "/api/chat",
        json={"message": "Tell me about your skills", "history": []},
    )
    assert response.status_code == 200
    payload = response.json()
    assert "answer" in payload
    assert payload["answer"]


def test_chat_rejects_empty_message() -> None:
    response = client.post("/api/chat", json={"message": "   ", "history": []})
    assert response.status_code == 400


def test_chat_rejects_message_too_long() -> None:
    response = client.post(
        "/api/chat",
        json={"message": "x" * 4001, "history": []},
    )
    assert response.status_code == 422


def test_chat_accepts_a_long_conversation_by_keeping_recent_history(monkeypatch: pytest.MonkeyPatch) -> None:
    # Regression: ~10 questions used to fail with "List should have at most 20
    # items after validation, not 21" because the full history was rejected.
    received: dict = {}

    async def _capture(message: str, history: list) -> str:
        received["history"] = history
        return "ok"

    monkeypatch.setattr(chat_routes, "generate_chat_response", _capture)
    history = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"m{i}"} for i in range(31)]

    response = client.post("/api/chat", json={"message": "Next question", "history": history})

    assert response.status_code == 200
    assert len(received["history"]) == 20
    assert received["history"][-1].content == "m30"


def test_chat_rejects_missing_message_field() -> None:
    response = client.post("/api/chat", json={"history": []})
    assert response.status_code == 422


def test_chat_returns_503_when_provider_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _raise_chat_service_error(*_args: object, **_kwargs: object) -> str:
        raise ChatServiceError("The chatbot is temporarily unavailable. Please try again shortly.")

    monkeypatch.setattr(chat_routes, "generate_chat_response", _raise_chat_service_error)

    response = client.post("/api/chat", json={"message": "Hello", "history": []})
    assert response.status_code == 503
    assert "temporarily unavailable" in response.json()["detail"]


def test_contact_form_mock_mode_does_not_claim_delivery(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(contact_routes, "send_contact_email", lambda **_kwargs: False)

    response = client.post(
        "/api/contact",
        json={
            "name": "Jane Doe",
            "email": "jane@example.com",
            "subject": "Freelance inquiry",
            "message": "I would like to discuss a project with you.",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["delivered"] is False
    assert "no email was sent" in payload["message"]


def test_contact_form_reports_success_when_delivered(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(contact_routes, "send_contact_email", lambda **_kwargs: True)

    response = client.post(
        "/api/contact",
        json={
            "name": "Jane Doe",
            "email": "jane@example.com",
            "subject": "Hello",
            "message": "Test message",
        },
    )
    assert response.status_code == 200
    assert response.json() == {"message": "Your message has been sent successfully.", "delivered": True}


def test_contact_rejects_invalid_email() -> None:
    response = client.post(
        "/api/contact",
        json={
            "name": "Jane Doe",
            "email": "not-an-email",
            "subject": "Hello",
            "message": "Test message",
        },
    )
    assert response.status_code == 422


def test_contact_rejects_missing_fields() -> None:
    response = client.post("/api/contact", json={"name": "Jane Doe"})
    assert response.status_code == 422


def test_contact_returns_503_when_email_delivery_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    def _raise_email_service_error(**_kwargs: object) -> None:
        raise EmailServiceError("Unable to send your message right now. Please try again shortly.")

    monkeypatch.setattr(contact_routes, "send_contact_email", _raise_email_service_error)

    response = client.post(
        "/api/contact",
        json={
            "name": "Jane Doe",
            "email": "jane@example.com",
            "subject": "Hello",
            "message": "Test message",
        },
    )
    assert response.status_code == 503
    assert "try again" in response.json()["detail"]


def test_unhandled_exception_returns_json_error(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _raise_unexpected_error(*_args: object, **_kwargs: object) -> str:
        raise RuntimeError("boom")

    monkeypatch.setattr(chat_routes, "generate_chat_response", _raise_unexpected_error)

    # A real client never sees a Python traceback: the global handler turns any
    # unhandled exception into a plain JSON 500. TestClient re-raises by default
    # for debuggability, so this check needs raise_server_exceptions=False to see
    # what an actual browser would receive.
    lenient_client = TestClient(app, raise_server_exceptions=False)
    response = lenient_client.post("/api/chat", json={"message": "Hello", "history": []})
    assert response.status_code == 500
    assert response.headers["content-type"].startswith("application/json")
    assert response.json() == {"detail": "Internal server error"}
