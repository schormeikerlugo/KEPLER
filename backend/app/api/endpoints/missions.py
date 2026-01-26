from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Dict, Any, Optional
from app.api.deps import get_current_user
from supabase import create_client
import os
from datetime import datetime
import httpx

router = APIRouter()

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
        # 1. Reverse Geocoding with Nominatim
        async with httpx.AsyncClient(timeout=5.0) as client:
            nominatim_url = f"https://nominatim.openstreetmap.org/reverse?lat={req.latitude}&lon={req.longitude}&format=json"
            headers = {"User-Agent": "KEPLER-Explorer/1.0"}
            geo_response = await client.get(nominatim_url, headers=headers)
            geo_data = geo_response.json()
        
        # Extract location name
        address = geo_data.get("address", {})
        location_name = address.get("city") or address.get("town") or address.get("village") or address.get("county") or "Zona Desconocida"
        country = address.get("country", "")
        full_location = f"{location_name}, {country}" if country else location_name
        
        # 2. Generate AI Description with Ollama
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
                    "options": {
                        "temperature": 0.6
                    }
                })
                if ollama_response.status_code == 200:
                    ollama_data = ollama_response.json()
                    description = ollama_data.get("response", description).strip()
        except Exception as e:
            print(f"[Ollama] Error: {e}")
            # Fallback description without AI
            description = f"Zona de exploración en {full_location}. Condiciones desconocidas."
        
        return {
            "success": True,
            "location_name": full_location,
            "description": description
        }
        
    except Exception as e:
        print(f"[describe-zone] Error: {e}")
        return {
            "success": False,
            "error": str(e)
        }

# ============================================================
# Mission CRUD Endpoints
# ============================================================

class MissionStartRequest(BaseModel):
    titulo: str
    zona: str
    clima: Dict[str, Any]
    descripcion_ia: Optional[str] = None

class MissionEndRequest(BaseModel):
    mission_id: str

def get_supabase():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    return create_client(url, key) if url and key else None

@router.post("/start")
async def start_mission(req: MissionStartRequest, user = Depends(get_current_user)):
    supabase = get_supabase()
    if not supabase: return {"success": False, "error": "DB Error"}
    
    try:
        code = f"MISION-{datetime.now().strftime('%Y%m%d-%H%M')}"
        mission_data = {
            "user_id": user.id,
            "codigo": code,
            "titulo": req.titulo,
            "zona_geografica": req.zona,
            "descripcion_ia": req.descripcion_ia,
            "clima_snapshot": req.clima,
            "estado": "activa"
        }
        res = supabase.table("misiones").insert(mission_data).execute()
        if res.data:
            return {"success": True, "mission_id": res.data[0]['id'], "code": code}
        return {"success": False, "error": "Insert Failed"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.post("/end")
async def end_mission(req: MissionEndRequest):
    supabase = get_supabase()
    if not supabase: return {"success": False, "error": "DB Error"}
    try:
        supabase.table("misiones").update({
            "estado": "completada",
            "fin_at": datetime.now().isoformat()
        }).eq("id", req.mission_id).execute()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.get("/list")
async def list_missions(user = Depends(get_current_user)):
    supabase = get_supabase()
    if not supabase: return []
    try:
        res = supabase.table("misiones").select("*").order("inicio_at", desc=True).execute()
        return res.data
    except:
        return []

@router.get("/orphaned/objects")
async def list_orphaned_objects():
    supabase = get_supabase()
    if not supabase: return []
    try:
        # Fetch objects where mission_id is null
        # Explicitly selecting columns to ensure they are retrieved
        res = supabase.table("objetos_exploracion").select("*, subcategoria, genero").is_("mission_id", "null").order("created_at", desc=True).execute()
        
        return res.data
    except Exception as e:
        print(f"Orphan fetch error: {e}")
        return []

@router.get("/{mission_id}/objects")
async def list_mission_objects(mission_id: str):
    supabase = get_supabase()
    if not supabase: return []
    try:
        # Explicit select to ensure new columns are returned
        res = supabase.table("objetos_exploracion").select("*, subcategoria, genero").eq("mission_id", mission_id).order("created_at", desc=True).execute()
        return res.data
    except Exception as e:
        print(f"Mission Object Fetch Error: {e}")
        return []
@router.delete("/delete/{mission_id}")
async def delete_mission(mission_id: str):
    supabase = get_supabase()
    if not supabase: return {"success": False, "error": "DB Error"}
    
    try:
        # 1. Delete associated objects first (Manual Cascade)
        supabase.table("objetos_exploracion").delete().eq("mission_id", mission_id).execute()
        
        # 2. Delete the mission
        res = supabase.table("misiones").delete().eq("id", mission_id).execute()
        
        if res.data:
            return {"success": True}
        return {"success": False, "error": "Mission not found"}
    except Exception as e:
        return {"success": False, "error": str(e)}
