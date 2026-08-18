import os

import pytest

os.environ["CHAT_MODE"] = "mock"

from app.core.config import get_settings
import app.core.config as config_module

get_settings.cache_clear()
config_module.settings = get_settings()

from app.schemas.chat import ChatMessage
from app.services import openai_service
from app.services.openai_service import ChatServiceError, generate_chat_response


@pytest.mark.asyncio
async def test_generate_chat_response_rejects_empty_message() -> None:
    with pytest.raises(ValueError, match="cannot be empty"):
        await generate_chat_response("   ")


@pytest.mark.asyncio
async def test_generate_chat_response_mock_mode_echoes_question(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(openai_service.settings, "chat_mode", "mock")

    answer = await generate_chat_response("What are your skills?")

    assert "What are your skills?" in answer


@pytest.mark.asyncio
async def test_generate_chat_response_requires_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(openai_service.settings, "chat_mode", "openai")
    monkeypatch.setattr(openai_service.settings, "openai_api_key", "")

    with pytest.raises(ValueError, match="OPENAI_API_KEY"):
        await generate_chat_response("Hello")


@pytest.mark.asyncio
async def test_generate_chat_response_translates_provider_error(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx
    from openai import APIConnectionError

    monkeypatch.setattr(openai_service.settings, "chat_mode", "openai")
    monkeypatch.setattr(openai_service.settings, "openai_api_key", "test-key")

    class _RaisingCompletions:
        async def create(self, **_kwargs: object) -> None:
            request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
            raise APIConnectionError(request=request)

    class _RaisingChat:
        completions = _RaisingCompletions()

    class _RaisingClient:
        chat = _RaisingChat()

    monkeypatch.setattr(openai_service, "_get_client", lambda: _RaisingClient())

    with pytest.raises(ChatServiceError, match="temporarily unavailable"):
        await generate_chat_response("Hello")
