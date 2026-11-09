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


# Studio Workstation at /app (and /v2 alias)
frontend_dir = Path(__file__).parent.parent / "frontend"
app.mount("/app", StaticFiles(directory=frontend_dir / "app", html=True), name="studio")
app.mount("/v2", StaticFiles(directory=frontend_dir / "app", html=True), name="studio_v2")

# Landing page at root (/)
# NOTE: Must be registered LAST. A mount at "/" matches every path, so any
# route registered after it (API, /health, /app) would be unreachable.
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="landing")