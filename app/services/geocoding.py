from geopy.geocoders import Nominatim
from geopy.extra.rate_limiter import RateLimiter
from app.core.config import settings


geolocator = Nominatim(user_agent=settings.nominatim_user_agent)
reverse_geocode = RateLimiter(
    geolocator.reverse,
    min_delay_seconds=settings.nominatim_rate_limit,
    return_value_on_exception=None,
)


def get_location_name(lat: float, lon: float) -> str | None:
    location = reverse_geocode(f"{lat}, {lon}", language="en")
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