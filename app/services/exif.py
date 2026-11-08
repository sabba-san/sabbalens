import io
from typing import Any
import exifread
from PIL import Image, ExifTags
import pillow_heif

pillow_heif.register_heif_opener()


def _rational_to_float(v: Any) -> float:
    if hasattr(v, "numerator") and hasattr(v, "denominator"):
        return float(v.numerator) / float(v.denominator) if v.denominator != 0 else 0.0
    if hasattr(v, "num") and hasattr(v, "den"):
        return float(v.num) / float(v.den) if v.den != 0 else 0.0
    return float(v)


def _dms_to_decimal(dms_tuple) -> float:
    if not dms_tuple or len(dms_tuple) < 3:
        return 0.0
    d = _rational_to_float(dms_tuple[0])
    m = _rational_to_float(dms_tuple[1])
    s = _rational_to_float(dms_tuple[2])
    return d + (m / 60.0) + (s / 3600.0)


def _extract_via_exifread(image_bytes: bytes) -> dict:
    tags = exifread.process_file(io.BytesIO(image_bytes), details=False)
    data = {}

    if "GPS GPSLatitude" in tags and "GPS GPSLongitude" in tags:
        lat = _dms_to_decimal(tags["GPS GPSLatitude"].values)
        lon = _dms_to_decimal(tags["GPS GPSLongitude"].values)

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


def _extract_via_pillow(image_bytes: bytes) -> dict:
    data = {}
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            exif = img.getexif()
            if not exif:
                return data

            # Camera make & model
            make = str(exif.get(ExifTags.Base.Make, "")).strip()
            model = str(exif.get(ExifTags.Base.Model, "")).strip()
            if make and model:
                data["camera"] = model if make in model else f"{make} {model}".strip()
            elif model:
                data["camera"] = model
            elif make:
                data["camera"] = make

            # GPS IFD
            gps_ifd = exif.get_ifd(ExifTags.IFD.GPSInfo)
            if gps_ifd:
                lat_raw = gps_ifd.get(ExifTags.GPS.GPSLatitude)
                lon_raw = gps_ifd.get(ExifTags.GPS.GPSLongitude)
                if lat_raw and lon_raw:
                    lat = _dms_to_decimal(lat_raw)
                    lon = _dms_to_decimal(lon_raw)
                    lat_ref = gps_ifd.get(ExifTags.GPS.GPSLatitudeRef, "N")
                    lon_ref = gps_ifd.get(ExifTags.GPS.GPSLongitudeRef, "E")
                    if str(lat_ref).strip() == "S":
                        lat = -lat
                    if str(lon_ref).strip() == "W":
                        lon = -lon
                    data["latitude"] = lat
                    data["longitude"] = lon

            # Exif SubIFD
            exif_ifd = exif.get_ifd(ExifTags.IFD.Exif)
            if exif_ifd:
                lens = exif_ifd.get(ExifTags.Base.LensModel)
                if lens:
                    data["lens"] = str(lens).strip()

                focal = exif_ifd.get(ExifTags.Base.FocalLength)
                if focal is not None:
                    f_val = _rational_to_float(focal)
                    data["focal_length"] = f"{f_val:g}mm"

                exp_time = exif_ifd.get(ExifTags.Base.ExposureTime)
                if exp_time is not None:
                    if hasattr(exp_time, "numerator") and hasattr(exp_time, "denominator"):
                        data["exposure_time"] = f"{exp_time.numerator}/{exp_time.denominator}s"
                    else:
                        exp_f = float(exp_time)
                        if 0 < exp_f < 1:
                            data["exposure_time"] = f"1/{int(round(1 / exp_f))}s"
                        else:
                            data["exposure_time"] = f"{exp_f:g}s"

                f_number = exif_ifd.get(ExifTags.Base.FNumber)
                if f_number is not None:
                    ap_val = _rational_to_float(f_number)
                    data["aperture"] = f"f/{ap_val:g}"

                iso = exif_ifd.get(ExifTags.Base.ISOSpeedRatings) or exif_ifd.get(ExifTags.Base.PhotographicSensitivity)
                if iso is not None:
                    try:
                        data["iso"] = int(iso)
                    except (ValueError, TypeError):
                        pass
    except Exception:
        pass

    return data


def extract_exif_data(image_bytes: bytes) -> dict:
    data = {}
    try:
        data = _extract_via_exifread(image_bytes)
    except Exception:
        data = {}

    # If exifread did not find GPS or camera info, supplement with Pillow/pillow-heif
    if not data or "latitude" not in data or not data.get("camera"):
        pillow_data = _extract_via_pillow(image_bytes)
        for k, v in pillow_data.items():
            if k not in data or data[k] is None:
                data[k] = v

    return data