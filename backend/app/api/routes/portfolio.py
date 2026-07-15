from fastapi import APIRouter

from app.schemas.portfolio import Portfolio
from app.services.portfolio_service import load_portfolio

router = APIRouter()


@router.get("/portfolio", response_model=Portfolio)
def get_portfolio() -> Portfolio:
    return load_portfolio()
