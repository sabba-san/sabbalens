# Sprint 3 — Instagram Graph API Integration (Approved Plan)

> **Date:** 2026-10-05 · **Status:** Approved, ready to execute
> **Supersedes:** all earlier Sprint 3 drafts

---

## Locked Decisions

| # | Decision | Outcome |
|---|----------|---------|
| 1 | Image formats | **jpg/png only** — drop `heic`, `webp` |
| 2 | Publisher async | **Keep sync** — my earlier claim was wrong, see correction |
| 3 | Tunnel dependency | **Accepted for MVP**, documented as known limitation |
| 4 | Format guard | **Fail fast at schedule time** + safety net in publish service |
| 5 | Legacy-format backfill | **Not needed** — verified all 17 existing rows are jpg/png |
| 6 | "Publish Now" button | **Option A — wire to real `POST /photos/{id}/publish`** |
| 7 | Poll interval | **60s** — unchanged |
| 8 | Deploy order | OAuth + tokens before publisher goes live |
| 9 | App Secret rotation | After sprint merges |

### Correction on decision #2

I previously claimed the sync `publish_scheduled_photos()` would block the event loop. **It does not.** From the installed `apscheduler/executors/asyncio.py`:

> *"If the job function is a native coroutine function, it is scheduled to be run directly in the event loop... All other functions are run in the event loop's default executor which is usually a thread pool."*

APScheduler already offloads sync jobs — confirmed empirically when photo 9 flipped `scheduled → published` on schedule during the Docker test. So `publisher.py` stays `def` with sync `httpx.Client`, and the new endpoint is `def` too (FastAPI runs sync path ops in its threadpool automatically — no `run_in_threadpool` needed).

---

## Verified Preconditions

| Check | Result |
|---|---|
| `https://api.sabbalens.me/health` | 200 OK |
| `https://api.sabbalens.me/uploads/<file>` | **200 OK** → Meta can fetch images via the tunnel; **no R2/S3/boto3 needed** |
| `.env` gitignored; only `.env.example` tracked | Confirmed — no secret in git history |
| `httpx` in requirements | Present — no dependency changes |
| Existing photo formats | 17/17 jpg or png |
| Pending `scheduled` rows due now | None (dated 2027 / 2099) |

---

## Phase 1 — Restrict Upload Formats

`app/core/config.py:20`

```python
# current
allowed_extensions: set[str] = {"jpg", "jpeg", "png", "heic", "webp"}
# new — Meta's /media endpoint accepts JPEG and PNG only
allowed_extensions: set[str] = {"jpg", "jpeg", "png"}
```

No migration needed. `deps.py:19-24` already validates against this set, so `.heic`/`.webp` uploads return 400 immediately.

---

## Phase 2 — Public URL Helper

`app/services/storage.py`:

```python
def get_public_url(file_path: str) -> str:
    """Public HTTPS URL that Meta's servers fetch the image from.

    Stored paths are container-absolute (/data/uploads/<uuid>.jpg), so only
    the basename is used.
    """
    return f"{settings.public_base_url}/uploads/{Path(file_path).name}"
```

`app/core/config.py` — new field:

```python
public_base_url: str = "https://api.sabbalens.me"
```

> In config rather than hardcoded so local dev can point elsewhere — but note
> Meta cannot reach `localhost`, so publishing only works through the tunnel.

---

## Phase 3 — Format Guard (fail fast)

`app/api/v1/photos.py` — `update_photo` is the chokepoint: "Schedule Post", "Publish Now", and any API client all go through `PATCH /photos/{id}`.

```python
from pathlib import Path

PUBLISHABLE_EXTENSIONS = {".jpg", ".jpeg", ".png"}


def _assert_publishable(photo: Photo) -> None:
    suffix = Path(photo.file_path).suffix.lower()
    if suffix not in PUBLISHABLE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot publish '{photo.filename}': {suffix or 'no extension'} "
                   f"is not supported by Instagram. Supported: jpg, png.",
        )
```

Called from `update_photo` when the patch sets `status` to `scheduled` or `published`. Reused by Phase 6.

**Safety net:** `social.publish_to_instagram` re-checks the suffix, so a row that bypassed `PATCH` (direct DB edit, legacy row) still surfaces as a clear error rather than an opaque Meta 400.

---

## Phase 4 — Publish Service

**New: `app/services/social.py`** (sync, matching the sync publisher)

```python
import logging
from pathlib import Path

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)
GRAPH = "https://graph.facebook.com/v21.0"
PUBLISHABLE_EXTENSIONS = {".jpg", ".jpeg", ".png"}


class InstagramError(RuntimeError):
    """Raised when a publish cannot be completed."""


def publish_to_instagram(*, image_url: str, caption: str, file_path: str) -> str:
    """Create a media container then publish it. Returns the Instagram media id."""
    if Path(file_path).suffix.lower() not in PUBLISHABLE_EXTENSIONS:
        raise InstagramError(f"unsupported format: {Path(file_path).suffix or 'none'}")

    token = settings.instagram_access_token
    ig_id = settings.instagram_business_account_id
    if not token or not ig_id:
        raise InstagramError(
            "Instagram not connected - set INSTAGRAM_ACCESS_TOKEN and "
            "INSTAGRAM_BUSINESS_ACCOUNT_ID in .env"
        )

    with httpx.Client(timeout=30.0) as client:
        # 1. Container creation - Meta fetches the image from image_url here
        r = client.post(
            f"{GRAPH}/{ig_id}/media",
            params={"image_url": image_url, "caption": caption, "access_token": token},
        )
        if r.status_code >= 400:
            raise InstagramError(f"container creation failed: {r.text}")
        creation_id = r.json()["id"]

        # 2. Publish the container
        r = client.post(
            f"{GRAPH}/{ig_id}/media_publish",
            params={"creation_id": creation_id, "access_token": token},
        )
        if r.status_code >= 400:
            raise InstagramError(f"publish failed: {r.text}")
        return r.json()["id"]
```

### Error classification

| Meta error | Class | Meaning |
|---|---|---|
| `(#190) Invalid access token` | **permanent** | Page token revoked / Page admin lost → re-run OAuth |
| `(#100) … download failed` | **transient** | Tunnel down or URL unreachable → retry next tick |
| image format rejected | **permanent** | Guarded upstream, but keep as backstop |
| HTTP 429 | **transient** | Rate limit (200 publishes/hr) → retry next tick |

---

## Phase 5 — Publisher Wiring (stays sync)

`app/tasks/publisher.py` — replace the mock body:

```python
def publish_scheduled_photos():
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        due = db.query(Photo).filter(
            Photo.status == PhotoStatus.scheduled,
            Photo.scheduled_at <= now,
        ).all()

        for photo in due:
            try:
                media_id = social.publish_to_instagram(
                    image_url=storage.get_public_url(photo.file_path),
                    caption=photo.caption or "",
                    file_path=photo.file_path,
                )
                photo.instagram_media_id = media_id
                photo.status = PhotoStatus.published
                photo.published_at = now
                log.info("published photo %s -> ig media %s", photo.id, media_id)

            except social.InstagramError as exc:
                msg = str(exc)
                if is_transient(msg):
                    # stay scheduled, retry next 60s tick
                    log.warning("photo %s deferred: %s", photo.id, msg)
                    continue
                photo.status = PhotoStatus.failed
                log.error("photo %s failed: %s", photo.id, msg)

            db.commit()   # per-photo: one failure doesn't lose the batch
    except Exception:
        db.rollback()
        log.exception("publisher job crashed")
    finally:
        db.close()
```

`is_transient(msg)` checks for `download failed`, `429`, `temporarily`, `timeout` (case-insensitive).

Changes vs. current file:
- `print(...)` → `logging`, with `log.exception` for the outer handler
- `scheduled → failed` on permanent errors — first use of the `failed` badge already defined at `frontend_v1/styles.css:1079`
- Per-photo commit instead of one commit for the whole batch
- Transient errors stay `scheduled` and retry, so a tunnel blip doesn't strand posts

---

## Phase 6 — `POST /photos/{id}/publish` (manual trigger + retry)

`app/api/v1/photos.py` — the truthful "Publish Now" and the manual retry path for `failed` rows.

```python
class PublishRequest(BaseModel):
    caption: Optional[str] = None       # saved before publishing
    destinations: Optional[str] = None


@router.post("/photos/{photo_id}/publish", response_model=PhotoRead)
def publish_photo_now(
    photo_id: int,
    body: PublishRequest | None = None,
    db: Session = Depends(get_database),
):
    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    # Republishing would create a second Instagram post for the same photo.
    if photo.status == PhotoStatus.published:
        raise HTTPException(
            status_code=409, detail="Photo is already published"
        )

    _assert_publishable(photo)

    if body:
        if body.caption is not None:
            photo.caption = body.caption
        if body.destinations is not None:
            photo.destinations = body.destinations

    try:
        media_id = social.publish_to_instagram(
            image_url=storage.get_public_url(photo.file_path),
            caption=photo.caption or "",
            file_path=photo.file_path,
        )
    except social.InstagramError as exc:
        msg = str(exc)
        if not is_transient(msg):
            photo.status = PhotoStatus.failed
            db.commit()
        raise HTTPException(status_code=502, detail=msg)

    photo.instagram_media_id = media_id
    photo.status = PhotoStatus.published
    photo.published_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(photo)
    return photo
```

### Design decisions

| Question | Choice | Reasoning |
|---|---|---|
| Allowed source states | `draft`, `scheduled`, `failed` | `failed` is the manual-retry path; `scheduled` lets the user post early |
| Already `published` | **409 Conflict** | Re-publishing creates a duplicate IG post — must refuse |
| Transient failure | Status untouched, **502** | Row stays `scheduled`/`failed` so the 60s tick or a retry click picks it up |
| Permanent failure | → `failed`, **502** | Surfaces in the UI as the red badge |
| Caption handling | Optional body field, saved then published | One round trip instead of PATCH-then-POST |
| `published_at` | Set **server-side** | Replaces the browser clock the frontend currently sends |
| `scheduled_at` | Left as-is | Historical record; harmless |
| Sync `def`? | Yes | FastAPI runs sync path ops in its threadpool — correct for blocking HTTP |

**Known MVP limitation — double-click creates duplicate posts.** Each call creates a *new* Meta container, so two rapid clicks = two IG posts. Mitigation in Phase 9: the frontend disables the button while in flight. The proper fix is a transient `publishing` status (new enum value + badge + crash-recovery for wedged rows) — deferred, see Out of Scope.

---

## Phase 7 — OAuth Endpoints

**New: `app/api/v1/social.py`**, mounted via `app/api/v1/router.py`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/auth/instagram` | Build the Meta authorize URL, 302 redirect |
| `GET` | `/auth/instagram/callback` | Exchange `code`, resolve page token + ig_user_id, print for `.env`, 302 → `/app/#settings?ig=connected` |

Token chain (4 upstream calls):

```
1) GET /v21.0/oauth/access_token  (client_id, client_secret, redirect_uri, code)
   -> short-lived user token
2) GET /v21.0/oauth/access_token  (grant_type=fb_exchange_token, fb_exchange_token=<user token>)
   -> long-lived user token (~60 days)
3) GET /v21.0/me/accounts?fields=id,name,access_token
   -> page access token   (no expiry while you hold Page admin)
4) GET /v21.0/{page_id}?fields=instagram_business_account
   -> ig_user_id  == INSTAGRAM_BUSINESS_ACCOUNT_ID
```

`state` is a random hex echoed back and compared in the callback (CSRF).

**Deliberately does not persist tokens.** Single-user app; `.env` is the store. Avoids shipping a token-encryption surface for a token that lives on your own disk.

---

## Phase 8 — Meta Console (manual, you)

On the **Facebook Login** product (not "Instagram Basic Display" — deprecated):

| Field | Value |
|---|---|
| Valid OAuth Redirect URIs | `https://api.sabbalens.me/api/v1/auth/instagram/callback` |
| | `http://localhost:8000/api/v1/auth/instagram/callback` |

**No App Review needed to test.** You are the app admin, so `instagram_content_publish` is grantable in Development Mode against your own IG account. Review is only required for third-party users.

---

## Phase 9 — Frontend

### 9a. Settings row

`frontend_v1/index.html` — replace the static "Auto-publishing … not connected" row:

```html
<div class="settings-row">
  <dt>Instagram publishing</dt>
  <dd>
    <span class="status-badge status-badge--failed" id="settings-ig">not connected</span>
    <a class="text-link" id="settings-ig-connect" href="/api/v1/auth/instagram">Connect →</a>
  </dd>
</div>
```

`frontend_v1/app.js` — in `loadSettings()`, detect `?ig=connected` and flip the badge to `status-badge--published` / "connected".

### 9b. Rewire `handlePublishNow` (`app.js:295-313`)

Replaces the current PATCH-only fake. Key changes:

```js
async function handlePublishNow() {
  if (!currentPhotoId) { showToast('Import or open a photo first', 'error'); return false; }
  var destinations = getSelectedDestinations();
  if (destinations.length === 0) { showToast('Select at least one destination', 'error'); return false; }

  var btn = document.getElementById('publish-now-btn');
  btn.disabled = true;                       // guard against double-click duplicates

  try {
    var res = await fetch(API_BASE + '/photos/' + encodeURIComponent(currentPhotoId) + '/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caption: document.getElementById('caption').value.trim() || null,
        destinations: destinations.join(',')
      })
    });
    if (!res.ok) {
      var body = await res.json().catch(function () { return {}; });
      throw new Error(body.detail || ('HTTP ' + res.status));
    }
    renderPhoto(await res.json());
    showToast('Published to Instagram', 'success');
    return true;
  } catch (e) {
    showToast('Publish failed: ' + e.message, 'error');
    return false;
  } finally {
    btn.disabled = false;
  }
}
```

Changes vs. current:
- `PATCH {status:'published'}` → `POST /publish`
- No longer sends `published_at` — server is authoritative
- Button disabled during flight (duplicate guard)
- Honest toasts: `Published to Instagram` / `Publish failed: <Meta message>`
- Still shows an error toast for unsaved-but-attempted captions (same 0.3s window as `handleSchedule`)

### 9c. Retry affordance

In `buildPhotoCard` (`app.js:512`), a `failed` card shows a `Retry` action that calls `handlePublishNow`-equivalent for that id. Minimal version: the existing card click already opens it in the scheduler, where "Publish Now" retries — **no new code needed for MVP**, just copy on the badge tooltip.

---

## Phase 10 — Tests

**New: `tests/test_social.py`** — no network; `httpx.MockTransport` + monkeypatched settings.

| Test | Asserts |
|---|---|
| `test_publish_returns_media_id` | both endpoints called in order, media id returned |
| `test_publish_rejects_unsupported_format` | `.heic` → `InstagramError`, no HTTP call |
| `test_publish_requires_token` | empty settings → `InstagramError`, no HTTP call |
| `test_publish_surfaces_container_error` | Meta 400 → `InstagramError` containing the body |
| `test_get_public_url_uses_basename` | `/data/uploads/abc.jpg` → `.../uploads/abc.jpg` |

**New: `tests/test_publish_endpoint.py`**

| Test | Asserts |
|---|---|
| `test_publish_now_marks_published` | draft → `published`, `instagram_media_id` set |
| `test_publish_now_sets_server_timestamp` | `published_at` ≈ now, not client-supplied |
| `test_publish_now_saves_caption` | body caption persisted and used |
| `test_publish_now_rejects_unsupported_format` | `.webp` → 400, no HTTP call |
| `test_publish_now_conflicts_when_published` | already `published` → 409, no HTTP call |
| `test_publish_now_retries_failed_row` | `failed` → succeeds → `published` |
| `test_publish_now_marks_permanent_failure` | permanent error → 502 + status `failed` |
| `test_publish_now_keeps_status_on_transient` | "download failed" → 502, status unchanged |

**Existing `tests/test_photos.py`:** `TestScheduler` keeps calling `publish_scheduled_photos()` synchronously — unchanged — but needs `social.publish_to_instagram` monkeypatched to avoid real network calls.

**Extend `TestPhotoCRUD`:**

| Test | Asserts |
|---|---|
| `test_patch_rejects_unsupported_publish` | `PATCH {status:'scheduled'}` on `.webp` → 400 |

---

## Deploy Ordering (must follow)

**Tokens must exist before the first publisher tick.** Without them every due row raises "not connected", which `is_transient` does *not* match — so rows would go to `failed`, a terminal state with no automatic retry.

```
1. Phase 1-2 (format limit, public URL)       inert
2. Phase 7-8 (OAuth endpoints + console)      inert until you visit the URL
3. Complete OAuth, paste 2 values into .env   tokens now exist
4. Phase 4-5 (publish service + publisher)     safe to start ticking
5. Phase 3 (guard), Phase 6 (endpoint)         safe anytime after 4
6. Phase 9-10 (frontend, tests)
```

No rows are at risk today (all 6 pending rows are dated 2027/2099), but this ordering governs any future past-dated or newly-scheduled row.

---

## Remaining Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Machine/tunnel down at publish time | **High** | Accepted for MVP; post retries next tick if transient. Documented. R2 is the production answer |
| Double-click on "Publish Now" → duplicate IG post | Medium | Button disabled in-flight (Phase 9b). Proper fix is a `publishing` status — deferred |
| Tunnel URL blocked by Meta for any reason | Medium | Container creation fails; error surfaced verbatim in the toast |
| Page admin access lost | Medium | Meta error `(#190)` → `failed` + visible error; re-run OAuth |
| Caption > 2200 chars | Low | Column is `String(2000)` — already under Meta's limit |
| Rate limit 200 publishes/hour | Low | Single-user volume; 60s poll = 240 local reads/hour, trivial for SQLite |
| 60s poll → up to 60s late publish | Low | Accepted (decision #7) |

---

## Out of Scope

| Item | Why |
|------|-----|
| Cloudflare R2 / S3 / boto3 | Tunnel already serves public HTTPS images |
| `SocialAccount` table + Fernet encryption | Single-user; `.env` is the store |
| Token refresh job | Page tokens don't expire while you hold Page admin |
| `retry_count` column / exponential backoff | Transient errors stay `scheduled` and retry naturally |
| Transient `publishing` status + badge | Would fix double-click properly, but adds an enum value and a wedged-row crash-recovery path. Deferred |
| Carousel / Reels / Stories | Image posts only |
| Threads / Bluesky publishers | `destinations` still an unwired string |
| App Review submission | Only needed for third-party users |
| HEIC/WebP transcode | Restricted out; Pillow would become a runtime dep |
| Scheduled-row cancel / reschedule | Noted UX gap, separate sprint |

---

## Follow-Ups (post-merge)

1. **Rotate the Meta App Secret** — it was pasted into chat and stored plaintext in `.env`. Regenerate in the developer console.
2. **README note** — document that publishing requires the machine + tunnel to be up at publish time.
3. **Structured logging** — Sprint 1 deferred it; the publisher's error handling now depends on real log output.
4. **Test deps in CI** — `pytest`, `pytest-asyncio`, `pillow`, `piexif` are installed ad-hoc in `.venv`, not declared in any requirements file.

---

*Plan ends. Ready to execute on approval.*
