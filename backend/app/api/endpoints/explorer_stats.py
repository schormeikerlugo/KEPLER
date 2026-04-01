"""
Explorer Stats Endpoint
Calculates dynamic stats for the explorer's profile:
  - Desgaste del Calzado (shoe wear, cumulative)
  - Resistencia Física (stamina, dynamic with recovery)

GET /api/explorer/stats  (JWT-authenticated)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime, timezone, timedelta
from typing import Optional
import os

from app.api.deps import get_current_user, get_supabase_client
from app.services.weather_service import get_weather

router = APIRouter()

# ── Terrain multipliers ──
TERRAIN_MULTIPLIERS = {
    "llano": 1.0,
    "asfalto": 1.0,
    "tierra": 1.5,
    "barro": 1.5,
    "irregular": 1.5,
    "rocoso": 2.5,
    "montaña": 2.5,
    "montañoso": 2.5,
    "crater": 2.5,
}

DEFAULT_TERRAIN_MULT = 1.5  # Default if terrain type is unknown


def _get_terrain_multiplier(terrain_type: str) -> float:
    """Get the wear multiplier for a given terrain type."""
    if not terrain_type:
        return DEFAULT_TERRAIN_MULT
    return TERRAIN_MULTIPLIERS.get(terrain_type.lower().strip(), DEFAULT_TERRAIN_MULT)


def _calculate_shoe_wear(missions_with_routes: list) -> float:
    """
    Calculate cumulative shoe wear percentage (0–100).

    Formula: Desgaste = Min(100, Σ(distancia_km × mult_terreno) / 10)
    - 1% wear per 10 km on flat terrain
    - Accelerated on rough terrain
    """
    total_wear = 0.0

    for item in missions_with_routes:
        distance_km = float(item.get("distancia_total") or 0)
        terrain = item.get("tipo_terreno") or "tierra"
        multiplier = _get_terrain_multiplier(terrain)
        total_wear += (distance_km * multiplier) / 10.0

    return min(100.0, round(total_wear, 1))


def _calculate_resistance(missions_with_routes: list, weather_mult: float,
                           hours_inactive: float) -> float:
    """
    Calculate current physical resistance (0–100).

    Formula:
      fatiga_base = (distancia / 5) × 2  →  2% per 5 km
      fatiga_mision = fatiga_base × mult_clima
      recuperación = horas_inactivo × 5
      Resistencia = clamp(0, 100, 100 - Σ fatiga + recuperación)
    """
    total_fatigue = 0.0

    for item in missions_with_routes:
        distance_km = float(item.get("distancia_total") or 0)
        fatigue_base = (distance_km / 5.0) * 2.0  # 2% per 5 km
        total_fatigue += fatigue_base * weather_mult

    recovery = hours_inactive * 5.0  # +5% per hour of rest

    resistance = 100.0 - total_fatigue + recovery
    return round(max(0.0, min(100.0, resistance)), 1)


@router.get("/stats")
async def get_explorer_stats(
    lat: Optional[float] = Query(None, description="Explorer latitude for weather"),
    lng: Optional[float] = Query(None, description="Explorer longitude for weather"),
    user=Depends(get_current_user)
):
    """
    Returns calculated stats for the authenticated explorer:
    - desgaste_calzado: Shoe wear % (cumulative)
    - resistencia: Physical resistance % (dynamic)
    - clima_actual: Current weather classification
    """
    supabase = get_supabase_client()
    user_id = user.id

    # ── 0. Get calzado_reset_at from profile ──
    calzado_reset_at = None
    try:
        profile_res = supabase.table("profiles") \
            .select("calzado_reset_at") \
            .eq("id", user_id) \
            .single() \
            .execute()
        if profile_res.data:
            reset_str = profile_res.data.get("calzado_reset_at")
            if reset_str:
                calzado_reset_at = datetime.fromisoformat(reset_str.replace("Z", "+00:00"))
    except Exception as e:
        print(f"[ExplorerStats] Error fetching profile: {e}")

    # ── 1. Fetch completed missions with route data ──
    try:
        # Get all completed missions for shoe wear (cumulative)
        missions_res = supabase.table("misiones") \
            .select("id, inicio_at, fin_at, estado, zona_geografica") \
            .eq("user_id", user_id) \
            .eq("estado", "completada") \
            .order("fin_at", desc=True) \
            .execute()

        all_missions = missions_res.data or []
    except Exception as e:
        print(f"[ExplorerStats] Error fetching missions: {e}")
        all_missions = []

    # ── 2. Fetch routes with distance and terrain ──
    routes = []
    try:
        routes_query = supabase.table("rutas_planificadas") \
            .select("id, distancia_total, tipo_terreno, estado_seguridad, created_at") \
            .eq("user_id", user_id)

        # Only count routes created AFTER the last shoe reset
        if calzado_reset_at:
            routes_query = routes_query.gte("created_at", calzado_reset_at.isoformat())

        routes_res = routes_query.execute()
        routes = routes_res.data or []
    except Exception as e:
        print(f"[ExplorerStats] Error fetching routes: {e}")
        routes = []  # Fallback: no routes, will use mission estimates

    # ── 3. Build combined dataset ──
    # If we have routes, use their distances + terrain;
    # otherwise, estimate from mission count
    if routes:
        missions_with_routes = routes
    else:
        # Fallback: estimate 5 km per mission on 'tierra' terrain
        missions_with_routes = [
            {"distancia_total": 5.0, "tipo_terreno": "tierra"}
            for _ in all_missions
        ]

    # ── 4. Get weather data ──
    weather_mult = 1.0
    clima_actual = "fresco"
    weather_data = None

    if lat is not None and lng is not None:
        try:
            weather_result = await get_weather(lat, lng)
            if weather_result:
                weather_mult = weather_result.multiplicador
                clima_actual = weather_result.categoria
                weather_data = weather_result.to_dict()
        except Exception as e:
            print(f"[ExplorerStats] Weather fetch failed: {e}")
            # Keep default values on weather failure

    # ── 5. Calculate hours of inactivity (for resistance recovery) ──
    hours_inactive = 24.0  # Default: full day rest

    if all_missions:
        # Find the most recent mission end time
        last_mission = all_missions[0]
        last_end = last_mission.get("fin_at")
        if last_end:
            try:
                last_end_dt = datetime.fromisoformat(last_end.replace("Z", "+00:00"))
                now = datetime.now(timezone.utc)
                diff = now - last_end_dt
                hours_inactive = max(0, diff.total_seconds() / 3600)
            except Exception:
                hours_inactive = 24.0

    # Only consider missions from last 48h for fatigue
    recent_cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
    recent_missions = []
    for m in all_missions:
        fin = m.get("fin_at")
        if fin:
            try:
                fin_dt = datetime.fromisoformat(fin.replace("Z", "+00:00"))
                if fin_dt >= recent_cutoff:
                    recent_missions.append(m)
            except Exception:
                pass

    # Build recent route data for resistance calculation
    if routes:
        recent_routes = routes[:len(recent_missions)] if recent_missions else []
    else:
        recent_routes = [
            {"distancia_total": 5.0, "tipo_terreno": "tierra"}
            for _ in recent_missions
        ]

    # ── 6. Calculate stats ──
    desgaste = _calculate_shoe_wear(missions_with_routes)
    resistencia = _calculate_resistance(recent_routes, weather_mult, hours_inactive)

    return {
        "desgaste_calzado": desgaste,
        "resistencia": resistencia,
        "clima_actual": clima_actual,
        "weather": weather_data,
        "misiones_completadas": len(all_missions),
        "rutas_registradas": len(routes),
    }


@router.post("/reset-calzado")
async def reset_calzado(user=Depends(get_current_user)):
    """
    Reset shoe wear by updating calzado_reset_at to now.
    This causes future /stats calls to only count routes after this date.
    """
    supabase = get_supabase_client()
    now = datetime.now(timezone.utc).isoformat()

    try:
        supabase.table("profiles") \
            .update({"calzado_reset_at": now}) \
            .eq("id", user.id) \
            .execute()
    except Exception as e:
        print(f"[ExplorerStats] Error resetting calzado: {e}")
        raise HTTPException(status_code=500, detail="Error al resetear calzado")

    return {"message": "Calzado reseteado", "calzado_reset_at": now}
