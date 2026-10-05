from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.core.database import engine, Base
from app.api.v1.router import router as api_v1_router
from app.services.storage import storage
from app.services.scheduler import init_scheduler, start_scheduler, shutdown_scheduler
from app.tasks.publisher import register_publisher_job


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)

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


# Scheduler app at /app/
app_dir = Path(__file__).parent.parent / "frontend_v1"
app.mount("/app", StaticFiles(directory=app_dir, html=True), name="frontend")

# Landing page at root (/)
# NOTE: Must be registered LAST. A mount at "/" matches every path, so any
# route registered after it (API, /health, /app) would be unreachable.
landing_dir = Path(__file__).parent.parent / "frontend_landing"
app.mount("/", StaticFiles(directory=landing_dir, html=True), name="landing")