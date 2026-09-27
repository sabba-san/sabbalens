from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.api.deps import get_database, get_storage, validate_image_file
from app.services.exif import extract_gps
from app.services.geocoding import get_location_name
from app.services.storage import LocalStorage
from app.models.photo import Photo, PhotoStatus
from app.schemas.photo import PhotoRead, PhotoUpdate, BatchUploadRequest

router = APIRouter()


@router.post("/photos/upload", response_model=PhotoRead, status_code=status.HTTP_201_CREATED)
async def upload_photo(
    file: UploadFile = Depends(validate_image_file),
    db: Session = Depends(get_database),
    storage: LocalStorage = Depends(get_storage),
):
    image_bytes = await file.read()
    
    file_path = storage.save(image_bytes, file.filename)
    
    gps = extract_gps(image_bytes)
    latitude = longitude = None
    location_name = None
    
    if gps:
        latitude, longitude = gps
        location_name = get_location_name(latitude, longitude)
    
    photo = Photo(
        filename=file.filename,
        file_path=file_path,
        latitude=latitude,
        longitude=longitude,
        location_name=location_name,
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
    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(photo, field, value)
    db.commit()
    db.refresh(photo)
    return photo


@router.delete("/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(photo_id: int, db: Session = Depends(get_database)):
    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    db.delete(photo)
    db.commit()