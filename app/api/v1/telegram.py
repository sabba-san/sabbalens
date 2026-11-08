from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import app.services.telegram as telegram

router = APIRouter(prefix="/telegram", tags=["telegram"])


class TestMessageRequest(BaseModel):
    text: Optional[str] = "Hello from Sabbalens! 🚀 Photo pipeline is connected."


@router.get("/status")
def telegram_status():
    """Return live / simulation connection status for Telegram bot."""
    return telegram.get_telegram_status()


@router.post("/test")
def telegram_test(body: Optional[TestMessageRequest] = None):
    """Send a test message to the configured Telegram chat/channel."""
    text = (body.text if body and body.text else "Hello from Sabbalens! 🚀 Photo pipeline is connected.")
    try:
        return telegram.send_test_message(text=text)
    except telegram.TelegramError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

