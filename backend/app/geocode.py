"""Region string -> lat/lng. Normalize -> offline gazetteer -> Nominatim (1 req/s, cached) -> country centroid."""
from __future__ import annotations

import asyncio
import re
import time
from typing import Any

import httpx
from diskcache import Cache

from app.config import settings

UA = "vantage-market-agent/0.1 (hackathon; contact: team)"
_cache = Cache(str(settings.cache_dir / "geo"))
_lock = asyncio.Lock()
_last = 0.0

US_STATES = {"AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"}
ISO3 = {"USA": "United States", "IND": "India", "GBR": "United Kingdom", "DEU": "Germany", "FRA": "France", "CAN": "Canada",
        "AUS": "Australia", "BRA": "Brazil", "SGP": "Singapore", "NLD": "Netherlands", "ESP": "Spain", "ISR": "Israel",
        "PAK": "Pakistan", "EGY": "Egypt", "KAZ": "Kazakhstan", "MYS": "Malaysia", "PRT": "Portugal", "POL": "Poland",
        "IRL": "Ireland", "MEX": "Mexico", "JPN": "Japan", "KOR": "South Korea", "CHN": "China", "ARE": "United Arab Emirates",
        "SWE": "Sweden", "CHE": "Switzerland", "ITA": "Italy", "ARG": "Argentina", "COL": "Colombia", "PHL": "Philippines",
        "VNM": "Vietnam", "IDN": "Indonesia", "NGA": "Nigeria", "KEN": "Kenya", "ZAF": "South Africa", "TUR": "Turkey", "UKR": "Ukraine"}

# Small offline gazetteer of frequent hubs (lat, lng). Nominatim covers the rest.
GAZ: dict[str, tuple[float, float]] = {
    "san francisco": (37.7749, -122.4194), "san francisco bay area": (37.7749, -122.4194), "new york": (40.7128, -74.0060),
    "los angeles": (34.0522, -118.2437), "seattle": (47.6062, -122.3321), "austin": (30.2672, -97.7431), "boston": (42.3601, -71.0589),
    "chicago": (41.8781, -87.6298), "denver": (39.7392, -104.9903), "miami": (25.7617, -80.1918), "atlanta": (33.7490, -84.3880),
    "dallas": (32.7767, -96.7970), "toronto": (43.6532, -79.3832), "vancouver": (49.2827, -123.1207), "london": (51.5074, -0.1278),
    "paris": (48.8566, 2.3522), "berlin": (52.5200, 13.4050), "amsterdam": (52.3676, 4.9041), "dublin": (53.3498, -6.2603),
    "madrid": (40.4168, -3.7038), "barcelona": (41.3874, 2.1686), "lisbon": (38.7223, -9.1393), "warsaw": (52.2297, 21.0122),
    "stockholm": (59.3293, 18.0686), "zurich": (47.3769, 8.5417), "tel aviv": (32.0853, 34.7818), "dubai": (25.2048, 55.2708),
    "singapore": (1.3521, 103.8198), "sydney": (-33.8688, 151.2093), "melbourne": (-37.8136, 144.9631), "tokyo": (35.6762, 139.6503),
    "seoul": (37.5665, 126.9780), "shanghai": (31.2304, 121.4737), "beijing": (39.9042, 116.4074), "hong kong": (22.3193, 114.1694),
    "bengaluru": (12.9716, 77.5946), "bangalore": (12.9716, 77.5946), "mumbai": (19.0760, 72.8777), "delhi": (28.6139, 77.2090),
    "new delhi": (28.6139, 77.2090), "gurgaon": (28.4595, 77.0266), "gurugram": (28.4595, 77.0266), "noida": (28.5355, 77.3910),
    "hyderabad": (17.3850, 78.4867), "chennai": (13.0827, 80.2707), "pune": (18.5204, 73.8567), "kolkata": (22.5726, 88.3639),
    "ahmedabad": (23.0225, 72.5714), "surat": (21.1702, 72.8311), "jaipur": (26.9124, 75.7873), "chandigarh": (30.7333, 76.7794),
    "são paulo": (-23.5505, -46.6333), "sao paulo": (-23.5505, -46.6333), "mexico city": (19.4326, -99.1332), "buenos aires": (-34.6037, -58.3816),
    "lagos": (6.5244, 3.3792), "nairobi": (-1.2921, 36.8219), "cairo": (30.0444, 31.2357), "karachi": (24.8607, 67.0011), "lahore": (31.5204, 74.3587),
    "manila": (14.5995, 120.9842), "jakarta": (-6.2088, 106.8456), "ho chi minh city": (10.8231, 106.6297), "kuala lumpur": (3.1390, 101.6869),
    "almaty": (43.2220, 76.8512), "алматы": (43.2220, 76.8512), "redwood city": (37.4852, -122.2364), "santa clara": (37.3541, -121.9552),
    "santa monica": (34.0195, -118.4912), "palo alto": (37.4419, -122.1430), "mountain view": (37.3861, -122.0839), "san jose": (37.3382, -121.8863),
    "dover": (39.1582, -75.5244), "newark": (39.6837, -75.7497), "wilmington": (39.7391, -75.5398), "albany": (42.6526, -73.7562),
    "raleigh": (35.7796, -78.6382), "charlotte": (35.2271, -80.8431), "groningen": (53.2194, 6.5665), "irvine": (33.6846, -117.8265),
    "remote": (0.0, 0.0),
}
COUNTRY_CENTROID: dict[str, tuple[float, float]] = {
    "United States": (39.8, -98.6), "India": (22.6, 79.0), "United Kingdom": (54.0, -2.5), "Germany": (51.1, 10.4), "France": (46.6, 2.3),
    "Canada": (56.1, -106.3), "Australia": (-25.3, 133.8), "Brazil": (-14.2, -51.9), "Singapore": (1.35, 103.8), "Netherlands": (52.1, 5.3),
    "Spain": (40.4, -3.7), "Israel": (31.0, 34.9), "Pakistan": (30.4, 69.3), "Egypt": (26.8, 30.8), "Kazakhstan": (48.0, 66.9),
    "Malaysia": (4.2, 101.9), "Portugal": (39.4, -8.2), "Poland": (51.9, 19.1), "Ireland": (53.1, -8.2), "Mexico": (23.6, -102.5),
    "Japan": (36.2, 138.3), "South Korea": (35.9, 127.8), "China": (35.9, 104.2), "United Arab Emirates": (23.4, 53.8), "Sweden": (60.1, 18.6),
    "Switzerland": (46.8, 8.2), "Italy": (41.9, 12.6), "Argentina": (-38.4, -63.6), "Colombia": (4.6, -74.3), "Philippines": (12.9, 121.8),
    "Vietnam": (14.1, 108.3), "Indonesia": (-0.8, 113.9), "Nigeria": (9.1, 8.7), "Kenya": (-0.0, 37.9), "South Africa": (-30.6, 22.9),
    "Turkey": (39.0, 35.2), "Ukraine": (48.4, 31.2), "Europe": (50.0, 10.0),
}


def normalize(raw: str, country_hint: str | None = None) -> tuple[str, str | None]:
    """Return (query, country). Strips 'Greater X Area', 'X Metropolitan Area', expands 'Dallas, TX'."""
    s = raw.strip()
    s = re.sub(r"^greater\s+", "", s, flags=re.I)
    s = re.sub(r"\s+(metropolitan\s+area|metro\s+area|area|metro|region)$", "", s, flags=re.I)
    parts = [p.strip() for p in s.split(",") if p.strip()]
    country = None
    if parts and parts[-1] in ISO3:
        parts[-1] = ISO3[parts[-1]]
    if len(parts) >= 2 and parts[-1] in COUNTRY_CENTROID:
        country = parts[-1]
    if len(parts) >= 2 and parts[1].upper() in US_STATES:
        country = "United States"
        parts = [parts[0], parts[1].upper(), "United States"]
    if country is None and len(parts) == 2 and len(parts[1]) == 2 and parts[1].upper() not in US_STATES:
        return ", ".join(parts), None  # "Toronto, ON": leave it alone, skip the country sanity check
    if country is None and country_hint and len(parts) == 1:
        name = ISO3.get(country_hint) or (country_hint if country_hint in COUNTRY_CENTROID else None)
        if name:
            country = name
            parts.append(country)
    return ", ".join(parts), country


async def geocode(raw: str, country_hint: str | None = None) -> dict[str, Any] | None:
    """Returns {lat, lng, label, source} or None."""
    if not raw:
        return None
    q, country = normalize(raw, country_hint)
    city = q.split(",")[0].strip().lower()
    if city in GAZ:
        lat, lng = GAZ[city]
        return {"lat": lat, "lng": lng, "label": q, "source": "gazetteer"}
    if city in _CC:
        lat, lng = _CC[city]
        return {"lat": lat, "lng": lng, "label": q.split(",")[0].strip(), "source": "country"}
    key = "nom:" + q.lower()
    if key in _cache:
        return _cache[key]
    hit, completed = await _nominatim(q, country)
    if hit is None and country:
        lat, lng = COUNTRY_CENTROID.get(country, (None, None))
        hit = {"lat": lat, "lng": lng, "label": country, "source": "country-fallback"} if lat is not None else None
    # cache real answers for 90 days; transient failures only briefly
    _cache.set(key, hit, expire=90 * 24 * 3600 if completed and hit and hit["source"] == "nominatim" else 3600)
    return hit


_CC = {k.lower(): v for k, v in COUNTRY_CENTROID.items()}


async def _nominatim(q: str, country: str | None) -> tuple[dict[str, Any] | None, bool]:
    """Returns (hit, completed). completed=False means a transient failure, not 'no such place'."""
    global _last
    async with _lock:
        wait = _last + 1.05 - time.monotonic()
        if wait > 0:
            await asyncio.sleep(wait)
        _last = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=15.0, headers={"User-Agent": UA}) as h:
                r = await h.get("https://nominatim.openstreetmap.org/search",
                                params={"format": "json", "limit": 1, "q": q, "addressdetails": 1})
                if r.status_code != 200:
                    return None, False
                rows = r.json()
        except Exception:
            return None, False
    if not rows:
        return None, True
    row = rows[0]
    found_country = (row.get("address") or {}).get("country")
    if country and found_country and country.lower() not in found_country.lower() and found_country.lower() not in country.lower():
        return None, True  # sanity check: wrong country
    return {"lat": float(row["lat"]), "lng": float(row["lon"]), "label": row.get("display_name", q)[:80], "source": "nominatim"}, True
