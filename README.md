# Sabbalens — Geo-Aware Photo Pipeline & Telegram Publisher

**Precision developer-grade photography workstation and automated publishing pipeline that extracts EXIF GPS and camera telemetry, resolves coordinates to human-readable locations, and streams scheduled posts to Telegram.**

---

## 📸 Overview

Sabbalens is a fullstack FastAPI and static web application that provides:

1. **Parallel Ingestion** — Accepts RAW (ARW, CR3, DNG) and JPEG/PNG uploads via multipart REST API.
2. **Binary EXIF Extraction** — Parses binary tags using Pillow & `exifread` for camera body, lens, focal length, aperture, shutter speed, and ISO.
3. **Reverse Geocoding** — Converts latitude/longitude to structured city/state/country names via Nominatim (OpenStreetMap).
4. **Studio Staging Workstation (`/app`)** — Viewfinder with focus-peaking reticle brackets (`#FF2B2B`), Leaflet OpenStreetMap preview, live WYSIWYG Telegram message simulator, multi-asset filmstrip, and staggered bulk scheduling.
5. **Interactive Landing Page (`/`)** — High-converting dark-mode interface with live server telemetry, interactive sample asset switcher, and architecture walkthrough.
6. **Telegram Bot Dispatcher** — Streams photos and formatted HTML captions directly to Telegram channels or groups (`@sabbalensbot`) using outbound multipart requests (zero Cloudflare tunnels required).
7. **Dual-Engine Database** — Runs seamlessly on local SQLite or containerized PostgreSQL with self-healing schema auto-migrations.
8. **FigCraft Design System** — Master design file (`sabbalens_design.figcraft`) with 4 complete artboards (Landing, Studio, Library, Settings) and component tokens.

---

## 🏗️ Architecture

```
┌─────────────────────────────────┐
│       Clients & Browsers        │
│  - Landing Page: /              │
│  - Studio Workstation: /app     │
└──────────────┬──────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────────┐
│                   FastAPI Service                      │
│  /api/v1/photos   /api/v1/telegram   /health           │
└───────┬───────────────────────────────┬────────────────┘
        │                               │
        ▼                               ▼
┌──────────────┐                ┌──────────────┐
│  Nominatim   │                │   Database   │
│ (OSM Geocode)│                │ (PG / SQLite)│
└──────────────┘                └───────┬──────┘
                                        │
                                        ▼
                                ┌──────────────┐
                                │ APScheduler  │
                                └───────┬──────┘
                                        │ (Direct Multipart)
                                        ▼
                                ┌──────────────┐
                                │ Telegram API │
                                │@sabbalensbot │
                                └──────────────┘
```

---

## 📁 Repository Structure

```
sabbalens/
├── app/                        # FastAPI Backend Application
│   ├── api/                    # REST API routes (photos, telegram, social)
│   ├── core/                   # Settings, DB engine, auto-migration hooks
│   ├── models/                 # SQLAlchemy models (Photo)
│   ├── schemas/                # Pydantic schemas (PhotoRead, PhotoUpdate, BulkSchedule)
│   ├── services/               # EXIF, geocoding, Telegram client, transcode
│   ├── tasks/                  # APScheduler background publisher worker
│   └── main.py                 # FastAPI application with unified frontend mounts
├── frontend/                   # Unified Web Application
│   ├── index.html              # Modern Landing Page (served at /)
│   ├── landing.js              # Landing page client logic & live telemetry
│   └── app/                    # Studio Staging Workstation (served at /app)
│       ├── index.html          # Reticle stage, Leaflet OSM, filmstrip, Telegram simulator
│       └── app.js              # Reactive state, keyboard navigation (J/K, ⌘↵)
├── tests/                      # Automated Test Suite (30 passing tests)
│   ├── conftest.py             # Test isolation & offline simulation fixtures
│   ├── test_photos.py          # CRUD & bulk scheduling tests
│   └── test_telegram.py        # Telegram formatting & dispatch tests
├── data/                       # Local SQLite & Upload disk storage (.gitignored)
├── Dockerfile                  # Production container build
├── docker-compose.yml          # Local containerized PostgreSQL + app
├── sabbalens_design.figcraft   # Master FigCraft design system
├── PRD.md                      # Core product requirements document
├── UI_UX_PRD.md                # Studio UI/UX requirements document
├── DESIGN.md                   # Brand visual identity & design tokens
├── OVERVIEW.md                 # System overview and architecture
└── requirements.txt            # Production Python dependencies
```

---

## 🚀 Quickstart

### 1. Local Development (Virtual Environment)

```bash
# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt -r requirements-dev.txt

# Configure environment
cp .env.example .env

# Run FastAPI server
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

* **Landing Page**: [http://localhost:8000/](http://localhost:8000/)
* **Studio Workstation**: [http://localhost:8000/app/](http://localhost:8000/app/)
* **Interactive API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

### 2. Docker Compose (Full PostgreSQL Stack)

```bash
docker compose up -d --build
```

---

## 🧪 Running Tests

```bash
PYTHONPATH=. .venv/bin/pytest tests/
```

All 30 unit and integration tests run offline using isolated mock fixtures.

---

## 🔌 API Summary

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check endpoint |
| `POST` | `/api/v1/photos/upload` | Ingest photo, parse EXIF, reverse-geocode |
| `GET` | `/api/v1/photos` | List photos with optional status filter |
| `GET` | `/api/v1/photos/{id}` | Retrieve single photo details |
| `PATCH` | `/api/v1/photos/{id}` | Update caption, status, or scheduled time |
| `DELETE` | `/api/v1/photos/{id}` | Delete photo and remove disk asset |
| `POST` | `/api/v1/photos/{id}/publish` | Instant dispatch photo to Telegram |
| `POST` | `/api/v1/photos/bulk-schedule` | Automatically stagger schedule multiple photos |
| `GET` | `/api/v1/telegram/status` | Real-time bot health & round-trip ping latency |
| `POST` | `/api/v1/telegram/test` | Dispatch diagnostic test ping to group |

---

## ⌨️ Global Studio Shortcuts

| Key | Action |
|---|---|
| `J` / `K` or `←` / `→` | Step through photos in the working filmstrip |
| `⌘ + Enter` / `Ctrl + Enter` | Instantly dispatch active photo to Telegram |
| `I` | Open native file picker |
| `Esc` | Clear multi-selection or close modal dialogs |

---

## 📄 License

MIT
