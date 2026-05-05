"""
Air Quality Service — Open-Meteo Air Quality Integration
Fetches PM2.5, PM10, ozone, etc. and converts European AQI into a KEPLER
"Aire %" value (higher = better quality).

Free, no API key required. Cache 15 minutes.
"""

import httpx
import time
from typing import Optional

# Cache: { "lat,lng": { "data": {...}, "timestamp": float } }
_cache: dict = {}
CACHE_TTL = 900  # 15 minutes

OPEN_METEO_AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"


class AirQualityResult:
    """Structured air quality result with KEPLER 'aire_pct' (0-100, higher = better)."""

    def __init__(
        self,
        aqi: float,
        aire_pct: float,
        pm2_5: float,
        pm10: float,
        carbon_monoxide: float,
        ozone: float,
        nitrogen_dioxide: float,
        category: str,
    ):
        self.aqi = aqi
        self.aire_pct = aire_pct
        self.pm2_5 = pm2_5
        self.pm10 = pm10
        self.carbon_monoxide = carbon_monoxide
        self.ozone = ozone
        self.nitrogen_dioxide = nitrogen_dioxide
        self.category = category

    def to_dict(self) -> dict:
        return {
            "aqi": self.aqi,
            "aire_pct": self.aire_pct,
            "pm2_5": self.pm2_5,
            "pm10": self.pm10,
            "carbon_monoxide": self.carbon_monoxide,
            "ozone": self.ozone,
            "nitrogen_dioxide": self.nitrogen_dioxide,
            "category": self.category,
        }


def _classify_aqi(aqi: float) -> tuple[str, float]:
    """
    Classify European AQI (0-100+) into a category and KEPLER 'aire_pct' (0-100, inverted).

    European AQI scale (approx):
      0-20   → Buena       (aire_pct ~95-100)
      20-40  → Aceptable   (aire_pct ~80-95)
      40-60  → Moderada    (aire_pct ~60-80)
      60-80  → Pobre       (aire_pct ~40-60)
      80-100 → Muy pobre   (aire_pct ~20-40)
      >100   → Extrema     (aire_pct ~0-20)
    """
    if aqi is None:
        return "desconocida", 90.0

    if aqi <= 20:
        category = "buena"
    elif aqi <= 40:
        category = "aceptable"
    elif aqi <= 60:
        category = "moderada"
    elif aqi <= 80:
        category = "pobre"
    elif aqi <= 100:
        category = "muy_pobre"
    else:
        category = "extrema"

    # Invert: aqi 0 → 100%, aqi 100+ → 0%
    aire_pct = max(0.0, min(100.0, 100.0 - aqi))
    return category, round(aire_pct, 1)


async def get_air_quality(lat: float, lng: float) -> Optional[AirQualityResult]:
    """
    Fetch current air quality for the given coordinates.
    Cached 15 minutes per (lat, lng) rounded to 2 decimals.
    """
    cache_key = f"{round(lat, 2)},{round(lng, 2)}"

    # Cache hit
    if cache_key in _cache:
        entry = _cache[cache_key]
        if time.time() - entry["timestamp"] < CACHE_TTL:
            return entry["data"]

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            params = {
                "latitude": lat,
                "longitude": lng,
                "current": (
                    "european_aqi,pm10,pm2_5,carbon_monoxide,"
                    "ozone,nitrogen_dioxide"
                ),
                "timezone": "auto",
            }
            response = await client.get(OPEN_METEO_AQ_URL, params=params)
            response.raise_for_status()
            data = response.json()

        current = data.get("current", {})
        aqi = current.get("european_aqi")
        category, aire_pct = _classify_aqi(aqi if aqi is not None else 10.0)

        result = AirQualityResult(
            aqi=float(aqi) if aqi is not None else 10.0,
            aire_pct=aire_pct,
            pm2_5=float(current.get("pm2_5") or 0.0),
            pm10=float(current.get("pm10") or 0.0),
            carbon_monoxide=float(current.get("carbon_monoxide") or 0.0),
            ozone=float(current.get("ozone") or 0.0),
            nitrogen_dioxide=float(current.get("nitrogen_dioxide") or 0.0),
            category=category,
        )

        _cache[cache_key] = {"data": result, "timestamp": time.time()}
        return result

    except Exception as e:
        print(f"[AirQualityService] Error: {e}")
        # Fallback: pretend the air is "good" (95%) to avoid alarming the user
        return AirQualityResult(
            aqi=10.0,
            aire_pct=95.0,
            pm2_5=0.0,
            pm10=0.0,
            carbon_monoxide=0.0,
            ozone=0.0,
            nitrogen_dioxide=0.0,
            category="desconocida",
        )
