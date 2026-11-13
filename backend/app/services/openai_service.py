"""Chatbot answers: builds the prompt from portfolio content and calls OpenAI (or mock)."""

from __future__ import annotations

import logging

from openai import AsyncOpenAI, OpenAIError

from app.core.config import settings
from app.schemas.chat import ChatMessage
from app.services.chat_content_service import load_chat_content

logger = logging.getLogger("webpf")

# Earlier messages (questions + answers) sent to the model with each question.
MAX_HISTORY_MESSAGES = 10


class ChatServiceError(Exception):
    """Raised when the upstream chat provider fails in an expected way."""


SYSTEM_PROMPT = """You are Ganesh R's portfolio assistant.

Rules:
- Answer ONLY using the portfolio content provided below.
- If the information is not in the portfolio, say: "I don't have that information in Ganesh's portfolio."
- Do not invent employers, dates, skills, projects, or contact details.
- Keep answers concise (2-4 sentences) unless the user asks for more detail.
- For hiring or contact questions, direct visitors to the contact links in the portfolio.
- Be professional, friendly, and helpful.
"""

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    """Create the OpenAI client once and reuse it across requests."""
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=settings.openai_timeout_seconds)
    return _client


def _validate_message(user_message: str) -> str:
    """Strip the message and reject blank input (surfaced as HTTP 400)."""
    message = user_message.strip()
    if not message:
        raise ValueError("Message cannot be empty")
    return message


def _ensure_openai_configured() -> None:
    """Fail fast with a clear message when no API key is set."""
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY is not configured")


def _build_system_content(chat_content: str) -> str:
    """Combine the fixed rules with the portfolio content the bot may use."""
    return (
        f"{SYSTEM_PROMPT}\n\n"
        f"Portfolio content:\n{chat_content or 'No portfolio content provided yet.'}"
    )


def _build_messages(
    chat_content: str,
    history: list[ChatMessage],
    message: str,
) -> list[dict[str, str]]:
    """Assemble system prompt + trimmed history + the new question."""
    messages: list[dict[str, str]] = [
        {"role": "system", "content": _build_system_content(chat_content)},
    ]
    for item in history[-MAX_HISTORY_MESSAGES:]:
        messages.append({"role": item.role, "content": item.content.strip()})
    messages.append({"role": "user", "content": message})
    return messages


def _mock_response(user_message: str, chat_content: str) -> str:
    """Canned reply used when CHAT_MODE=mock (no OpenAI call, no cost)."""
    if chat_content:
        return (
            "Mock chatbot mode is active. "
            "I can confirm I received your question and portfolio content, but OpenAI is not enabled yet. "
            f"You asked: {user_message}"
        )
    return (
        "Mock chatbot mode is active, but no portfolio content has been provided yet. "
        f"You asked: {user_message}"
    )


def build_completion_options() -> dict[str, object]:
    """Model options that work for both reasoning and older chat models.

    ``max_completion_tokens`` replaces the deprecated ``max_tokens`` (which
    reasoning models reject). It goes in ``extra_body`` because the pinned
    openai SDK predates that keyword. Temperature is only sent when configured,
    since reasoning models reject any non-default value.
    """
    options: dict[str, object] = {
        "extra_body": {"max_completion_tokens": settings.openai_max_completion_tokens},
    }
    if settings.openai_temperature is not None:
        options["temperature"] = settings.openai_temperature
    return options


async def _call_openai(messages: list[dict[str, str]]) -> str:
    """Call the chat completions API, translating provider errors."""
    client = _get_client()
    try:
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=messages,
            **build_completion_options(),
        )
    except OpenAIError as exc:
        logger.exception("OpenAI chat completion request failed")
        raise ChatServiceError("The chatbot is temporarily unavailable. Please try again shortly.") from exc

    return _extract_answer(response)


def _extract_answer(response: object) -> str:
    """Pull the answer text out of a completion, with a safe fallback."""
    choice = response.choices[0] if response.choices else None  # type: ignore[attr-defined]
    content = choice.message.content if choice and choice.message else None
    if content:
        return content.strip()
    # Most often finish_reason == "length": the token budget ran out (for a
    # reasoning model, possibly all on hidden reasoning) before any answer.
    logger.warning(
        "OpenAI returned no answer text (finish_reason=%s)",
        getattr(choice, "finish_reason", None),
    )
    return "I could not generate a response. Please try again."


async def generate_chat_response(
    user_message: str,
    history: list[ChatMessage] | None = None,
) -> str:
    """Answer a visitor question from the portfolio content (mock or OpenAI)."""
    message = _validate_message(user_message)
    chat_content = load_chat_content()
    conversation_history = history or []

    if settings.chat_mode.lower() == "mock":
        logger.info("Chat request answered in mock mode")
        return _mock_response(message, chat_content)

    _ensure_openai_configured()
    messages = _build_messages(chat_content, conversation_history, message)
    answer = await _call_openai(messages)
    logger.info("Chat request answered via OpenAI")
    return answer
