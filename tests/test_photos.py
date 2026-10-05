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
        
        # Schedule it for the past
        past_time = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat().replace("+00:00", "Z")
        patch_resp = await client.patch(
            f"/api/v1/photos/{photo_id}",
            json={"status": "scheduled", "scheduled_at": past_time},
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