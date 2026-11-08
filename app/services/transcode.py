import io
from pathlib import Path
from PIL import Image, ImageOps
import pillow_heif

pillow_heif.register_heif_opener()

TRANSCODE_EXTENSIONS = {".heic", ".heif", ".webp"}


def should_transcode(filename: str) -> bool:
    """Return True if the file extension needs transcoding to JPEG."""
    ext = Path(filename).suffix.lower()
    return ext in TRANSCODE_EXTENSIONS


def transcode_to_jpeg(image_bytes: bytes, quality: int = 95) -> bytes:
    """Transcode an image in-memory to an RGB JPEG byte string,
    auto-orienting via EXIF and preserving existing EXIF tags where possible.
    """
    with Image.open(io.BytesIO(image_bytes)) as img:
        try:
            img = ImageOps.exif_transpose(img)
        except Exception:
            pass

        if img.mode != "RGB":
            img = img.convert("RGB")

        out_buf = io.BytesIO()
        save_kwargs = {"format": "JPEG", "quality": quality}
        exif_bytes = img.info.get("exif")
        if exif_bytes:
            save_kwargs["exif"] = exif_bytes

        img.save(out_buf, **save_kwargs)
        return out_buf.getvalue()
