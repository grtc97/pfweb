import os

from fastapi.testclient import TestClient

os.environ["CHAT_MODE"] = "mock"

from app.core.config import get_settings
import app.core.config as config_module

get_settings.cache_clear()
config_module.settings = get_settings()

from app.main import app
from app.services.portfolio_service import load_portfolio

load_portfolio.cache_clear()

client = TestClient(app)


def test_health_check() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] in {"ok", "degraded"}
    assert payload["chat_mode"] == "mock"
    assert payload["portfolio_loaded"] is True


def test_get_portfolio() -> None:
    response = client.get("/api/portfolio")
    assert response.status_code == 200
    payload = response.json()
    assert payload["name"] == "Ganesh R"
    assert isinstance(payload["skills"], list)


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
