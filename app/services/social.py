import logging
from pathlib import Path

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)
GRAPH = "https://graph.facebook.com/v21.0"
PUBLISHABLE_EXTENSIONS = {".jpg", ".jpeg", ".png"}


class InstagramError(RuntimeError):
    """Raised when a publish cannot be completed."""


def publish_to_instagram(*, image_url: str, caption: str, file_path: str) -> str:
    """Create a media container then publish it. Returns the Instagram media id."""
    if Path(file_path).suffix.lower() not in PUBLISHABLE_EXTENSIONS:
        raise InstagramError(f"unsupported format: {Path(file_path).suffix or 'none'}")

    token = settings.instagram_access_token
    ig_id = settings.instagram_business_account_id
    if not token or not ig_id:
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