from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pathlib import Path
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool
from app.api.deps import get_database, get_storage, validate_image_file
from app.services.exif import extract_exif_data
from app.services.geocoding import get_location_name
from app.services.storage import LocalStorage, storage
from app.models.photo import Photo, PhotoStatus
from app.schemas.photo import PhotoRead, PhotoUpdate, BatchUploadRequest
from app.services.transcode import should_transcode, transcode_to_jpeg
import app.services.social as social
import app.services.telegram as telegram

router = APIRouter()

PUBLISHABLE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


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


def _assert_publishable(photo: Photo) -> None:
    suffix = Path(photo.file_path).suffix.lower()
    if suffix not in PUBLISHABLE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot publish '{photo.filename}': {suffix or 'no extension'} "
                   f"is not supported. Supported: jpg, png, webp.",
        )


class PublishRequest(BaseModel):
    caption: Optional[str] = None
    destinations: Optional[str] = None


class BulkScheduleRequest(BaseModel):
    photo_ids: list[int]
    start_time: datetime
    interval_minutes: int = 60
    destinations: Optional[str] = "telegram"


@router.post("/photos/upload", response_model=PhotoRead, status_code=status.HTTP_201_CREATED)
async def upload_photo(
    file: UploadFile = Depends(validate_image_file),
    db: Session = Depends(get_database),
    storage: LocalStorage = Depends(get_storage),
):
    image_bytes = await file.read()
    
    # Extract EXIF metadata from raw bytes first
    exif = await run_in_threadpool(extract_exif_data, image_bytes)
    latitude = exif.get("latitude")
    longitude = exif.get("longitude")
    location_name = None
    
    if latitude is not None and longitude is not None:
        location_name = await run_in_threadpool(get_location_name, latitude, longitude)

    # Transcode HEIC/HEIF/WEBP to RGB JPEG before saving
    filename = file.filename or "photo.jpg"
    if should_transcode(filename):
        image_bytes = await run_in_threadpool(transcode_to_jpeg, image_bytes)
        filename = f"{Path(filename).stem}.jpg"

    file_path = storage.save(image_bytes, filename)
    
    photo = Photo(
        filename=filename,
        file_path=file_path,
        latitude=latitude,
        longitude=longitude,
        location_name=location_name,
        camera=exif.get("camera"),
        lens=exif.get("lens"),
        focal_length=exif.get("focal_length"),
        exposure_time=exif.get("exposure_time"),
        aperture=exif.get("aperture"),
        iso=exif.get("iso"),
        destinations="telegram",
        status=PhotoStatus.draft,
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)
    
    return photo


@router.get("/photos", response_model=List[PhotoRead])
def list_photos(
    status: PhotoStatus | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_database),
):
    query = db.query(Photo)
    if status:
        query = query.filter(Photo.status == status)
    return query.order_by(Photo.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/photos/{photo_id}", response_model=PhotoRead)
def get_photo(photo_id: int, db: Session = Depends(get_database)):
    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    return photo


@router.patch("/photos/{photo_id}", response_model=PhotoRead)
def update_photo(photo_id: int, update: PhotoUpdate, db: Session = Depends(get_database)):
    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    fields = update.model_dump(exclude_unset=True)

    # Fail fast rather than letting the scheduler mark it failed later
    if fields.get("status") in (PhotoStatus.scheduled, PhotoStatus.published):
        _assert_publishable(photo)

    # Auto-resolve location name if coordinates are updated without explicit location_name
    if ("latitude" in fields or "longitude" in fields) and "location_name" not in fields:
        lat = fields.get("latitude", photo.latitude)
        lon = fields.get("longitude", photo.longitude)
        if lat is not None and lon is not None:
            try:
                resolved_loc = get_location_name(lat, lon)
                if resolved_loc:
                    photo.location_name = resolved_loc
            except Exception:
                pass

    for field, value in fields.items():
        setattr(photo, field, value)
    db.commit()
    db.refresh(photo)
    return photo


@router.delete("/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(photo_id: int, db: Session = Depends(get_database), storage: LocalStorage = Depends(get_storage)):
    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    
    # Delete file from disk first
    storage.delete(photo.file_path)
    
    # Then delete DB record
    db.delete(photo)
    db.commit()


@router.post("/photos/{photo_id}/publish", response_model=PhotoRead)
def publish_photo_now(
    photo_id: int,
    body: PublishRequest | None = None,
    db: Session = Depends(get_database),
):
    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    # Republishing would create a second Instagram post for the same photo.
    if photo.status == PhotoStatus.published:
        raise HTTPException(
            status_code=409, detail="Photo is already published"
        )

    _assert_publishable(photo)

    if body:
        if body.caption is not None:
            photo.caption = body.caption
        if body.destinations is not None:
            photo.destinations = body.destinations

    dest = (photo.destinations or "telegram").lower()
    try:
        if "instagram" in dest:
            media_id = social.publish_to_instagram(
                image_url=storage.get_public_url(photo.file_path),
                caption=photo.caption or "",
                file_path=photo.file_path,
            )
            photo.instagram_media_id = media_id
        else:
            msg_id = telegram.publish_to_telegram(
                file_path=photo.file_path,
                caption=photo.caption,
                photo_obj=photo,
            )
            photo.telegram_message_id = msg_id
    except (telegram.TelegramError, social.InstagramError) as exc:
        msg = str(exc)
        if not is_transient(msg):
            photo.status = PhotoStatus.failed
            db.commit()
        raise HTTPException(status_code=502, detail=msg)
    photo.status = PhotoStatus.published
    photo.published_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(photo)
    return photo


@router.post("/photos/bulk-schedule", response_model=List[PhotoRead])
def bulk_schedule_photos(
    body: BulkScheduleRequest,
    db: Session = Depends(get_database),
):
    if not body.photo_ids:
        raise HTTPException(status_code=400, detail="No photo IDs provided")

    photos = db.query(Photo).filter(Photo.id.in_(body.photo_ids)).all()
    photo_dict = {p.id: p for p in photos}

    missing = [pid for pid in body.photo_ids if pid not in photo_dict]
    if missing:
        raise HTTPException(status_code=404, detail=f"Photos not found: {missing}")

    updated = []
    for idx, pid in enumerate(body.photo_ids):
        photo = photo_dict[pid]
        _assert_publishable(photo)
        photo.scheduled_at = body.start_time + timedelta(minutes=body.interval_minutes * idx)
        photo.status = PhotoStatus.scheduled
        if body.destinations:
            photo.destinations = body.destinations
        updated.append(photo)

    db.commit()
    for p in updated:
        db.refresh(p)
    return updated