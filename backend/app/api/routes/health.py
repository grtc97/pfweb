from fastapi import APIRouter

from app.core.config import settings
from app.services.portfolio_service import load_portfolio_content, portfolio_content_exists

router = APIRouter()


@router.get("/health")
def health_check() -> dict[str, str | bool]:
    portfolio_loaded = bool(load_portfolio_content())
    openai_configured = bool(settings.openai_api_key) or settings.chat_mode.lower() == "mock"

    return {
        "status": "ok" if portfolio_loaded and openai_configured else "degraded",
        "chat_mode": settings.chat_mode,
        "portfolio_loaded": portfolio_loaded,
        "portfolio_file_exists": portfolio_content_exists(),
        "openai_configured": openai_configured,
    }
