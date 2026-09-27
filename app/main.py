from contextlib import asynccontextmanager
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
app.include_router(api_v1_router)


@app.get("/")
def home():
    return {"message": "Sabbalens API is live", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "ok"}