from __future__ import annotations

from openai import AsyncOpenAI

from app.core.config import settings
from app.schemas.chat import ChatMessage
from app.services.portfolio_service import load_portfolio_content

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


def _build_system_content(portfolio_content: str) -> str:
    return (
        f"{SYSTEM_PROMPT}\n\n"
        f"Portfolio content:\n{portfolio_content or 'No portfolio content provided yet.'}"
    )


def _mock_response(user_message: str, portfolio_content: str) -> str:
    if portfolio_content:
        return (
            "Mock chatbot mode is active. "
            "I can confirm I received your question and portfolio content, but OpenAI is not enabled yet. "
            f"You asked: {user_message}"
        )
    return (
        "Mock chatbot mode is active, but no portfolio content has been provided yet. "
        f"You asked: {user_message}"
    )


async def generate_chat_response(
    user_message: str,
    history: list[ChatMessage] | None = None,
) -> str:
    message = user_message.strip()
    if not message:
        raise ValueError("Message cannot be empty")

    portfolio_content = load_portfolio_content()
    conversation_history = history or []

    if settings.chat_mode.lower() == "mock":
        return _mock_response(message, portfolio_content)

    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY is not configured")

    messages: list[dict[str, str]] = [
        {"role": "system", "content": _build_system_content(portfolio_content)},
    ]

    for item in conversation_history[-10:]:
        messages.append({"role": item.role, "content": item.content.strip()})

    messages.append({"role": "user", "content": message})

    client = _get_client()
    response = await client.chat.completions.create(
        model=settings.openai_model,
        messages=messages,
        temperature=0.3,
        max_tokens=500,
    )

    choice = response.choices[0] if response.choices else None
    content = choice.message.content if choice and choice.message else None
    if content:
        return content.strip()

    return "I could not generate a response. Please try again."
