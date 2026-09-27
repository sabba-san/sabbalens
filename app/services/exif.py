import exifread
import io
from typing import Optional, Tuple


def _to_decimal(value) -> float:
    d, m, s = value.values
    return float(d.num) / float(d.den) + float(m.num) / float(m.den) / 60 + float(s.num) / float(s.den) / 3600


def extract_gps(image_bytes: bytes) -> Optional[Tuple[float, float]]:
    tags = exifread.process_file(io.BytesIO(image_bytes), details=False)
    
    if "GPS GPSLatitude" not in tags or "GPS GPSLongitude" not in tags:
        return None
    
    lat = _to_decimal(tags["GPS GPSLatitude"])
    lon = _to_decimal(tags["GPS GPSLongitude"])
    
    if tags.get("GPS GPSLatitudeRef", "").printable == "S":
        lat = -lat
    if tags.get("GPS GPSLongitudeRef", "").printable == "W":
        lon = -lon
    
    return lat, lon