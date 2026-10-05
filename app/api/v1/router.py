from fastapi import APIRouter
from app.api.v1 import photos, social

router = APIRouter(prefix="/api/v1")
router.include_router(photos.router)
router.include_router(social.router)