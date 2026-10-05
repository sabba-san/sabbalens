from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        # Ignore unknown keys in .env instead of crashing on startup.
        extra="ignore",
    )

    app_name: str = "Sabbalens API"
    debug: bool = True
    # Local runs and Docker share the same ./data directory so both see the
    # same photos (docker-compose mounts ./data -> /data).
    database_url: str = "sqlite:///./data/sabbalens.db"
    upload_dir: Path = Path("./data/uploads")
    max_file_size: int = 10 * 1024 * 1024
    allowed_extensions: set[str] = {"jpg", "jpeg", "png"}
    nominatim_user_agent: str = "sabbalens_photo_scheduler"
    nominatim_rate_limit: float = 1.0

    # Public base URL for Instagram image fetching
    public_base_url: str = "https://api.sabbalens.me"

    # Instagram (for future publisher)
    instagram_app_id: str | None = None
    instagram_app_secret: str | None = None
    instagram_access_token: str | None = None
    instagram_business_account_id: str | None = None
    instagram_redirect_uri: str = "https://api.sabbalens.me/api/v1/auth/instagram/callback"


settings = Settings()