from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from app.api.deps import get_current_user
from supabase import create_client
import os

router = APIRouter()

def get_supabase():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    return create_client(url, key) if url and key else None


class Waypoint(BaseModel):
    lat: float
    lng: float


class RouteCorridorRequest(BaseModel):
    waypoints: List[Waypoint]
    buffer_meters: int = 200


class RiskAssessmentRequest(BaseModel):
    waypoints: List[Waypoint]
    buffer_meters: int = 200


class SimilaritySearchRequest(BaseModel):
    waypoints: List[Waypoint]
    embedding: List[float]
    buffer_meters: int = 200
    match_threshold: float = 0.75
    match_count: int = 10


class CreatePlannedRouteRequest(BaseModel):
    nombre: str
    punto_control_destino: Optional[str] = None
    distancia_total: Optional[float] = None
    estado_seguridad: str = "Desconocido"
    tipo_terreno: str = "llano"
    waypoints: List[dict] = []


class NearbyAlertsRequest(BaseModel):
    lat: float
    lng: float
    radius_meters: int = 300


@router.post("/corridor")
async def search_route_corridor(
    request: RouteCorridorRequest,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    waypoints = [{"lat": w.lat, "lng": w.lng} for w in request.waypoints]

    result = supabase.rpc(
        "search_route_corridor",
        {
            "waypoints": waypoints,
            "buffer_meters": request.buffer_meters
        }
    ).execute()

    if result.data:
        return result.data
    return {"objects": [], "pois": [], "personas": [], "rutas": [], "corridor_distance_km": 0}


@router.post("/risk-assessment")
async def get_route_risk_assessment(
    request: RiskAssessmentRequest,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    waypoints = [{"lat": w.lat, "lng": w.lng} for w in request.waypoints]

    result = supabase.rpc(
        "get_route_risk_assessment",
        {
            "waypoints": waypoints,
            "buffer_meters": request.buffer_meters
        }
    ).execute()

    if result.data:
        return result.data
    return {"nivel_riesgo": "bajo", "score": 0, "alertas": []}


@router.post("/similarity-search")
async def search_similar_in_corridor(
    request: SimilaritySearchRequest,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    waypoints = [{"lat": w.lat, "lng": w.lng} for w in request.waypoints]

    result = supabase.rpc(
        "search_similar_in_corridor",
        {
            "waypoints": waypoints,
            "query_embedding": request.embedding,
            "buffer_meters": request.buffer_meters,
            "match_threshold": request.match_threshold,
            "match_count": request.match_count
        }
    ).execute()

    if result.data:
        return {"results": result.data}
    return {"results": []}


@router.post("/nearby-alerts")
async def get_nearby_alerts(
    request: NearbyAlertsRequest,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    result = supabase.rpc(
        "get_nearby_alerts",
        {
            "user_lat": request.lat,
            "user_lng": request.lng,
            "radius_meters": request.radius_meters
        }
    ).execute()

    if result.data:
        return result.data
    return {"peligros": [], "hostiles": [], "rutas_peligrosas": [], "objetos": [], "alertas": []}


@router.get("/planned-routes")
async def get_planned_routes(
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    result = supabase.table("rutas_planificadas").select("*").eq("user_id", current_user["id"]).range(offset, offset + limit - 1).execute()

    return {"routes": result.data, "total": len(result.data)}


@router.post("/planned-routes")
async def create_planned_route(
    request: CreatePlannedRouteRequest,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    data = {
        "user_id": current_user["id"],
        "nombre": request.nombre,
        "punto_control_destino": request.punto_control_destino,
        "distancia_total": request.distancia_total,
        "estado_seguridad": request.estado_seguridad,
        "tipo_terreno": request.tipo_terreno,
        "waypoints": request.waypoints
    }

    result = supabase.table("rutas_planificadas").insert(data).execute()

    if result.data:
        return {"route": result.data[0]}
    raise HTTPException(status_code=400, detail="Failed to create route")


@router.delete("/planned-routes/{route_id}")
async def delete_planned_route(
    route_id: str,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    result = supabase.table("rutas_planificadas").delete().eq("id", route_id).eq("user_id", current_user["id"]).execute()

    return {"success": len(result.data) > 0}