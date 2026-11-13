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


# --------------------------------------------------------------------------- #
# Model options (reasoning models such as gpt-6-luna) and history trimming
# --------------------------------------------------------------------------- #


def test_completion_options_use_max_completion_tokens_and_skip_temperature_by_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(openai_service.settings, "openai_temperature", None)
    monkeypatch.setattr(openai_service.settings, "openai_max_completion_tokens", 2000)

    options = openai_service.build_completion_options()

    assert options == {"extra_body": {"max_completion_tokens": 2000}}
    assert "max_tokens" not in options


def test_completion_options_send_temperature_when_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(openai_service.settings, "openai_temperature", 0.3)

    assert openai_service.build_completion_options()["temperature"] == 0.3


class _FakeCompletions:
    def __init__(self, content: str | None, finish_reason: str = "stop") -> None:
        self.content = content
        self.finish_reason = finish_reason
        self.kwargs: dict = {}

    async def create(self, **kwargs: object) -> object:
        self.kwargs = kwargs
        message = type("Message", (), {"content": self.content})()
        choice = type("Choice", (), {"message": message, "finish_reason": self.finish_reason})()
        return type("Response", (), {"choices": [choice]})()


def _install_fake_client(monkeypatch: pytest.MonkeyPatch, completions: _FakeCompletions) -> None:
    chat = type("Chat", (), {"completions": completions})()
    monkeypatch.setattr(openai_service, "_get_client", lambda: type("Client", (), {"chat": chat})())
    monkeypatch.setattr(openai_service.settings, "chat_mode", "openai")
    monkeypatch.setattr(openai_service.settings, "openai_api_key", "sk-test")


@pytest.mark.asyncio
async def test_openai_call_sends_model_safe_options_and_recent_history(monkeypatch: pytest.MonkeyPatch) -> None:
    completions = _FakeCompletions("Ganesh builds RAG chatbots.")
    _install_fake_client(monkeypatch, completions)
    monkeypatch.setattr(openai_service.settings, "openai_temperature", None)
    history = [ChatMessage(role="user" if i % 2 == 0 else "assistant", content=f"m{i}") for i in range(15)]

    answer = await generate_chat_response("What do you build?", history)

    assert answer == "Ganesh builds RAG chatbots."
    assert "max_tokens" not in completions.kwargs
    assert "temperature" not in completions.kwargs
    assert completions.kwargs["extra_body"] == {"max_completion_tokens": openai_service.settings.openai_max_completion_tokens}
    sent = completions.kwargs["messages"]
    # system prompt + last 10 history messages + the new question
    assert len(sent) == 1 + openai_service.MAX_HISTORY_MESSAGES + 1
    assert sent[1]["content"] == "m5"


@pytest.mark.asyncio
async def test_empty_answer_falls_back_to_a_friendly_message(monkeypatch: pytest.MonkeyPatch) -> None:
    _install_fake_client(monkeypatch, _FakeCompletions(None, finish_reason="length"))

    answer = await generate_chat_response("Tell me everything")

    assert answer == "I could not generate a response. Please try again."


def test_blank_temperature_env_var_means_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import Settings

    monkeypatch.setenv("OPENAI_TEMPERATURE", "")
    assert Settings().openai_temperature is None

    monkeypatch.setenv("OPENAI_TEMPERATURE", "0.3")
    assert Settings().openai_temperature == 0.3
