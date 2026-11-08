import os
import pytest

# Ensure unit tests use fast SQLite unless explicitly configured
if "DATABASE_URL" not in os.environ or os.environ["DATABASE_URL"].startswith("postgresql"):
    os.environ["DATABASE_URL"] = "sqlite:///./data/sabbalens.db"

# Ensure unit tests run in simulation mode without external network calls
os.environ["SIMULATE_SOCIAL_PUBLISH"] = "true"
os.environ["TELEGRAM_BOT_TOKEN"] = ""
os.environ["TELEGRAM_CHAT_ID"] = ""

from httpx import AsyncClient, ASGITransport
from app.core.config import settings

settings.simulate_social_publish = True
settings.telegram_bot_token = None
settings.telegram_chat_id = None

from app.main import app
from app.core.database import init_db
import pytest_asyncio


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    init_db()
    yield


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac