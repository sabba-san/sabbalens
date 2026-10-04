import exifread
import io
from typing import Optional, Tuple


def _to_decimal(value) -> float:
    d, m, s = value.values
    return float(d.num) / float(d.den) + float(m.num) / float(m.den) / 60 + float(s.num) / float(s.den) / 3600


def extract_exif_data(image_bytes: bytes) -> dict:
    tags = exifread.process_file(io.BytesIO(image_bytes), details=False)
    
    data = {}
    
    if "GPS GPSLatitude" in tags and "GPS GPSLongitude" in tags:
        lat = _to_decimal(tags["GPS GPSLatitude"])
        lon = _to_decimal(tags["GPS GPSLongitude"])
        
        if tags.get("GPS GPSLatitudeRef", "").printable == "S":
            lat = -lat
        if tags.get("GPS GPSLongitudeRef", "").printable == "W":
            lon = -lon
        
        data["latitude"] = lat
        data["longitude"] = lon
    
    if "Image Make" in tags and "Image Model" in tags:
        data["camera"] = f"{tags['Image Make'].printable} {tags['Image Model'].printable}".strip()
    elif "Image Model" in tags:
        data["camera"] = tags["Image Model"].printable
        
    if "EXIF LensModel" in tags:
        data["lens"] = tags["EXIF LensModel"].printable
        
    if "EXIF FocalLength" in tags:
        val = tags["EXIF FocalLength"].values[0]
        data["focal_length"] = f"{val.num / val.den}mm" if val.den != 0 else f"{val.num}mm"
        
    if "EXIF ExposureTime" in tags:
        val = tags["EXIF ExposureTime"].values[0]
        data["exposure_time"] = f"{val.num}/{val.den}s"
        
    if "EXIF FNumber" in tags:
        val = tags["EXIF FNumber"].values[0]
        data["aperture"] = f"f/{val.num / val.den}" if val.den != 0 else f"f/{val.num}"
        
    if "EXIF ISOSpeedRatings" in tags:
        data["iso"] = tags["EXIF ISOSpeedRatings"].values[0]
        
    return data