import os
import uuid
from pathlib import Path
from typing import Protocol
from app.core.config import settings


class StorageProtocol(Protocol):
    def save(self, file_bytes: bytes, filename: str) -> str: ...
    def get_url(self, file_path: str) -> str: ...
    def delete(self, file_path: str) -> None: ...
    def get_public_url(self, file_path: str) -> str: ...


class LocalStorage:
    def __init__(self, upload_dir: Path):
        self.upload_dir = upload_dir
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    def save(self, file_bytes: bytes, filename: str) -> str:
        ext = Path(filename).suffix
        unique_name = f"{uuid.uuid4().hex}{ext}"
        file_path = self.upload_dir / unique_name
        file_path.write_bytes(file_bytes)
        return str(file_path)

    def get_url(self, file_path: str) -> str:
        return f"/uploads/{Path(file_path).name}"

    def delete(self, file_path: str) -> None:
        """Delete file from disk. Silently ignores missing files."""
        try:
            Path(file_path).unlink(missing_ok=True)
        except Exception:
            pass  # In production, log this but don't fail the request

    def get_public_url(self, file_path: str) -> str:
        """Public HTTPS URL that Meta's servers fetch the image from.

        Stored paths are container-absolute (/data/uploads/<uuid>.jpg), so only
        the basename is used.
        """
        return f"{settings.public_base_url}/uploads/{Path(file_path).name}"


storage = LocalStorage(settings.upload_dir)