# Product Requirements Document (PRD)
## Sabbalens — Geo-Aware Photo Pipeline & Telegram Publisher

- **Document Version**: 2.0.0
- **Status**: Proposed / In Review
- **Owner**: Product & Engineering
- **Date**: 2026-11-08

---

## 1. Executive Summary & Vision

### 1.1 Product Vision
**Sabbalens** is a geo-aware photo management and publishing pipeline designed for photographers, digital creators, and content teams. It automates the extraction of binary EXIF GPS and camera metadata, resolves coordinates into human-readable locations via reverse geocoding, manages draft and scheduled photos, and dispatches them to social destinations.

### 1.2 Pivot Rationale: Instagram to Telegram Bot
The previous architecture targeted Instagram via the Meta Graph API. In practice, Meta Graph API introduces severe friction:
1. **High Setup Barrier**: Requires a verified Meta Business Account, Facebook Page linkage, and custom OAuth token renewal.
2. **Tunneling Dependency**: Instagram's API requires Meta servers to pull images from a publicly accessible URL (`public_base_url`), making local development or private homelab setups brittle.
3. **Restricted Media Flexibility**: Instagram strictly limits aspect ratios and formats.

**Why Telegram Bot?**
- **Instant Onboarding**: Creating a bot with `@BotFather` takes 30 seconds with a single persistent API token.
- **Direct Multipart Uploads**: Telegram's `sendPhoto` endpoint accepts direct multipart binary file uploads (`multipart/form-data`). Sabbalens can post directly from local disk storage without requiring Cloudflare tunnels or public DNS.
- **Rich Destinations**: Photos can be broadcast to public channels, private subscriber groups, or personal chat threads.
- **Rich Caption & Metadata**: Up to 1,024 characters with HTML or Markdown formatting, ideal for combining captions with location pins and camera/lens shooting parameters.

---

## 2. Target Personas & Core Use Cases

### 2.1 Personas
1. **The Travel / Field Photographer**: Takes photos on dedicated cameras (Sony, Fuji, Leica, Canon) or mobile phones, uploads high-res files with EXIF data, and wants automated location tags and camera settings attached to channel posts.
2. **The Content Curator / Admin**: Organizes photos into batches, schedules releases across time zones, and monitors publishing status from a clean web UI.

### 2.2 Core User Stories
- **US-01**: *As a creator*, I want to upload JPEG/HEIC/WEBP photos so that my camera metadata (GPS, focal length, aperture, shutter speed, ISO) is automatically parsed and preserved.
- **US-02**: *As a creator*, I want my GPS coordinates converted to a city, state, and country name automatically without manual research.
- **US-03**: *As a creator*, I want to set a caption and schedule a photo for future release, knowing the scheduler will deliver it on time.
- **US-04**: *As a creator*, I want photos sent directly to my **Telegram channel or chat group**, complete with location and camera details.
- **US-05**: *As an operator*, I want to test the Telegram bot connection directly from the settings interface and run in simulation mode when offline.

---

## 3. System Architecture & High-Level Flow

```
┌─────────────────┐       ┌────────────────────────────────────────────────────────┐
│     Client      │       │                    Sabbalens Backend                   │
│ (Web UI / curl) │──────▶│  FastAPI Router (/api/v1/photos, /api/v1/telegram)    │
└─────────────────┘       └───────────────────────────┬────────────────────────────┘
                                                      │
                       ┌──────────────────────────────┼──────────────────────────────┐
                       ▼                              ▼                              ▼
             ┌─────────────────┐            ┌─────────────────┐            ┌─────────────────┐
             │ EXIF & Geocode  │            │ Storage & DB    │            │ APScheduler     │
             │ exifread / geopy│            │ Disk + SQLite   │            │ 60s Polling     │
             └─────────────────┘            └─────────────────┘            └────────┬────────┘
                                                                                    │
                                                                                    ▼
                                                                           ┌─────────────────┐
                                                                           │ Telegram API    │
                                                                           │ sendPhoto       │
                                                                           │ (bot token)     │
                                                                           └────────┬────────┘
                                                                                    │
                                                                                    ▼
                                                                           ┌─────────────────┐
                                                                           │ Telegram Chat / │
                                                                           │ Channel         │
                                                                           └─────────────────┘
```

---

## 4. Functional Specifications

### 4.1 Ingestion & Processing Pipeline
1. **Multi-Format Ingestion**:
   - Accepts `image/jpeg`, `image/png`, `image/heic`, `image/heif`, `image/webp`.
   - File size limit enforced via config (`MAX_FILE_SIZE`, default 10MB).
2. **Metadata Extraction (`app/services/exif.py`)**:
   - Extract latitude & longitude (degrees, minutes, seconds -> decimal float).
   - Extract camera make/model, lens model, focal length, aperture ($F$-stop), exposure time, ISO speed.
3. **Reverse Geocoding (`app/services/geocoding.py`)**:
   - Resolves lat/lon to human-readable string: `"{City}, {State/Region}, {Country}"`.
   - Rate-limited to 1 request per second to comply with OpenStreetMap Nominatim usage policies.
4. **Image Normalization (`app/services/transcode.py`)**:
   - Auto-transcode non-standard formats (HEIC/HEIF/WEBP) into clean RGB JPEGs before disk persistence.

### 4.2 Telegram Publishing Engine
1. **Delivery Mechanism**:
   - Endpoint: `POST https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendPhoto`.
   - Media transport: Multipart payload with photo stream read directly from `./data/uploads`.
   - Timeout: 30s with connection retry for transient network issues.
2. **Caption Composition**:
   - User custom caption (if specified).
   - Location stamp: `📍 {location_name}`.
   - Camera & shooting settings stamp:
     `📷 {camera} • {lens}`
     `⚙️ {focal_length} | f/{aperture} | {exposure_time}s | ISO {iso}`
   - Formatted using Telegram HTML or Markdown. Max caption length: 1,024 characters (auto-truncated safely if needed).
3. **Simulation Mode**:
   - When `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` is missing and `SIMULATE_SOCIAL_PUBLISH=true`, the publisher generates a simulated message identifier: `sim_tele_<hex>` without network calls, logging the action for local development.

### 4.3 Scheduling & Auto-Publishing (`app/tasks/publisher.py`)
1. **Scheduler**: APScheduler running in background every 60 seconds.
2. **Query**: Select all photos where `status == "scheduled"` and `scheduled_at <= now()`.
3. **Execution**:
   - Attempt `publish_to_telegram(photo)`.
   - On success: set `photo.status = "published"`, `photo.published_at = now()`, `photo.telegram_message_id = message_id`.
   - On transient failure (HTTP 429, timeout, network error): keep `scheduled` status for next retry tick.
   - On fatal failure (HTTP 400, 401, 403, invalid chat ID): set `photo.status = "failed"`, record error in logs.

### 4.4 Management APIs

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/photos/upload` | Upload single photo (multipart form) |
| `GET` | `/api/v1/photos` | List photos with optional `status`, `limit`, `offset` |
| `GET` | `/api/v1/photos/{id}` | Retrieve photo details & metadata |
| `PATCH` | `/api/v1/photos/{id}` | Update caption, scheduled date, coordinates, or status |
| `DELETE` | `/api/v1/photos/{id}` | Delete photo file and database record |
| `POST` | `/api/v1/photos/{id}/publish` | Instantly publish photo to Telegram |
| `GET` | `/api/v1/telegram/status` | Check Telegram bot connectivity (`getMe`) and mode |
| `POST` | `/api/v1/telegram/test` | Dispatch a ping test message to verified chat ID |

---

## 5. UI / Frontend Specifications

### 5.1 Publishing Destinations & Modals
- Replace Instagram checkbox/toggle with **Telegram** destination badge.
- Publish Modal: Display destination as "Telegram Channel / Group".
- Immediate Publish feedback: "Published successfully to Telegram!" with direct message ID link.

### 5.2 Settings & Configuration Screen
- Replace Meta/Instagram OAuth login buttons with Telegram Bot status card:
  - **Status Indicator**: Connected (Green) / Simulation Mode (Yellow) / Missing Config (Red).
  - **Bot Username**: Fetched dynamically via `getMe` (e.g. `@SabbalensBot`).
  - **Configured Chat Target**: Masked target chat ID or channel handle.
  - **Action**: "Send Test Message" button to verify configuration without uploading a full photo.

---

## 6. Configuration & Environment Variables

```env
# Application
APP_NAME=Sabbalens API
DEBUG=true
DATABASE_URL=sqlite:///./data/sabbalens.db
UPLOAD_DIR=./data/uploads
MAX_FILE_SIZE=10485760

# Nominatim Geocoding
NOMINATIM_USER_AGENT=sabbalens_photo_scheduler
NOMINATIM_RATE_LIMIT=1.0

# Telegram Publishing
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_PARSE_MODE=HTML
SIMULATE_SOCIAL_PUBLISH=true
```

---

## 7. Migration & Compatibility Plan
1. **Database Schema**: Add `telegram_message_id` column to `photos`. Keep existing `instagram_media_id` as nullable/legacy to avoid destructive data migrations on existing SQLite databases.
2. **Default Destination**: Default new uploads to `destinations = "telegram"`.
3. **Simulation Mode Fallback**: Preserves zero-friction local development even without a Telegram token.
