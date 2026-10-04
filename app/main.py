from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.core.database import engine, Base
from app.api.v1.router import router as api_v1_router
from app.services.storage import storage


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title=settings.app_name, debug=settings.debug, lifespan=lifespan)

app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

# API routes
app.include_router(api_v1_router)


@app.get("/health")
def health():
    return {"status": "ok"}


# Scheduler app at /app/
app_dir = Path(__file__).parent.parent / "frontend_v1"
app.mount("/app", StaticFiles(directory=app_dir, html=True), name="frontend")

# Landing page at root (/)
# NOTE: Must be registered LAST. A mount at "/" matches every path, so any
# route registered after it (API, /health, /app) would be unreachable.
landing_dir = Path(__file__).parent.parent / "frontend_landing"
app.mount("/", StaticFiles(directory=landing_dir, html=True), name="landing")