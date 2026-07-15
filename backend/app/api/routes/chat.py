from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.openai_service import generate_chat_response

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.post("/chat", response_model=ChatResponse)
@limiter.limit(f"{settings.chat_rate_limit}/minute")
async def chat(request: Request, body: ChatRequest) -> ChatResponse:
    try:
        answer = await generate_chat_response(body.message, body.history)
        return ChatResponse(answer=answer)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive guard for runtime failures
        raise HTTPException(status_code=500, detail="Chatbot request failed") from exc
