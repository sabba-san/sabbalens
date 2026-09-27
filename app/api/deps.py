from fastapi import Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import settings
from app.services.storage import LocalStorage


def get_database() -> Session:
    yield from get_db()


def get_storage() -> LocalStorage:
    return LocalStorage(settings.upload_dir)


async def validate_image_file(file: UploadFile = File(...)) -> UploadFile:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    ext = file.filename.split(".")[-1].lower() if file.filename else ""
    if ext not in settings.allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(settings.allowed_extensions)}",
        )
    return file