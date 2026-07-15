from functools import lru_cache
from pathlib import Path

from app.core.config import BACKEND_ROOT, settings
from app.schemas.portfolio import Portfolio
from app.services.portfolio_parser import parse_portfolio_markdown


def _resolve_content_path() -> Path:
    configured = Path(settings.portfolio_content_path)
    if configured.is_absolute():
        return configured
    return BACKEND_ROOT / configured


def load_portfolio_content() -> str:
    content_path = _resolve_content_path()
    if not content_path.exists():
        return ""
    return content_path.read_text(encoding="utf-8").strip()


def portfolio_content_exists() -> bool:
    return _resolve_content_path().exists()


@lru_cache
def load_portfolio() -> Portfolio:
    content = load_portfolio_content()
    if not content:
        return Portfolio(
            name="Portfolio Owner",
            title="",
            location="",
            summary=[],
            skills=[],
            experience=[],
            education=[],
            projects=[],
            honors=[],
            contact_links=[],
            contact_note="",
        )
    return parse_portfolio_markdown(content)


def clear_portfolio_cache() -> None:
    load_portfolio.cache_clear()
