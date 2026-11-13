"""Chatbot endpoint and the shared rate limiter."""

from fastapi import APIRouter, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings
from app.core.errors import raise_bad_request, raise_service_unavailable
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.openai_service import ChatServiceError, generate_chat_response

router = APIRouter()
# Shared per-IP rate limiter (also used by the contact route).
limiter = Limiter(key_func=get_remote_address)


@router.post("/chat", response_model=ChatResponse)
@limiter.limit(f"{settings.chat_rate_limit}/minute")
async def chat(request: Request, body: ChatRequest) -> ChatResponse:
    """Answer a visitor question about the portfolio; 503 if the LLM is down."""
    try:
        answer = await generate_chat_response(body.message, body.history)
    except ValueError as exc:
        raise_bad_request(exc)
    except ChatServiceError as exc:
        raise_service_unavailable(exc)

    return ChatResponse(answer=answer)
