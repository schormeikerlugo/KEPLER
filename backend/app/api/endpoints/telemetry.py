"""
Realtime Telemetry Endpoint
---------------------------
Returns telemetry combining REAL environmental data (Open-Meteo + Air Quality)
with COHERENT simulated biometrics (BPM tied to GPS speed, radiation tied to UV).

If lat/lng are provided, real data is fetched; otherwise everything falls back
to simulation. Backend does NOT cache here — services manage their own 15-min
cache. Polling cadence is controlled by the client (5 min recommended for
remote data, 2 s for local APIs).
"""

from fastapi import APIRouter, Query
from typing import Optional
from datetime import datetime
import random

from app.services.weather_service import get_weather
from app.services.air_quality_service import get_air_quality

router = APIRouter()


def _coherent_biometrics(
    speed_mps: Optional[float],
    uv_index: Optional[float],
    apparent_temp: Optional[float],
) -> dict:
    """
    Generate biometric values that reactively correlate to real-world context:
      - BPM rises with movement (walking ~85, running ~110).
      - Radiation correlates with UV index (UV 6 → ~0.05 µSv/h).
      - Suit temperature ~ apparent ambient temperature minus 2°C.
      - Suit pressure stays in narrow realistic band (no real sensor).
    Adds small jitter so values are not static.
    """
    speed = speed_mps if (speed_mps is not None and speed_mps >= 0) else 0.0
    uv = uv_index if uv_index is not None else 1.0
    ambient = apparent_temp if apparent_temp is not None else 22.0

    bpm = int(70 + speed * 8 + random.uniform(-4, 4))
    bpm = max(55, min(180, bpm))

    radiation = round(0.02 + uv * 0.005 + random.uniform(-0.003, 0.003), 3)
    radiation = max(0.005, radiation)

    suit_temp = round(ambient - 2.0 + random.uniform(-0.5, 0.5), 1)
    suit_pressure = round(14.7 + random.uniform(-0.15, 0.15), 2)

    return {
        "heart_rate": bpm,
        "radiation": radiation,
        "suit_temperature": suit_temp,
        "suit_pressure": suit_pressure,
    }


def _simulated_only() -> dict:
    """No GPS available → fully simulated (legacy behaviour, low fidelity)."""
    return {
        "temperature": round(random.uniform(20.0, 24.0), 1),
        "apparent_temperature": round(random.uniform(20.0, 24.0), 1),
        "humidity": random.randint(40, 70),
        "wind_speed_kmh": round(random.uniform(0, 15), 1),
        "wind_gusts_kmh": round(random.uniform(0, 20), 1),
        "wind_direction": random.randint(0, 359),
        "pressure_hpa": round(random.uniform(1005, 1020), 1),
        "uv_index": round(random.uniform(0, 5), 1),
        "visibility_km": round(random.uniform(8, 15), 1),
        "cloud_cover": random.randint(0, 100),
        "oxygen_level": random.randint(90, 100),
        "air_quality_aqi": round(random.uniform(5, 25), 1),
        "pm2_5": round(random.uniform(0, 12), 1),
        "pm10": round(random.uniform(0, 20), 1),
        "location_name": None,
        "weather_category": "fresco",
        "air_category": "buena",
        **_coherent_biometrics(None, None, None),
        "data_sources": {
            "weather": "simulated",
            "air": "simulated",
            "biometric": "simulated",
        },
    }


@router.get("/realtime-telemetry")
async def telemetry(
    lat: Optional[float] = Query(None, description="GPS latitude (decimal)"),
    lng: Optional[float] = Query(None, description="GPS longitude (decimal)"),
    speed_mps: Optional[float] = Query(
        None, ge=0, description="Current GPS speed in m/s for coherent BPM"
    ),
):
    """
    Returns telemetry. With GPS coords, includes:
      - Real weather (Open-Meteo): temperature, humidity, wind, pressure, UV, visibility…
      - Real air quality (Open-Meteo AQ): AQI → oxygen_level (aire_pct), PM2.5, PM10…
      - Coherent simulated biometrics (BPM, radiation, suit_temperature).

    Without coords, falls back to fully simulated values.
    """
    timestamp = datetime.now().isoformat()

    # No coords → return fully simulated payload (also handle non-numeric edge cases)
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        payload = _simulated_only()
        payload["timestamp"] = timestamp
        return payload

    # Fetch real data in parallel-friendly order (weather then air; both cached)
    weather = await get_weather(lat, lng)
    air = await get_air_quality(lat, lng)

    # Defensive fallbacks (services already return safe defaults)
    apparent = (
        weather.sensacion_termica
        if weather and weather.sensacion_termica
        else (weather.temperatura if weather else 22.0)
    )
    uv = weather.uv_index if weather else 0.0

    bio = _coherent_biometrics(speed_mps, uv, apparent)

    return {
        # ── Environmental (real) ──
        "temperature": round(weather.temperatura, 1) if weather else None,
        "apparent_temperature": round(apparent, 1),
        "humidity": round(weather.humedad, 1) if weather else None,
        "wind_speed_kmh": round(weather.viento, 1) if weather else None,
        "wind_gusts_kmh": round(weather.wind_gusts, 1) if weather else None,
        "wind_direction": round(weather.wind_direction, 0) if weather else None,
        "pressure_hpa": round(weather.presion_hpa, 1) if weather else None,
        "uv_index": round(uv, 1),
        "visibility_km": (
            round(weather.visibilidad_m / 1000.0, 1) if weather else None
        ),
        "cloud_cover": round(weather.cloud_cover, 0) if weather else None,
        "rain_mm": round(weather.lluvia, 2) if weather else None,
        "weather_category": weather.categoria if weather else "desconocida",
        "location_name": weather.location_name if weather else None,

        # ── Air quality (real → maps to oxygen_level via aire_pct) ──
        "oxygen_level": round(air.aire_pct, 1) if air else 95.0,
        "air_quality_aqi": round(air.aqi, 1) if air else None,
        "pm2_5": round(air.pm2_5, 1) if air else None,
        "pm10": round(air.pm10, 1) if air else None,
        "ozone": round(air.ozone, 1) if air else None,
        "carbon_monoxide": round(air.carbon_monoxide, 1) if air else None,
        "air_category": air.category if air else "desconocida",

        # ── Biometric (coherent simulated) ──
        "heart_rate": bio["heart_rate"],
        "radiation": bio["radiation"],
        "suit_temperature": bio["suit_temperature"],
        "suit_pressure": bio["suit_pressure"],

        # ── Meta ──
        "timestamp": timestamp,
        "data_sources": {
            "weather": "open-meteo",
            "air": "open-meteo-aqi",
            "biometric": "simulated-coherent",
        },
    }
