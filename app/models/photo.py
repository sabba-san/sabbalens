from datetime import datetime
from sqlalchemy import String, Float, DateTime, Enum, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
import enum


class PhotoStatus(str, enum.Enum):
    draft = "draft"
    scheduled = "scheduled"
    published = "published"
    failed = "failed"


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    filename: Mapped[str] = mapped_column(String(255))
    file_path: Mapped[str] = mapped_column(String(512))
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    camera: Mapped[str | None] = mapped_column(String(255), nullable=True)
    lens: Mapped[str | None] = mapped_column(String(255), nullable=True)
    focal_length: Mapped[str | None] = mapped_column(String(50), nullable=True)
    exposure_time: Mapped[str | None] = mapped_column(String(50), nullable=True)
    aperture: Mapped[str | None] = mapped_column(String(50), nullable=True)
    iso: Mapped[int | None] = mapped_column(nullable=True)
    destinations: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[PhotoStatus] = mapped_column(
        Enum(PhotoStatus), default=PhotoStatus.draft, index=True
    )
    caption: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    instagram_media_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())