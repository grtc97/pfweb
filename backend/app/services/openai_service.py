from __future__ import annotations

import logging

from openai import AsyncOpenAI, OpenAIError

from app.core.config import settings
from app.schemas.chat import ChatMessage
from app.services.chat_content_service import load_chat_content

logger = logging.getLogger("webpf")

MAX_HISTORY_TURNS = 10


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
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=30.0)
    return _client


def _validate_message(user_message: str) -> str:
    message = user_message.strip()
    if not message:
        raise ValueError("Message cannot be empty")
    return message


def _ensure_openai_configured() -> None:
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY is not configured")


def _build_system_content(chat_content: str) -> str:
    return (
        f"{SYSTEM_PROMPT}\n\n"
        f"Portfolio content:\n{chat_content or 'No portfolio content provided yet.'}"
    )


def _build_messages(
    chat_content: str,
    history: list[ChatMessage],
    message: str,
) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = [
        {"role": "system", "content": _build_system_content(chat_content)},
    ]
    for item in history[-MAX_HISTORY_TURNS:]:
        messages.append({"role": item.role, "content": item.content.strip()})
    messages.append({"role": "user", "content": message})
    return messages


def _mock_response(user_message: str, chat_content: str) -> str:
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


async def _call_openai(messages: list[dict[str, str]]) -> str:
    client = _get_client()
    try:
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=messages,
            temperature=0.3,
            max_tokens=500,
        )
    except OpenAIError as exc:
        logger.exception("OpenAI chat completion request failed")
        raise ChatServiceError("The chatbot is temporarily unavailable. Please try again shortly.") from exc

    return _extract_answer(response)


def _extract_answer(response: object) -> str:
    choice = response.choices[0] if response.choices else None  # type: ignore[attr-defined]
    content = choice.message.content if choice and choice.message else None
    if content:
        return content.strip()
    return "I could not generate a response. Please try again."


async def generate_chat_response(
    user_message: str,
    history: list[ChatMessage] | None = None,
) -> str:
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
