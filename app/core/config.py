from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    app_name: str = "Sabbalens API"
    debug: bool = True
    database_url: str = "sqlite:///./sabbalens.db"
    upload_dir: Path = Path("./uploads")
    max_file_size: int = 10 * 1024 * 1024
    allowed_extensions: set[str] = {"jpg", "jpeg", "png", "heic", "webp"}
    nominatim_user_agent: str = "sabbalens_photo_scheduler"
    nominatim_rate_limit: float = 1.0

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()