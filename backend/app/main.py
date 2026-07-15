from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.routes.chat import limiter, router as chat_router
from app.api.routes.health import router as health_router
from app.api.routes.portfolio import router as portfolio_router
from app.core.config import settings

app = FastAPI(title=settings.app_name, version="1.0.0")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api", tags=["health"])
app.include_router(portfolio_router, prefix="/api", tags=["portfolio"])
app.include_router(chat_router, prefix="/api", tags=["chat"])


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "webpf backend is running"}
