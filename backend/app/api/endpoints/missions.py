from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Dict, Any, Optional
from app.api.deps import get_current_user
from supabase import create_client
import os
from datetime import datetime
import httpx

router = APIRouter()

# ============================================================
# Helpers
# ============================================================

def get_supabase():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    return create_client(url, key) if url and key else None

# ============================================================
# Zone Description Endpoint (GPS + Nominatim + Ollama)
# ============================================================

class ZoneDescribeRequest(BaseModel):
    latitude: float
    longitude: float

@router.post("/describe-zone")
async def describe_zone(req: ZoneDescribeRequest):
    """Get location name and AI-generated description from GPS coordinates"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            nominatim_url = f"https://nominatim.openstreetmap.org/reverse?lat={req.latitude}&lon={req.longitude}&format=json"
            headers = {"User-Agent": "KEPLER-Explorer/1.0"}
            geo_response = await client.get(nominatim_url, headers=headers)
            geo_data = geo_response.json()

        address = geo_data.get("address", {})
        location_name = address.get("city") or address.get("town") or address.get("village") or address.get("county") or "Zona Desconocida"
        country = address.get("country", "")
        full_location = f"{location_name}, {country}" if country else location_name

        description = "Zona de exploración activa."
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                ollama_url = "http://localhost:11434/api/generate"
                prompt = f"""Eres el asistente de un explorador de campo. Genera una descripción útil para exploración de esta ubicación:

Ubicación: {full_location}

Escribe 2-3 oraciones naturales incluyendo:
- Tipo de clima (cálido, húmedo, seco, templado, etc.)
- Tipo de terreno o suelo probable
- Fauna o flora típica de esta región que el explorador podría encontrar

Usa SOLO la ubicación proporcionada. Sé específico para {full_location}. Escribe en español, tono profesional de expedición.

Respuesta (solo la descripción):"""
                ollama_response = await client.post(ollama_url, json={
                    "model": "mistral:7b",
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.6}
                })
                if ollama_response.status_code == 200:
                    ollama_data = ollama_response.json()
                    description = ollama_data.get("response", description).strip()
        except Exception as e:
            print(f"[Ollama] Error: {e}")
            description = f"Zona de exploración en {full_location}. Condiciones desconocidas."

        return {
            "success": True,
            "location_name": full_location,
            "description": description
        }
    except Exception as e:
        print(f"[describe-zone] Error: {e}")
        return {"success": False, "error": str(e)}

# ============================================================
# Mission CRUD Endpoints
# ============================================================

class MissionStartRequest(BaseModel):
    titulo: str
    zona: str
    clima: Dict[str, Any]
    descripcion_ia: Optional[str] = None
    tipo_terreno: Optional[str] = None
    objetivo: Optional[str] = None
    dificultad: Optional[str] = None
    coords_inicio: Optional[Dict[str, float]] = None

class MissionEndRequest(BaseModel):
    mission_id: str

class MissionUpdateRequest(BaseModel):
    titulo: Optional[str] = None
    zona_geografica: Optional[str] = None
    descripcion_ia: Optional[str] = None

@router.post("/start")
async def start_mission(req: MissionStartRequest, user = Depends(get_current_user)):
    supabase = get_supabase()
    if not supabase:
        return {"success": False, "error": "DB Error"}

    try:
        code = f"MISION-{datetime.now().strftime('%Y%m%d-%H%M')}"
        mission_data = {
            "user_id": user.id,
            "codigo": code,
            "titulo": req.titulo,
            "zona_geografica": req.zona,
            "descripcion_ia": req.descripcion_ia,
            "clima_snapshot": req.clima,
            "estado": "activa",
            "tipo_terreno": req.tipo_terreno,
            "objetivo": req.objetivo,
            "dificultad": req.dificultad,
            "coords_inicio": req.coords_inicio
        }
        res = supabase.table("misiones").insert(mission_data).execute()
        if res.data:
            return {"success": True, "mission_id": res.data[0]['id'], "code": code}
        return {"success": False, "error": "Insert Failed"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.post("/end")
async def end_mission(req: MissionEndRequest, user = Depends(get_current_user)):
    supabase = get_supabase()
    if not supabase:
        return {"success": False, "error": "DB Error"}
    try:
        supabase.table("misiones").update({
            "estado": "completada",
            "fin_at": datetime.now().isoformat()
        }).eq("id", req.mission_id).eq("user_id", user.id).execute()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.get("/list")
async def list_missions(
    user = Depends(get_current_user),
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0)
):
    """List missions for the current user with object counts."""
    supabase = get_supabase()
    if not supabase:
        return []
    try:
        res = supabase.table("misiones").select("*") \
            .eq("user_id", user.id) \
            .order("inicio_at", desc=True) \
            .range(offset, offset + limit - 1) \
            .execute()

        missions = res.data or []

        # Batch fetch object counts for all missions in this page
        mission_ids = [m["id"] for m in missions]
        if mission_ids:
            counts_map = {}
            personas_map = {}
            rutas_map = {}

            for mid in mission_ids:
                try:
                    obj_count = supabase.table("objetos_exploracion") \
                        .select("id", count="exact", head=True) \
                        .eq("mission_id", mid).execute().count or 0
                    counts_map[mid] = obj_count
                except:
                    counts_map[mid] = 0

                try:
                    per_count = supabase.table("personas_encontradas") \
                        .select("id", count="exact", head=True) \
                        .eq("mission_id", mid).execute().count or 0
                    personas_map[mid] = per_count
                except:
                    personas_map[mid] = 0

                try:
                    rut_count = supabase.table("rutas_exploracion") \
                        .select("id", count="exact", head=True) \
                        .eq("mission_id", mid).execute().count or 0
                    rutas_map[mid] = rut_count
                except:
                    rutas_map[mid] = 0

            for m in missions:
                m["objeto_count"] = counts_map.get(m["id"], 0)
                m["persona_count"] = personas_map.get(m["id"], 0)
                m["ruta_count"] = rutas_map.get(m["id"], 0)

        return missions
    except Exception as e:
        print(f"List missions error: {e}")
        return []

@router.get("/stats")
async def get_mission_stats(user = Depends(get_current_user)):
    """Get aggregate stats for all user missions."""
    supabase = get_supabase()
    if not supabase:
        return {"total_missions": 0, "active_missions": 0, "total_objects": 0, "total_personas": 0, "total_rutas": 0}
    try:
        missions_total = supabase.table("misiones").select("id", count="exact", head=True) \
            .eq("user_id", user.id).execute().count or 0
        missions_active = supabase.table("misiones").select("id", count="exact", head=True) \
            .eq("user_id", user.id).eq("estado", "activa").execute().count or 0
        objects_total = supabase.table("objetos_exploracion").select("id", count="exact", head=True) \
            .eq("user_id", user.id).execute().count or 0

        personas_total = 0
        rutas_total = 0
        try:
            personas_total = supabase.table("personas_encontradas").select("id", count="exact", head=True) \
                .eq("user_id", user.id).execute().count or 0
        except:
            pass
        try:
            rutas_total = supabase.table("rutas_exploracion").select("id", count="exact", head=True) \
                .eq("user_id", user.id).execute().count or 0
        except:
            pass

        return {
            "total_missions": missions_total,
            "active_missions": missions_active,
            "total_objects": objects_total,
            "total_personas": personas_total,
            "total_rutas": rutas_total
        }
    except Exception as e:
        print(f"Stats error: {e}")
        return {"total_missions": 0, "active_missions": 0, "total_objects": 0, "total_personas": 0, "total_rutas": 0}

@router.put("/{mission_id}")
async def update_mission_details(mission_id: str, req: MissionUpdateRequest, user = Depends(get_current_user)):
    """Update mission details (title, zone, description)"""
    supabase = get_supabase()
    if not supabase:
        return {"success": False, "error": "DB Error"}
    try:
        data = {k: v for k, v in req.dict().items() if v is not None}
        if not data:
            return {"success": True}

        supabase.table("misiones").update(data).eq("id", mission_id).eq("user_id", user.id).execute()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.get("/orphaned/objects")
async def list_orphaned_objects(
    user = Depends(get_current_user),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0)
):
    """Get objects without a mission, with category info via JOIN."""
    supabase = get_supabase()
    if not supabase:
        return []
    try:
        res = supabase.table("objetos_exploracion") \
            .select("*, categorias(id, nombre, color, icono), subcategorias(id, nombre)") \
            .eq("user_id", user.id) \
            .is_("mission_id", "null") \
            .order("created_at", desc=True) \
            .range(offset, offset + limit - 1) \
            .execute()

        return res.data or []
    except Exception as e:
        print(f"Orphan fetch error: {e}")
        return []

@router.get("/{mission_id}/objects")
async def list_mission_objects(
    mission_id: str,
    user = Depends(get_current_user),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0)
):
    """Get objects for a mission, with category info via JOIN."""
    supabase = get_supabase()
    if not supabase:
        return []
    try:
        res = supabase.table("objetos_exploracion") \
            .select("*, categorias(id, nombre, color, icono), subcategorias(id, nombre)") \
            .eq("user_id", user.id) \
            .eq("mission_id", mission_id) \
            .order("created_at", desc=True) \
            .range(offset, offset + limit - 1) \
            .execute()

        return res.data or []
    except Exception as e:
        print(f"Mission Object Fetch Error: {e}")
        return []

@router.delete("/delete/{mission_id}")
async def delete_mission(mission_id: str, user = Depends(get_current_user)):
    supabase = get_supabase()
    if not supabase:
        return {"success": False, "error": "DB Error"}

    try:
        # Verify ownership first
        mission = supabase.table("misiones").select("id").eq("id", mission_id).eq("user_id", user.id).execute()
        if not mission.data:
            return {"success": False, "error": "Mission not found or permission denied"}

        # Delete associated objects
        supabase.table("objetos_exploracion").delete().eq("mission_id", mission_id).eq("user_id", user.id).execute()

        # Delete associated personas (if table exists)
        try:
            supabase.table("personas_encontradas").delete().eq("mission_id", mission_id).eq("user_id", user.id).execute()
        except:
            pass

        # Delete associated rutas (if table exists)
        try:
            supabase.table("rutas_exploracion").delete().eq("mission_id", mission_id).eq("user_id", user.id).execute()
        except:
            pass

        # Delete the mission
        supabase.table("misiones").delete().eq("id", mission_id).eq("user_id", user.id).execute()

        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

# ============================================================
# Personas Endpoints (inline for Phase 1b convenience)
# ============================================================

@router.get("/{mission_id}/personas")
async def list_mission_personas(
    mission_id: str,
    user = Depends(get_current_user),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0)
):
    """Get personas encontradas for a mission."""
    supabase = get_supabase()
    if not supabase:
        return []
    try:
        res = supabase.table("personas_encontradas") \
            .select("*") \
            .eq("user_id", user.id) \
            .eq("mission_id", mission_id) \
            .order("created_at", desc=True) \
            .range(offset, offset + limit - 1) \
            .execute()
        return res.data or []
    except Exception as e:
        print(f"Personas fetch error: {e}")
        return []

@router.get("/{mission_id}/rutas")
async def list_mission_rutas(
    mission_id: str,
    user = Depends(get_current_user),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0)
):
    """Get rutas de exploración for a mission."""
    supabase = get_supabase()
    if not supabase:
        return []
    try:
        res = supabase.table("rutas_exploracion") \
            .select("*") \
            .eq("user_id", user.id) \
            .eq("mission_id", mission_id) \
            .order("created_at", desc=True) \
            .range(offset, offset + limit - 1) \
            .execute()
        return res.data or []
    except Exception as e:
        print(f"Rutas fetch error: {e}")
        return []

@router.get("/{mission_id}/telemetry")
async def get_mission_telemetry(mission_id: str, user = Depends(get_current_user)):
    """Get telemetry summary and recent samples for a mission."""
    supabase = get_supabase()
    if not supabase:
        return {"summary": None, "samples": []}
    try:
        # Verify user owns this mission
        mission = supabase.table("misiones").select("id").eq("id", mission_id).eq("user_id", user.id).execute()
        if not mission.data:
            return {"summary": None, "samples": [], "error": "Permission denied"}

        # Get telemetry summary
        summary = None
        try:
            summary_res = supabase.table("mission_telemetry") \
                .select("*") \
                .eq("mission_id", mission_id) \
                .single() \
                .execute()
            summary = summary_res.data
        except:
            pass

        # Get recent GPS samples (last 500 points)
        samples = []
        try:
            samples_res = supabase.table("telemetry_samples") \
                .select("lat, lng, altitude, speed, heading, timestamp") \
                .eq("mission_id", mission_id) \
                .order("timestamp", desc=False) \
                .limit(500) \
                .execute()
            samples = samples_res.data or []
        except:
            pass

        return {"summary": summary, "samples": samples}
    except Exception as e:
        print(f"Telemetry fetch error: {e}")
        return {"summary": None, "samples": []}
