import logging
import secrets
from pathlib import Path

import httpx

from app.core.config import settings
from app.services.telegram import (
    TelegramError,
    get_telegram_status,
    publish_to_telegram,
)

log = logging.getLogger(__name__)
GRAPH = "https://graph.facebook.com/v21.0"
PUBLISHABLE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


class InstagramError(RuntimeError):
    """Raised when an Instagram publish cannot be completed."""


def get_social_status() -> dict:
    """Return connection and mode status for social networks."""
    has_creds = bool(settings.instagram_access_token and settings.instagram_business_account_id)
    telegram_info = get_telegram_status()
    return {
        "telegram": telegram_info,
        "instagram": {
            "connected": has_creds,
            "mode": "live" if has_creds else ("simulation" if settings.simulate_social_publish else "disconnected"),
            "account_id": settings.instagram_business_account_id if has_creds else None,
        },
    }


def publish_to_instagram(*, image_url: str, caption: str, file_path: str) -> str:
    """Create a media container then publish it. Returns the Instagram media id."""
    if Path(file_path).suffix.lower() not in PUBLISHABLE_EXTENSIONS:
        raise InstagramError(f"unsupported format: {Path(file_path).suffix or 'none'}")

    token = settings.instagram_access_token
    ig_id = settings.instagram_business_account_id
    if not token or not ig_id:
        if settings.simulate_social_publish:
            simulated_id = f"sim_ig_{secrets.token_hex(8)}"
            log.info("Simulated Instagram publish for '%s' -> media id %s", file_path, simulated_id)
            return simulated_id
        raise InstagramError(
            "Instagram not connected - set INSTAGRAM_ACCESS_TOKEN and "
            "INSTAGRAM_BUSINESS_ACCOUNT_ID in .env"
        )

    with httpx.Client(timeout=30.0) as client:
        # 1. Container creation - Meta fetches the image from image_url here
        r = client.post(
            f"{GRAPH}/{ig_id}/media",
            params={"image_url": image_url, "caption": caption, "access_token": token},
        )
        if r.status_code >= 400:
            raise InstagramError(f"container creation failed: {r.text}")
        creation_id = r.json()["id"]

        # 2. Publish the container
        r = client.post(
            f"{GRAPH}/{ig_id}/media_publish",
            params={"creation_id": creation_id, "access_token": token},
        )
        if r.status_code >= 400:
            raise InstagramError(f"publish failed: {r.text}")
        return r.json()["id"]