import pytest
from httpx import AsyncClient
import io
from PIL import Image
import piexif
import os
import asyncio
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock
from app.services.scheduler import scheduler
from app.tasks.publisher import publish_scheduled_photos
from app.core.database import SessionLocal
from app.models.photo import Photo, PhotoStatus


def create_test_image_with_gps(lat=37.7749, lon=-122.4194) -> bytes:
    """Generate a JPEG with GPS EXIF for testing."""
    img = Image.new("RGB", (400, 300), color="blue")
    buf = io.BytesIO()
    
    def dms(d):
        d = abs(d)
        return [(int(d), 1), (int((d - int(d)) * 60), 1), (int(((d - int(d)) * 60 - int((d - int(d)) * 60)) * 60 * 10000), 10000)]
    
    exif = {
        "GPS": {
            piexif.GPSIFD.GPSLatitudeRef: "N" if lat >= 0 else "S",
            piexif.GPSIFD.GPSLatitude: dms(lat),
            piexif.GPSIFD.GPSLongitudeRef: "E" if lon >= 0 else "W",
            piexif.GPSIFD.GPSLongitude: dms(lon),
        }
    }
    img.save(buf, format="JPEG", exif=piexif.dump(exif))
    return buf.getvalue()


class TestPhotoUpload:
    @pytest.mark.asyncio
    async def test_upload_valid_image_with_gps(self, client: AsyncClient):
        image_bytes = create_test_image_with_gps()
        files = {"file": ("test.jpg", image_bytes, "image/jpeg")}
        
        with patch("app.api.v1.photos.get_location_name", return_value="San Francisco, California, United States"):
            resp = await client.post("/api/v1/photos/upload", files=files)
        
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "draft"
        assert data["latitude"] == pytest.approx(37.7749, abs=0.001)
        assert data["longitude"] == pytest.approx(-122.4194, abs=0.001)
        assert data["location_name"] is not None
        assert "San Francisco" in data["location_name"]

    @pytest.mark.asyncio
    async def test_upload_invalid_mime_type(self, client: AsyncClient):
        files = {"file": ("test.txt", b"not an image", "text/plain")}
        
        resp = await client.post("/api/v1/photos/upload", files=files)
        
        assert resp.status_code == 400
        assert "image" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_upload_invalid_extension(self, client: AsyncClient):
        files = {"file": ("test.exe", b"fake", "application/octet-stream")}
        
        resp = await client.post("/api/v1/photos/upload", files=files)
        
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_upload_heic_transcodes_to_jpeg(self, client: AsyncClient):
        img = Image.new("RGB", (200, 200), color="green")
        buf = io.BytesIO()
        try:
            img.save(buf, format="HEIF")
            content = buf.getvalue()
            filename = "test_iphone.heic"
            content_type = "image/heic"
        except Exception:
            # Fallback to WEBP if HEIF encoder is unavailable in test environment
            img.save(buf, format="WEBP")
            content = buf.getvalue()
            filename = "test_photo.webp"
            content_type = "image/webp"

        files = {"file": (filename, content, content_type)}
        resp = await client.post("/api/v1/photos/upload", files=files)
        assert resp.status_code == 201
        data = resp.json()
        assert data["filename"].endswith(".jpg")
        assert data["file_path"].endswith(".jpg")
        assert os.path.exists(data["file_path"])

        # Check JPEG magic bytes
        with open(data["file_path"], "rb") as f:
            header = f.read(3)
            assert header == b"\xff\xd8\xff"

        # Check that publish format guard passes
        patch_resp = await client.patch(
            f"/api/v1/photos/{data['id']}",
            json={"status": "scheduled", "scheduled_at": "2099-01-01T00:00:00Z"},
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["status"] == "scheduled"


class TestPhotoCRUD:
    @pytest.mark.asyncio
    async def test_patch_updates_caption_and_schedule(self, client: AsyncClient):
        # First upload
        image_bytes = create_test_image_with_gps()
        files = {"file": ("test.jpg", image_bytes, "image/jpeg")}
        upload_resp = await client.post("/api/v1/photos/upload", files=files)
        photo_id = upload_resp.json()["id"]
        
        # Patch caption + schedule
        patch_resp = await client.patch(
            f"/api/v1/photos/{photo_id}",
            json={
                "caption": "Test caption",
                "status": "scheduled",
                "scheduled_at": "2099-12-31T23:59:00Z",
            },
        )
        
        assert patch_resp.status_code == 200
        data = patch_resp.json()
        assert data["caption"] == "Test caption"
        assert data["status"] == "scheduled"
        assert data["scheduled_at"] is not None

    @pytest.mark.asyncio
    async def test_cancel_photo_schedule(self, client: AsyncClient):
        image_bytes = create_test_image_with_gps()
        files = {"file": ("test.jpg", image_bytes, "image/jpeg")}
        upload_resp = await client.post("/api/v1/photos/upload", files=files)
        photo_id = upload_resp.json()["id"]

        await client.patch(
            f"/api/v1/photos/{photo_id}",
            json={"status": "scheduled", "scheduled_at": "2099-12-31T23:59:00Z"},
        )

        # Cancel: revert to draft and clear schedule
        cancel_resp = await client.patch(
            f"/api/v1/photos/{photo_id}",
            json={"status": "draft", "scheduled_at": None},
        )

        assert cancel_resp.status_code == 200
        data = cancel_resp.json()
        assert data["status"] == "draft"
        assert data["scheduled_at"] is None

    @pytest.mark.asyncio
    async def test_patch_manual_metadata_overrides(self, client: AsyncClient):
        image_bytes = create_test_image_with_gps()
        files = {"file": ("test_meta.jpg", image_bytes, "image/jpeg")}
        upload_resp = await client.post("/api/v1/photos/upload", files=files)
        photo_id = upload_resp.json()["id"]

        patch_resp = await client.patch(
            f"/api/v1/photos/{photo_id}",
            json={
                "camera": "Sony A7 IV",
                "lens": "FE 24-70mm F2.8 GM II",
                "focal_length": "50mm",
                "exposure_time": "1/250s",
                "aperture": "f/2.8",
                "iso": 100,
                "location_name": "Tokyo, Japan",
            },
        )
        assert patch_resp.status_code == 200
        data = patch_resp.json()
        assert data["camera"] == "Sony A7 IV"
        assert data["lens"] == "FE 24-70mm F2.8 GM II"
        assert data["focal_length"] == "50mm"
        assert data["exposure_time"] == "1/250s"
        assert data["aperture"] == "f/2.8"
        assert data["iso"] == 100
        assert data["location_name"] == "Tokyo, Japan"
        assert data["filename"] == "test_meta.jpg"
        assert data["status"] == "draft"

    @pytest.mark.asyncio
    async def test_patch_coordinates_auto_geocodes_location(self, client: AsyncClient):
        image_bytes = create_test_image_with_gps()
        files = {"file": ("test_geo.jpg", image_bytes, "image/jpeg")}
        upload_resp = await client.post("/api/v1/photos/upload", files=files)
        photo_id = upload_resp.json()["id"]

        with patch("app.api.v1.photos.get_location_name", return_value="Paris, France") as mock_geo:
            patch_resp = await client.patch(
                f"/api/v1/photos/{photo_id}",
                json={"latitude": 48.8566, "longitude": 2.3522},
            )
            assert patch_resp.status_code == 200
            mock_geo.assert_called_once_with(48.8566, 2.3522)
            data = patch_resp.json()
            assert data["location_name"] == "Paris, France"
            assert data["latitude"] == pytest.approx(48.8566)
            assert data["longitude"] == pytest.approx(2.3522)


class TestPhotoDelete:
    @pytest.mark.asyncio
    async def test_delete_removes_file_from_disk(self, client: AsyncClient):
        image_bytes = create_test_image_with_gps()
        files = {"file": ("test.jpg", image_bytes, "image/jpeg")}
        upload_resp = await client.post("/api/v1/photos/upload", files=files)
        photo_id = upload_resp.json()["id"]
        file_path = upload_resp.json()["file_path"]
        
        # Verify file exists
        assert os.path.exists(file_path)
        
        # Delete
        del_resp = await client.delete(f"/api/v1/photos/{photo_id}")
        assert del_resp.status_code == 204
        
        # Verify file gone
        assert not os.path.exists(file_path)


class TestScheduler:
    @pytest.mark.asyncio
    async def test_scheduler_publishes_due_photos(self, client: AsyncClient):
        """Test that the scheduler job publishes photos with past scheduled_at."""
        # Upload a photo
        image_bytes = create_test_image_with_gps()
        files = {"file": ("test_sched.jpg", image_bytes, "image/jpeg")}
        upload_resp = await client.post("/api/v1/photos/upload", files=files)
        photo_id = upload_resp.json()["id"]
        
        # Schedule it for the past with instagram destination
        past_time = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat().replace("+00:00", "Z")
        patch_resp = await client.patch(
            f"/api/v1/photos/{photo_id}",
            json={"status": "scheduled", "scheduled_at": past_time, "destinations": "instagram"},
        )
        assert patch_resp.status_code == 200
        
        # Run the publisher job directly (simulating scheduler tick)
        with patch("app.tasks.publisher.social.publish_to_instagram", return_value="ig_media_12345") as mock_publish:
            publish_scheduled_photos()
            mock_publish.assert_called_once()
        
        # Verify photo was published
        get_resp = await client.get(f"/api/v1/photos/{photo_id}")
        data = get_resp.json()
        assert data["status"] == "published"
        assert data["published_at"] is not None
        assert data["instagram_media_id"] == "ig_media_12345"
        
    @pytest.mark.asyncio
    async def test_scheduler_does_not_publish_future_photos(self, client: AsyncClient):
        """Test that scheduler ignores photos scheduled for the future."""
        image_bytes = create_test_image_with_gps()
        files = {"file": ("test_future.jpg", image_bytes, "image/jpeg")}
        upload_resp = await client.post("/api/v1/photos/upload", files=files)
        photo_id = upload_resp.json()["id"]
        
        # Schedule for far future
        future_time = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat().replace("+00:00", "Z")
        await client.patch(
            f"/api/v1/photos/{photo_id}",
            json={"status": "scheduled", "scheduled_at": future_time},
        )
        
        # Run publisher job
        with patch("app.tasks.publisher.social.publish_to_instagram") as mock_publish:
            publish_scheduled_photos()
            mock_publish.assert_not_called()
        
        # Verify photo remains scheduled
        get_resp = await client.get(f"/api/v1/photos/{photo_id}")
        data = get_resp.json()
        assert data["status"] == "scheduled"
        assert data["published_at"] is None
        
    @pytest.mark.asyncio
    async def test_scheduler_job_registered(self):
        """Verify the publisher job can be registered with the scheduler."""
        # In test context, register the job ourselves
        from app.tasks.publisher import register_publisher_job
        register_publisher_job()
        
        jobs = scheduler.get_jobs()
        job_ids = [job.id for job in jobs]
        assert "publish_scheduled_photos" in job_ids
        
        # Verify trigger is 60-second interval
        job = next(j for j in jobs if j.id == "publish_scheduled_photos")
        assert job.trigger.interval.total_seconds() == 60


class TestSocialIntegration:
    @pytest.mark.asyncio
    async def test_get_social_status(self, client: AsyncClient):
        resp = await client.get("/api/v1/auth/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "instagram" in data
        assert "mode" in data["instagram"]
        assert data["instagram"]["mode"] == "simulation"
        assert data["instagram"]["connected"] is False

    @pytest.mark.asyncio
    async def test_publish_now_simulation_mode(self, client: AsyncClient):
        image_bytes = create_test_image_with_gps()
        files = {"file": ("test_sim_pub.jpg", image_bytes, "image/jpeg")}
        upload_resp = await client.post("/api/v1/photos/upload", files=files)
        assert upload_resp.status_code == 201
        photo_id = upload_resp.json()["id"]

        pub_resp = await client.post(f"/api/v1/photos/{photo_id}/publish", json={"caption": "Simulated live post"})
        assert pub_resp.status_code == 200
        data = pub_resp.json()
        assert data["status"] == "published"
        assert data["telegram_message_id"].startswith("sim_tele_")
        assert data["published_at"] is not None

    @pytest.mark.asyncio
    async def test_scheduler_simulation_auto_publish(self, client: AsyncClient):
        image_bytes = create_test_image_with_gps()
        files = {"file": ("test_sim_sched.jpg", image_bytes, "image/jpeg")}
        upload_resp = await client.post("/api/v1/photos/upload", files=files)
        photo_id = upload_resp.json()["id"]

        past_time = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat().replace("+00:00", "Z")
        patch_resp = await client.patch(
            f"/api/v1/photos/{photo_id}",
            json={"status": "scheduled", "scheduled_at": past_time, "caption": "Auto-published simulation"},
        )
        assert patch_resp.status_code == 200

        # Run scheduler publisher worker without mocks (uses simulation mode)
        publish_scheduled_photos()

        get_resp = await client.get(f"/api/v1/photos/{photo_id}")
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["status"] == "published"
        assert data["telegram_message_id"].startswith("sim_tele_")
        assert data["published_at"] is not None


class TestFrontendMounts:
    @pytest.mark.asyncio
    async def test_frontend_v2_main_and_alias_mounts(self, client: AsyncClient):
        app_resp = await client.get("/app/")
        assert app_resp.status_code == 200
        assert "Sabbalens - Scheduler" in app_resp.text
        assert "photo-filmstrip" in app_resp.text

        v2_resp = await client.get("/v2/")
        assert v2_resp.status_code == 200
        assert "photo-filmstrip" in v2_resp.text

        root_resp = await client.get("/")
        assert root_resp.status_code == 200
        assert "Sabbalens" in root_resp.text
        assert "landing.js" in root_resp.text

        v1_resp = await client.get("/v1/")
        assert v1_resp.status_code == 404


class TestBulkSchedule:
    @pytest.mark.asyncio
    async def test_bulk_schedule_staggered(self, client: AsyncClient):
        img_bytes = create_test_image_with_gps()
        resp1 = await client.post("/api/v1/photos/upload", files={"file": ("bulk1.jpg", img_bytes, "image/jpeg")})
        resp2 = await client.post("/api/v1/photos/upload", files={"file": ("bulk2.jpg", img_bytes, "image/jpeg")})
        id1, id2 = resp1.json()["id"], resp2.json()["id"]

        start = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat().replace("+00:00", "Z")
        bulk_resp = await client.post(
            "/api/v1/photos/bulk-schedule",
            json={"photo_ids": [id1, id2], "start_time": start, "interval_minutes": 60},
        )
        assert bulk_resp.status_code == 200
        data = bulk_resp.json()
        assert len(data) == 2
        assert data[0]["status"] == "scheduled"
        assert data[1]["status"] == "scheduled"
        assert data[0]["scheduled_at"] != data[1]["scheduled_at"]

    @pytest.mark.asyncio
    async def test_bulk_schedule_missing_photo(self, client: AsyncClient):
        start = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat().replace("+00:00", "Z")
        bulk_resp = await client.post(
            "/api/v1/photos/bulk-schedule",
            json={"photo_ids": [999999], "start_time": start},
        )
        assert bulk_resp.status_code == 404