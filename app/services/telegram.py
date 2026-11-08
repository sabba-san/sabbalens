import html
import logging
import mimetypes
import os
import secrets
from pathlib import Path
from typing import Any, Optional

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)

TELEGRAM_API = "https://api.telegram.org"
PUBLISHABLE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


class TelegramError(RuntimeError):
    """Raised when a Telegram operation fails."""


def escape_html(text: Optional[str]) -> str:
    if not text:
        return ""
    return html.escape(str(text))


def format_caption(
    *,
    custom_caption: Optional[str] = None,
    location_name: Optional[str] = None,
    camera: Optional[str] = None,
    lens: Optional[str] = None,
    focal_length: Optional[str] = None,
    aperture: Optional[str] = None,
    exposure_time: Optional[str] = None,
    iso: Optional[int] = None,
    max_length: int = 1024,
) -> str:
    """Format an informative photo caption with location pin and camera shooting specs."""
    sections: list[str] = []

    if custom_caption and custom_caption.strip():
        sections.append(custom_caption.strip())

    meta_lines: list[str] = []
    if location_name and location_name.strip():
        meta_lines.append(f"📍 {escape_html(location_name.strip())}")

    gear_parts: list[str] = []
    if camera and camera.strip():
        gear_parts.append(escape_html(camera.strip()))
    if lens and lens.strip():
        gear_parts.append(escape_html(lens.strip()))
    if gear_parts:
        meta_lines.append(f"📷 {' • '.join(gear_parts)}")

    specs: list[str] = []
    if focal_length and focal_length.strip():
        specs.append(escape_html(focal_length.strip()))
    if aperture and aperture.strip():
        specs.append(f"f/{escape_html(aperture.strip())}")
    if exposure_time and exposure_time.strip():
        specs.append(f"{escape_html(exposure_time.strip())}s")
    if iso is not None:
        specs.append(f"ISO {iso}")
    if specs:
        meta_lines.append(f"⚙️ {' | '.join(specs)}")

    if meta_lines:
        sections.append("\n".join(meta_lines))

    full_caption = "\n\n".join(sections)
    if len(full_caption) > max_length:
        return full_caption[: max_length - 3] + "..."
    return full_caption


def get_telegram_status() -> dict[str, Any]:
    """Return live / simulation connection status for Telegram bot."""
    token = settings.telegram_bot_token
    chat_id = settings.telegram_chat_id

    has_creds = bool(token and chat_id)
    if not has_creds:
        return {
            "connected": False,
            "mode": "simulation" if settings.simulate_social_publish else "disconnected",
            "bot_username": None,
            "chat_id": chat_id,
        }

    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(f"{TELEGRAM_API}/bot{token}/getMe")
            if resp.status_code == 200:
                data = resp.json().get("result", {})
                return {
                    "connected": True,
                    "mode": "live",
                    "bot_username": data.get("username"),
                    "bot_name": data.get("first_name"),
                    "chat_id": chat_id,
                }
            return {
                "connected": False,
                "mode": "error",
                "error": f"Telegram API error ({resp.status_code}): {resp.text}",
                "chat_id": chat_id,
            }
    except Exception as exc:
        log.warning("Telegram status check failed: %s", exc)
        return {
            "connected": False,
            "mode": "error",
            "error": str(exc),
            "chat_id": chat_id,
        }


def send_test_message(text: str = "Hello from Sabbalens! 🚀 Photo pipeline is connected.") -> dict[str, Any]:
    """Send a test message to the configured Telegram chat."""
    token = settings.telegram_bot_token
    chat_id = settings.telegram_chat_id

    if not token or not chat_id:
        if settings.simulate_social_publish:
            sim_id = secrets.randbelow(900000) + 100000
            log.info("Simulated Telegram test message -> message id %s", sim_id)
            return {"ok": True, "simulated": True, "message_id": sim_id}
        raise TelegramError("Telegram bot token or chat ID is not configured.")

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                f"{TELEGRAM_API}/bot{token}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": text,
                    "parse_mode": settings.telegram_parse_mode,
                },
            )
            if resp.status_code >= 400:
                raise TelegramError(f"Test message failed ({resp.status_code}): {resp.text}")
            return resp.json()
    except httpx.HTTPError as exc:
        raise TelegramError(f"HTTP error communicating with Telegram: {exc}") from exc


def publish_to_telegram(
    *,
    file_path: str,
    caption: Optional[str] = None,
    photo_obj: Any = None,
) -> str:
    """Publish a photo directly to Telegram via sendPhoto. Returns telegram message_id string."""
    path = Path(file_path)
    if path.suffix.lower() not in PUBLISHABLE_EXTENSIONS:
        raise TelegramError(f"Unsupported format: {path.suffix or 'none'}")

    if not path.exists():
        raise TelegramError(f"File not found on disk: {file_path}")

    token = settings.telegram_bot_token
    chat_id = settings.telegram_chat_id

    # Simulation fallback
    if not token or not chat_id:
        if settings.simulate_social_publish:
            simulated_id = f"sim_tele_{secrets.token_hex(8)}"
            log.info("Simulated Telegram publish for '%s' -> message id %s", file_path, simulated_id)
            return simulated_id
        raise TelegramError(
            "Telegram bot not configured - set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env"
        )

    # Format caption with metadata if photo model object is provided
    if photo_obj is not None:
        formatted_caption = format_caption(
            custom_caption=caption if caption is not None else getattr(photo_obj, "caption", None),
            location_name=getattr(photo_obj, "location_name", None),
            camera=getattr(photo_obj, "camera", None),
            lens=getattr(photo_obj, "lens", None),
            focal_length=getattr(photo_obj, "focal_length", None),
            aperture=getattr(photo_obj, "aperture", None),
            exposure_time=getattr(photo_obj, "exposure_time", None),
            iso=getattr(photo_obj, "iso", None),
        )
    else:
        formatted_caption = caption or ""

    mime_type, _ = mimetypes.guess_type(str(path))
    if not mime_type:
        mime_type = "image/jpeg"

    with open(path, "rb") as img_file:
        files = {"photo": (path.name, img_file, mime_type)}
        data = {
            "chat_id": chat_id,
            "caption": formatted_caption,
            "parse_mode": settings.telegram_parse_mode,
        }

        try:
            with httpx.Client(timeout=30.0) as client:
                resp = client.post(
                    f"{TELEGRAM_API}/bot{token}/sendPhoto",
                    data=data,
                    files=files,
                )
                if resp.status_code >= 400:
                    raise TelegramError(f"sendPhoto failed ({resp.status_code}): {resp.text}")

                result = resp.json().get("result", {})
                message_id = result.get("message_id")
                if not message_id:
                    raise TelegramError("No message_id returned in Telegram response")
                return str(message_id)
        except httpx.HTTPError as exc:
            raise TelegramError(f"HTTP error sending photo to Telegram: {exc}") from exc

