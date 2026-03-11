"""
Weather Service — Open-Meteo Integration
Fetches real-time weather data and classifies it into KEPLER climate categories.
Uses Open-Meteo (free, no API key required).
"""

import httpx
import time
from typing import Optional

# Cache: { "lat,lng": { "data": {...}, "timestamp": float } }
_cache: dict = {}
CACHE_TTL = 900  # 15 minutes in seconds

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


class WeatherResult:
    """Structured weather result with KEPLER classification."""

    def __init__(self, temperatura: float, lluvia: float, viento: float,
                 categoria: str, multiplicador: float):
        self.temperatura = temperatura
        self.lluvia = lluvia
        self.viento = viento
        self.categoria = categoria
        self.multiplicador = multiplicador

    def to_dict(self):
        return {
            "temperatura_c": self.temperatura,
            "lluvia_mm": self.lluvia,
            "viento_kmh": self.viento,
            "categoria": self.categoria,
            "multiplicador": self.multiplicador,
        }


def _classify_weather(temp: float, rain: float, wind: float) -> tuple[str, float]:
    """
    Classify raw weather data into KEPLER categories.
    Returns (category_name, fatigue_multiplier).

    Priority order (most severe first):
      tormenta > viento_fuerte > lluvia > caluroso > frio > fresco
    """
    # Storm: heavy rain + strong wind
    if rain > 5 and wind > 40:
        return "tormenta", 2.2

    # Strong wind
    if wind > 40:
        return "viento_fuerte", 1.8

    # Rain
    if rain > 5:
        return "lluvia", 1.5

    # Temperature-based
    if temp > 35:
        return "caluroso", 1.3

    if temp < 15:
        return "frio", 1.2

    return "fresco", 1.0


async def get_weather(lat: float, lng: float) -> Optional[WeatherResult]:
    """
    Fetch current weather for the given coordinates.
    Results are cached for 15 minutes to respect API limits.
    """
    cache_key = f"{round(lat, 2)},{round(lng, 2)}"

    # Check cache
    if cache_key in _cache:
        entry = _cache[cache_key]
        if time.time() - entry["timestamp"] < CACHE_TTL:
            return entry["data"]

    try:
        params = {
            "latitude": lat,
            "longitude": lng,
            "current": "temperature_2m,rain,wind_speed_10m",
            "timezone": "auto",
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(OPEN_METEO_URL, params=params)
            response.raise_for_status()
            data = response.json()

        current = data.get("current", {})
        temp = current.get("temperature_2m", 25.0)
        rain = current.get("rain", 0.0)
        wind = current.get("wind_speed_10m", 0.0)

        categoria, multiplicador = _classify_weather(temp, rain, wind)

        result = WeatherResult(
            temperatura=temp,
            lluvia=rain,
            viento=wind,
            categoria=categoria,
            multiplicador=multiplicador,
        )

        # Cache the result
        _cache[cache_key] = {
            "data": result,
            "timestamp": time.time(),
        }

        return result

    except Exception as e:
        print(f"[WeatherService] Error fetching weather: {e}")
        # Return default "fresco" on error
        return WeatherResult(
            temperatura=25.0,
            lluvia=0.0,
            viento=0.0,
            categoria="fresco",
            multiplicador=1.0,
        )
