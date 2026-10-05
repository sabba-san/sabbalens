from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pathlib import Path
from datetime import datetime, timezone
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool
from app.api.deps import get_database, get_storage, validate_image_file
from app.services.exif import extract_exif_data
from app.services.geocoding import get_location_name
from app.services.storage import LocalStorage, storage
from app.models.photo import Photo, PhotoStatus
from app.schemas.photo import PhotoRead, PhotoUpdate, BatchUploadRequest
import app.services.social as social

router = APIRouter()

PUBLISHABLE_EXTENSIONS = {".jpg", ".jpeg", ".png"}


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
                   f"is not supported by Instagram. Supported: jpg, png.",
        )


class PublishRequest(BaseModel):
    caption: Optional[str] = None
    destinations: Optional[str] = None


@router.post("/photos/upload", response_model=PhotoRead, status_code=status.HTTP_201_CREATED)
async def upload_photo(
    file: UploadFile = Depends(validate_image_file),
    db: Session = Depends(get_database),
    storage: LocalStorage = Depends(get_storage),
):
    image_bytes = await file.read()
    
    file_path = storage.save(image_bytes, file.filename)
    
    exif = await run_in_threadpool(extract_exif_data, image_bytes)
    latitude = exif.get("latitude")
    longitude = exif.get("longitude")
    location_name = None
    
    if latitude is not None and longitude is not None:
        location_name = await run_in_threadpool(get_location_name, latitude, longitude)
    
    photo = Photo(
        filename=file.filename,
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

    try:
        media_id = social.publish_to_instagram(
            image_url=storage.get_public_url(photo.file_path),
            caption=photo.caption or "",
            file_path=photo.file_path,
        )
    except social.InstagramError as exc:
        msg = str(exc)
        if not is_transient(msg):
            photo.status = PhotoStatus.failed
            db.commit()
        raise HTTPException(status_code=502, detail=msg)

    photo.instagram_media_id = media_id
    photo.status = PhotoStatus.published
    photo.published_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(photo)
    return photo