import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
import pytest_asyncio

@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"

@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac