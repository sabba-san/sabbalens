from functools import lru_cache
from geopy.geocoders import Nominatim
from geopy.extra.rate_limiter import RateLimiter
from app.core.config import settings


geolocator = Nominatim(user_agent=settings.nominatim_user_agent)
reverse_geocode = RateLimiter(
    geolocator.reverse,
    min_delay_seconds=settings.nominatim_rate_limit,
    return_value_on_exception=None,
)


@lru_cache(maxsize=512)
def get_location_name(lat: float, lon: float) -> str | None:
    # Round to ~110m (3 decimal places) for cache key stability
    lat_r = round(lat, 3)
    lon_r = round(lon, 3)
    location = reverse_geocode(f"{lat_r}, {lon_r}", language="en")
    if not location:
        return None
    address = location.raw.get("address", {})
    return (
        address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("state")
        or address.get("country")
        or "Unknown Location"
    )