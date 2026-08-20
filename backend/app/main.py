import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.routes.chat import limiter, router as chat_router
from app.api.routes.contact import router as contact_router
from app.api.routes.health import router as health_router
from app.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("webpf")


def _register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})


def _register_middleware(app: FastAPI) -> None:
    app.add_middleware(SlowAPIMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


def _register_routes(app: FastAPI) -> None:
    app.include_router(health_router, prefix="/api", tags=["health"])
    app.include_router(chat_router, prefix="/api", tags=["chat"])
    app.include_router(contact_router, prefix="/api", tags=["contact"])

    @app.get("/")
    def root() -> dict[str, str]:
        return {"message": "webpf backend is running"}


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, version="1.0.0")
    app.state.limiter = limiter

    _register_error_handlers(app)
    _register_middleware(app)
    _register_routes(app)

    logger.info("%s started (chat_mode=%s, contact_mode=%s)", settings.app_name, settings.chat_mode, settings.contact_mode)
    return app


app = create_app()
