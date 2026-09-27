# Sabbalens — Geo-Aware Photo Pipeline

**Automated photo scheduling pipeline that extracts EXIF GPS data, converts coordinates to human-readable locations, and schedules social media posts.**

---

## Overview

Sabbalens is a FastAPI-based backend service that:

1. **Uploads photos** — Accepts multipart image uploads via REST API
2. **Extracts EXIF GPS** — Parses binary EXIF tags using `exifread` to get latitude/longitude
3. **Reverse geocodes** — Queries Nominatim (OpenStreetMap) to convert coordinates → city/state/country
4. **Persists locally** — Saves image files to disk and metadata to SQLite via SQLAlchemy
5. **Serves assets** — Static file serving for uploaded images
6. **Exposes CRUD API** — List, get, update (caption/status/schedule), delete photos

Built for deployment behind **Cloudflare Zero Trust Tunnel** (`api.sabbalens.me` → `localhost:8000` in WSL2).

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│  FastAPI    │────▶│  SQLite     │
│  (Browser/  │     │  /api/v1/   │     │  (sabbalens │
│   CLI/curl) │     │  photos     │     │   .db)      │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                    ┌──────▼──────┐     ┌─────────────┐
                    │  Local FS   │     │  Nominatim  │
                    │  ./uploads  │     │  (geopy)    │
                    └─────────────┘     └─────────────┘
```

**Layered structure:**
```
app/
├── main.py              # FastAPI app + lifespan (DB init, static mount)
├── core/
│   ├── config.py        # Pydantic Settings (.env)
│   └── database.py      # SQLAlchemy engine, SessionLocal, Base
├── models/
│   └── photo.py         # Photo model (id, file_path, lat/lon, location, status, caption, scheduled_at...)
├── schemas/
│   └── photo.py         # Pydantic models (PhotoCreate, PhotoRead, PhotoUpdate, BatchUploadRequest)
├── services/
│   ├── exif.py          # extract_gps(bytes) → (lat, lon) | None
│   ├── geocoding.py     # get_location_name(lat, lon) → str (rate-limited)
│   └── storage.py       # LocalStorage + StorageProtocol (swappable for S3/R2)
├── api/
│   ├── deps.py          # FastAPI dependencies (DB, storage, validation)
│   └── v1/
│       ├── router.py    # APIRouter prefix="/api/v1"
│       └── photos.py    # POST/GET/PATCH/DELETE /photos
└── tasks/
    └── __init__.py      # (Future: APScheduler publisher)
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/v1/photos/upload` | Upload photo (multipart `file`) → returns `PhotoRead` |
| `GET` | `/api/v1/photos` | List photos (query: `status`, `limit`, `offset`) |
| `GET` | `/api/v1/photos/{id}` | Get single photo |
| `PATCH` | `/api/v1/photos/{id}` | Update caption, status, scheduled_at |
| `DELETE` | `/api/v1/photos/{id}` | Delete photo |
| `GET` | `/uploads/{filename}` | Serve uploaded image (static) |

### Upload Response (201)

```json
{
  "id": 1,
  "filename": "DSC00234.jpg",
  "file_path": "uploads/a1b2c3d4.jpg",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "location_name": "San Francisco",
  "caption": null,
  "status": "draft",
  "scheduled_at": null,
  "published_at": null,
  "instagram_media_id": null,
  "created_at": "2026-09-27T13:52:57"
}
```

### Photo Status Enum

| Value | Meaning |
|-------|---------|
| `draft` | Uploaded, not scheduled |
| `scheduled` | Queued for publishing at `scheduled_at` |
| `published` | Successfully posted to Instagram |
| `failed` | Publish attempt failed |

---

## Quick Start

### Prerequisites

- Python 3.12+
- WSL2 (Ubuntu) or Linux/macOS

### Install

```bash
git clone <repo-url>
cd sabbalens_project
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # edit if needed
```

### Run

```bash
python main.py
# → http://localhost:8000
# → http://localhost:8000/docs (Swagger UI)
```

### Test Upload

```bash
# Create a test image with GPS EXIF (requires piexif + Pillow)
python3 -c "
import piexif
from PIL import Image
img = Image.new('RGB', (400, 300), color='blue')
lat, lon = 37.7749, -122.4194
def dms(d):
    d = abs(d); return [(int(d),1), (int((d-int(d))*60),1), (int(((d-int(d))*60-int((d-int(d))*60))*60*10000),10000)]
exif = {'GPS': {piexif.GPSIFD.GPSLatitudeRef: 'N' if lat>=0 else 'S', piexif.GPSIFD.GPSLatitude: dms(lat), piexif.GPSIFD.GPSLongitudeRef: 'E' if lon>=0 else 'W', piexif.GPSIFD.GPSLongitude: dms(lon)}}
img.save('/tmp/test.jpg', exif=piexif.dump(exif))
"

curl -X POST http://localhost:8000/api/v1/photos/upload -F "file=@/tmp/test.jpg"
```

---

## Configuration (`.env`)

```bash
APP_NAME=Sabbalens API
DEBUG=true
DATABASE_URL=sqlite:///./sabbalens.db
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
NOMINATIM_USER_AGENT=sabbalens_photo_scheduler
NOMINATIM_RATE_LIMIT=1.0

# Instagram (for future publisher)
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_BUSINESS_ACCOUNT_ID=
```

---

## Design System

See [`DESIGN.md`](DESIGN.md) — complete design tokens, components, patterns, and governance.

**Visual mode:** Dark Developer / Builder  
**Palette:** `#09090B` (bg) / `#18181B` (surface) / `#FAFAFA` (fg) / `#FF2B2B` (focus peaking accent)  
**Typography:** Satoshi/Geist + JetBrains Mono only

---

## Roadmap (Post-MVP)

| Phase | Feature | Files |
|-------|---------|-------|
| **A** | Scheduler | `app/services/scheduler.py`, `app/tasks/publisher.py`, lifespan integration |
| **B** | Instagram Graph API | `app/services/social.py`, extend `publisher.py` |
| **C** | Storage Abstraction | `S3Storage` / `R2Storage` implementing `StorageProtocol` |
| **D** | Batch Upload | `POST /api/v1/photos/batch` |

---

## Deployment

**Current:** Cloudflare Zero Trust Named Tunnel → `localhost:8000` in WSL2  
**Domain:** `api.sabbalens.me` (DNS via Cloudflare)

```bash
# Production (systemd / supervisor)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

---

## License

MIT