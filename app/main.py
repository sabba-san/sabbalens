from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.core.database import init_db
from app.api.v1.router import router as api_v1_router
from app.services.storage import storage
from app.services.scheduler import init_scheduler, start_scheduler, shutdown_scheduler
from app.tasks.publisher import register_publisher_job


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    # Initialize and start scheduler
    init_scheduler()
    register_publisher_job()
    start_scheduler()

    yield

    # Clean shutdown
    shutdown_scheduler()


app = FastAPI(title=settings.app_name, debug=settings.debug, lifespan=lifespan)

app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

# API routes
app.include_router(api_v1_router)


@app.get("/health")
def health():
    return {"status": "ok"}


# Main scheduler app at /app/ (V2 primary)
app_dir_v2 = Path(__file__).parent.parent / "frontend_v2"
app.mount("/app", StaticFiles(directory=app_dir_v2, html=True), name="frontend")

# /v2/ alias pointing to V2
app.mount("/v2", StaticFiles(directory=app_dir_v2, html=True), name="frontend_v2")

# Legacy v1 backup at /v1/
app_dir_v1 = Path(__file__).parent.parent / "frontend_v1"
app.mount("/v1", StaticFiles(directory=app_dir_v1, html=True), name="frontend_v1")

# Landing preview at /preview/ (parallel deployment — v2 testing only)
preview_dir = Path(__file__).parent.parent / "frontend_landing_v2"
app.mount("/preview", StaticFiles(directory=preview_dir, html=True), name="landing_preview")

# Landing page at root (/)
# NOTE: Must be registered LAST. A mount at "/" matches every path, so any
# route registered after it (API, /health, /app) would be unreachable.
landing_dir = Path(__file__).parent.parent / "frontend_landing"
app.mount("/", StaticFiles(directory=landing_dir, html=True), name="landing")