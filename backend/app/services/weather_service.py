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
                 categoria: str, multiplicador: float, location_name: str = "Zona Desconocida"):
        self.temperatura = temperatura
        self.lluvia = lluvia
        self.viento = viento
        self.categoria = categoria
        self.multiplicador = multiplicador
        self.location_name = location_name

    def to_dict(self):
        return {
            "temperatura_c": self.temperatura,
            "lluvia_mm": self.lluvia,
            "viento_kmh": self.viento,
            "categoria": self.categoria,
            "multiplicador": self.multiplicador,
            "location_name": self.location_name,
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
    if temp > 32:
        return "caluroso", 1.3

    if temp < 15:
        return "frio", 1.2

    return "fresco", 1.0


async def get_weather(lat: float, lng: float) -> Optional[WeatherResult]:
    """
    Fetch current weather for the given coordinates, plus location name via reverse geocoding.
    Results are cached for 15 minutes to respect API limits.
    """
    cache_key = f"{round(lat, 2)},{round(lng, 2)}"

    # Check cache
    if cache_key in _cache:
        entry = _cache[cache_key]
        if time.time() - entry["timestamp"] < CACHE_TTL:
            return entry["data"]

    try:
        location_name = "Zona Desconocida"

        async with httpx.AsyncClient(timeout=10.0) as client:
            # 1. Fetch Weather
            params_weather = {
                "latitude": lat,
                "longitude": lng,
                "current": "temperature_2m,rain,wind_speed_10m",
                "timezone": "auto",
            }
            response_weather = await client.get(OPEN_METEO_URL, params=params_weather)
            response_weather.raise_for_status()
            data = response_weather.json()

            # 2. Fetch Location Name (Nominatim)
            try:
                nominatim_url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lng}&format=json"
                headers = {"User-Agent": "KEPLER-Explorer/1.0"}
                geo_response = await client.get(nominatim_url, headers=headers)
                if geo_response.status_code == 200:
                    geo_data = geo_response.json()
                    address = geo_data.get("address", {})
                    city = address.get("city") or address.get("town") or address.get("village") or address.get("county") or "Ubicación en Área Remota"
                    country = address.get("country", "")
                    location_name = f"{city}, {country}" if country else city
            except Exception as e:
                print(f"[WeatherService] Geocoding skipped/failed: {e}")

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
            location_name=location_name
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
            location_name="Sin Señal GPS"
        )
