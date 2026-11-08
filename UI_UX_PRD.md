# Product Requirements Document (PRD)
## Sabbalens UI/UX Redesign — Staging Studio & Telegram Publisher

- **Document Version**: 2.1.0
- **Status**: Draft / In Review
- **Owner**: Product, Design & Engineering
- **Date**: 2026-11-08

---

## 1. Executive Summary & Vision

### 1.1 Problem Statement
The current Sabbalens interface (`frontend_v2`) successfully validates backend capabilities (photo upload, EXIF extraction, Telegram delivery), but has notable user experience bottlenecks:
1. **Disconnected Staging & Publishing**: Editing metadata, writing captions, and scheduling require jumping across separate panels.
2. **Blind Telegram Formatting**: Creators cannot preview how their photos, HTML tags, and metadata will actually look inside a Telegram channel or chat bubble prior to dispatch.
3. **No Visual Geo-Location**: EXIF coordinates are displayed as numeric text without a visual map confirmation.
4. **Single-Photo Friction**: Importing photos requires clicking through a modal dialog rather than frictionless multi-file drag-and-drop into a working filmstrip.

### 1.2 Vision & Design Identity
Transform Sabbalens into a **precision developer-grade photography workstation** inspired by *Linear*, *Lightroom*, and *Vercel*:
- **Dark Builder Aesthetic** (`DESIGN.md` aligned): `#09090B` deep dark background, `#18181B` structured surfaces, `#FF2B2B` focus-peaking red accent, JetBrains Mono telemetry.
- **WYSIWYG Telegram Simulator**: Live chat bubble preview rendering the exact caption layout, location pins, and shooting specs before hitting publish.
- **Embedded Interactive Map**: Lightweight OpenStreetMap/Leaflet widget showing the exact camera pin for reverse-geocoded coordinates.
- **Fast Flow**: Multi-file batch dropzone, instant keyboard shortcuts (`J`/`K` navigation, `Cmd+Enter` to dispatch), and zero unnecessary modal interruptions.

---

## 2. Core Personas & User Journeys

### 2.1 Personas
1. **The Field & Travel Photographer**: Takes hundreds of shots on mirrorless cameras (Sony, Fuji, Leica, Canon), drops exported batches into Sabbalens, verifies location pins on a map, and queues automated daily photo drops to their Telegram channel.
2. **The Social Content Manager / Curator**: Schedules visual storytelling posts for communities or brands, demanding accurate character counting (1,024 Telegram limit) and preview accuracy.

### 2.2 Key User Journeys
- **Journey 1 (Batch Ingestion)**: Creator drags 5 photos directly onto the filmstrip. They upload in parallel with progress bars and transcode instantly to web-ready JPEG.
- **Journey 2 (Geo & EXIF Verification)**: Creator clicks photo #2 in the filmstrip. The central stage zooms to the photo; the right inspector displays the camera settings (`f/2.8`, `1/250s`, `ISO 100`) and a map pin in San Francisco.
- **Journey 3 (Telegram Simulation & Dispatch)**: Creator types a story in the caption box. Toggles for `[x] Location Tag` and `[x] Camera Gear` automatically format the caption below. The Telegram message simulator updates in real-time. Creator clicks "Publish Now" or selects "Tomorrow 9:00 AM".

---

## 3. Information Architecture & Screen Breakdown

The redesigned interface consists of three dedicated views accessible via a top navigation bar:

```
┌────────────────────────────────────────────────────────────────────────┐
│  [+] Sabbalens   [Studio]  [Library]  [Settings]   ● @sabbalensbot Live│
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌───────────────────────────────┐  ┌───────────────────────────────┐  │
│  │                               │  │ Inspector / Telegram Studio   │  │
│  │                               │  │                               │  │
│  │                               │  │ [Geo & EXIF] [Telegram Sim]   │  │
│  │        MAIN STAGE             │  ├───────────────────────────────┤  │
│  │    (Photo & Reticle)          │  │ 📍 Map Pin Preview (Leaflet)  │  │
│  │                               │  │ 📷 Camera & Exposure Cards    │  │
│  │                               │  ├───────────────────────────────┤  │
│  │                               │  │ 💬 Telegram Chat Simulator    │  │
│  │                               │  │    (Live photo + caption)     │  │
│  ├───────────────────────────────┤  ├───────────────────────────────┤  │
│  │ FILMSTRIP & BATCH UPLOAD      │  │ [Schedule] [Publish to Bot]   │  │
│  │ [Img 1] [Img 2] [Img 3] [+]   │  │                               │  │
│  └───────────────────────────────┘  └───────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

### View 1: Studio (Primary Staging & Composer)

#### A. Main Stage (Photo Viewport)
- High-res photo inspection with aspect-ratio preservation.
- Corner focus-peaking brackets (`DESIGN.md` visual signature).
- Quick overlay toggle: View coordinates, shutter specs, or clean fullscreen mode.
- Status watermark badge: `DRAFT` (muted), `SCHEDULED` (amber), `PUBLISHED` (green).

#### B. Bottom Filmstrip (Multi-Item Queue)
- Horizontal scrollable strip of all active session photos.
- Direct drag-and-drop zone (`+ Drop photos here`).
- Thumbnail cards displaying status pill, filename, and relative schedule time.
- Keyboard navigation: `Left`/`Right` or `J`/`K` keys to switch active photos.

#### C. Inspector & Telegram Composer (Right Panel)
Divided into two organized collapsible sections:

1. **Geo-Location & Camera Telemetry**:
   - **Interactive Leaflet Map**: 120px tall OpenStreetMap tile widget with red reticle pin on extracted coordinates.
   - **Location Pill**: City, state, country with one-click "Edit Location" override.
   - **EXIF Matrix**: 4-card grid:
     - Body: Camera make & model
     - Lens: Focal length + lens name
     - Aperture: $f$-stop value
     - Shutter & ISO: Exposure time & sensor speed

2. **Telegram Composer & WYSIWYG Simulator**:
   - **Target Channel Indicator**: Displays target chat (`post pic dazz` / `-5429792155`).
   - **Caption Editor**: Multiline input with auto-expanding height.
   - **Smart Append Toggles**:
     - `[x] Append Location (📍 City, Country)`
     - `[x] Append Camera Specs (📷 Sony A7IV • FE 24-70mm)`
     - `[x] Append Exposure (⚙️ 35mm | f/2.8 | 1/250s | ISO 100)`
   - **Telegram Message Bubble Simulator**:
     - Visual mockup mimicking Telegram's desktop/mobile chat bubble.
     - Displays formatted caption with Telegram HTML rendering.
     - Character limit progress indicator: `342 / 1024` with warning color when approaching limit.
   - **Dispatch Actions**:
     - **Quick Schedule Bar**: Presets (`+1 hr`, `Tonight 8pm`, `Tomorrow 9am`) + date/time input.
     - **Publish Now Button**: Instant dispatch with loading spinner and Telegram message ID toast.

---

### View 2: Library & Archive Grid

- **Filter Bar**: Quick filtering by status (`All`, `Drafts`, `Scheduled`, `Published`, `Failed`).
- **Search Bar**: Instant filter by location name (e.g. "Tokyo", "San Francisco") or camera model.
- **Card Actions**:
  - Hover action menu: Edit, Reschedule, View in Telegram, Delete.
  - Multi-select capability for batch deletions or bulk scheduling.
- **Published Photo Cards**: Direct link `Telegram Msg #ID` opening the message or showing delivery timestamp.

---

### View 3: Settings & Bot Operations

- **Telegram Bot Health Card**:
  - Bot Handle: `@sabbalensbot` with green active ping.
  - Active Group / Channel: `post pic dazz` (`-5429792155`).
  - Send Test Ping button with real-time round-trip latency counter.
- **Default Caption Template**:
  - Configure default metadata auto-append preferences so creators don't have to re-toggle every time.
- **Database & Storage Metrics**:
  - Total photos stored, disk space used in `./data/uploads`, database engine in use (PostgreSQL / SQLite).

---

## 4. Visual Design Tokens & Component Specs

Aligned with [`DESIGN.md`](file:///home/abbas/sabbalens/DESIGN.md):

| Element | Specification | Hex / Token |
|---|---|---|
| **Background** | Zinc-950 | `#09090B` |
| **Surface (Cards/Panels)** | Zinc-900 | `#18181B` |
| **Surface Hover** | Zinc-800/50 | `#1F1F23` |
| **Border / Divider** | Zinc-800 | `#27272A` |
| **Primary Accent** | Focus-Peaking Red | `#FF2B2B` |
| **Success / Published** | Emerald Green | `#22C55E` |
| **Warning / Scheduled** | Amber | `#F59E0B` |
| **Font (UI)** | Geist / Satoshi / Inter-fallback | 14px base, tracking `-0.01em` |
| **Font (Data/EXIF/Code)** | JetBrains Mono | 12px, tabular numbers |

---

## 5. Technical Requirements & Architecture

1. **Lightweight & Fast**:
   - Zero heavyweight frontend build step required (retains pure fast static asset serving from FastAPI at `/app`).
   - Tailwind CSS via CDN or compiled CSS utility.
   - Leaflet.js via unpkg/cdnjs (only ~40KB, zero API keys required, uses OpenStreetMap tiles).
2. **Keyboard Shortcuts**:
   - `J` / `K` or `Left` / `Right`: Previous / Next photo in filmstrip.
   - `Cmd + Enter` / `Ctrl + Enter`: Publish or Schedule active photo.
   - `I`: Open file picker / import.
   - `Esc`: Close dialogs / clear selection.
3. **Responsive Breakpoints**:
   - Desktop ($\ge 1024px$): 2-column studio layout (Stage + Inspector).
   - Mobile / Tablet ($< 1024px$): Stacked layout with collapsible inspector drawer.

---

## 6. Approved Architecture Decisions

1. **Caption Toggles**:
   - Toggles for `📍 Location`, `📷 Camera & Lens`, and `⚙️ Exposure Specs` are **optional checkboxes** in the Telegram Composer. Users can individually toggle each element on/off for any photo.
2. **Interactive Map Widget**:
   - Uses **OpenStreetMap via Leaflet.js** (zero API keys, lightweight, fast). Displays GPS coordinates with a custom focus reticle pin.
3. **Bulk Scheduling**:
   - Library view includes a **Bulk Schedule** action. When multiple photos are selected, users can pick a start date/time and interval (e.g. 1 hour, 2 hours, 1 day apart) to stagger posts automatically.
