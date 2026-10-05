import pytest
from httpx import AsyncClient
import io
from PIL import Image
import piexif
import os


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