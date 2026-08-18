from fastapi import APIRouter, HTTPException, Request

from app.api.routes.chat import limiter
from app.core.config import settings
from app.schemas.contact import ContactRequest, ContactResponse
from app.services.email_service import EmailServiceError, send_contact_email

router = APIRouter()


@router.post("/contact", response_model=ContactResponse)
@limiter.limit(f"{settings.contact_rate_limit}/minute")
async def contact(request: Request, body: ContactRequest) -> ContactResponse:
    try:
        send_contact_email(
            name=body.name.strip(),
            email=str(body.email),
            subject=body.subject.strip(),
            message=body.message.strip(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except EmailServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return ContactResponse(message="Your message has been sent successfully.")
