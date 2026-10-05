import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.photo import Photo, PhotoStatus
from app.services.scheduler import add_job, IntervalTrigger
import app.services.social as social
from app.services.storage import storage

log = logging.getLogger(__name__)


def is_transient(msg: str) -> bool:
    """Return True if the error message indicates a transient, retryable condition."""
    if not msg:
        return False
    lowered = msg.lower()
    transient_keywords = (
        "download failed",
        "429",
        "rate limit",
        "temporarily",
        "timeout",
        "connection",
        "network",
    )
    return any(kw in lowered for kw in transient_keywords)


def publish_scheduled_photos():
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        due = db.query(Photo).filter(
            Photo.status == PhotoStatus.scheduled,
            Photo.scheduled_at <= now,
        ).all()

        for photo in due:
            try:
                media_id = social.publish_to_instagram(
                    image_url=storage.get_public_url(photo.file_path),
                    caption=photo.caption or "",
                    file_path=photo.file_path,
                )
                photo.instagram_media_id = media_id
                photo.status = PhotoStatus.published
                photo.published_at = now
                log.info("published photo %s -> ig media %s", photo.id, media_id)

            except social.InstagramError as exc:
                msg = str(exc)
                if is_transient(msg):
                    log.warning("photo %s deferred: %s", photo.id, msg)
                    continue
                photo.status = PhotoStatus.failed
                log.error("photo %s failed: %s", photo.id, msg)

            db.commit()
    except Exception:
        log.exception("publisher job crashed")
    finally:
        db.close()


def register_publisher_job():
    """Register the recurring publisher job (runs every 60s)."""
    add_job(
        publish_scheduled_photos,
        IntervalTrigger(seconds=60),
        id="publish_scheduled_photos",
        replace_existing=True,
        max_instances=1,
    )