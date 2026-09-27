from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, HttpUrl
from app.models.photo import PhotoStatus


class PhotoBase(BaseModel):
    filename: str
    file_path: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_name: Optional[str] = None
    caption: Optional[str] = None


class PhotoCreate(PhotoBase):
    pass


class PhotoUpdate(BaseModel):
    caption: Optional[str] = None
    status: Optional[PhotoStatus] = None
    scheduled_at: Optional[datetime] = None


class PhotoRead(PhotoBase):
    id: int
    status: PhotoStatus
    scheduled_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    instagram_media_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class BatchUploadRequest(BaseModel):
    captions: Optional[list[str]] = None
    schedule_at: Optional[datetime] = None