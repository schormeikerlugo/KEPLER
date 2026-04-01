from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from app.services.ai_service import ai_service
from app.api.deps import get_current_user
from supabase import create_client
import os
from datetime import datetime
import base64
from io import BytesIO

# Try to import Pillow for server-side cropping
try:
    from PIL import Image
    PILLOW_AVAILABLE = True
except ImportError:
    PILLOW_AVAILABLE = False
    print("Warning: Pillow not installed. Server-side cropping disabled.")

# Define or Import helper
def get_supabase():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    return create_client(url, key) if url and key else None

def crop_image_base64(image_base64: str, bbox: List[float]) -> str:
    """Crop an image using bbox coordinates [x, y, width, height]"""
    if not PILLOW_AVAILABLE or not image_base64 or not bbox or len(bbox) < 4:
        return image_base64  # Return original if can't crop
    
    try:
        # Remove data URI prefix if present
        if ',' in image_base64:
            image_base64 = image_base64.split(',')[1]
        
        # Decode base64 to image
        img_data = base64.b64decode(image_base64)
        img = Image.open(BytesIO(img_data))
        
        x, y, w, h = bbox
        
        # Add 10% padding
        pad = 0.1
        x1 = max(0, int(x - w * pad))
        y1 = max(0, int(y - h * pad))
        x2 = min(img.width, int(x + w + w * pad))
        y2 = min(img.height, int(y + h + h * pad))
        
        # Crop
        cropped = img.crop((x1, y1, x2, y2))
        
        # Resize if too large (max 640x480)
        if cropped.width > 640 or cropped.height > 480:
            cropped.thumbnail((640, 480), Image.Resampling.LANCZOS)
        
        # Convert back to base64
        buffer = BytesIO()
        cropped.save(buffer, format='JPEG', quality=80)
        cropped_b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        return f"data:image/jpeg;base64,{cropped_b64}"
    except Exception as e:
        print(f"Crop error: {e}")
        return image_base64  # Return original on error

router = APIRouter()

class ObjectCreateRequest(BaseModel):
    source: str 
    object_class: str
    name: str 
    confidence: float
    timestamp: str
    location: Dict[str, Any]
    heading: float
    image_base64: str
    metadata: Dict[str, Any]
    mission_id: Optional[str] = None
    bbox: Optional[List[float]] = None  # [x, y, width, height] for server-side crop


class ObjectUpdateRequest(BaseModel):
    nombre: str
    descripcion: str
    subcategoria: Optional[str] = None
    genero: Optional[str] = None
    tipo: Optional[str] = None

# --- ENDPOINTS ---

@router.get("/map")
async def get_map_objects(
    scope: str = "mine",
    user: dict = Depends(get_current_user),
    limit: int = Query(default=100, le=300)
):
    """
    Get objects for the map view.
    - scope=mine: Only user's objects (default)
    - scope=all: All objects with owner info
    """
    try:
        supabase = get_supabase()
        if not supabase:
            return {"error": "Database not configured", "objects": []}

        user_id = user.id
        print(f" MAP: scope={scope}, user_id={user_id}")

        if scope == "all":
            res = supabase.table("objetos_exploracion").select(
                "id, nombre, tipo, descripcion, posicion, metadata, created_at, user_id"
            ).order("created_at", desc=True).limit(limit).execute()

            objects = res.data or []

            user_ids = list(set(obj.get("user_id") for obj in objects if obj.get("user_id")))
            profiles = {}
            if user_ids:
                profiles_res = supabase.table("profiles").select(
                    "id, username, display_name, avatar_url, bio"
                ).in_("id", user_ids).execute()
                for p in (profiles_res.data or []):
                    profiles[p["id"]] = p

            for obj in objects:
                owner_id = obj.get("user_id")
                profile = profiles.get(owner_id, {})
                obj["owner_id"] = owner_id
                obj["owner_name"] = profile.get("display_name") or profile.get("username") or "Usuario"
                obj["owner_avatar"] = profile.get("avatar_url")
                obj["owner_bio"] = profile.get("bio")
                obj["is_mine"] = (owner_id == user_id)

            print(f" MAP: Found {len(objects)} total objects")
            return {"objects": objects, "scope": "all"}
        else:
            res = supabase.table("objetos_exploracion").select(
                "id, nombre, tipo, descripcion, posicion, metadata, created_at"
            ).eq("user_id", user_id).order("created_at", desc=True).limit(limit).execute()

            print(f" MAP: Found {len(res.data or [])} objects for user")
            return {"objects": res.data or [], "scope": "mine"}

    except Exception as e:
        print(f" MAP ERROR: {e}")
        return {"error": str(e), "objects": []}


@router.get("/user/{user_id}/profile")
async def get_user_profile(user_id: str, user: dict = Depends(get_current_user)):
    """
    Get public profile and stats for a user.
    """
    try:
        supabase = get_supabase()
        if not supabase:
            return {"error": "Database not configured"}

        profile_res = supabase.table("profiles").select(
            "id, username, display_name, avatar_url, bio, created_at"
        ).eq("id", user_id).single().execute()

        profile = profile_res.data if profile_res.data else {}

        objects_res = supabase.table("objetos_exploracion").select(
            "id", count="exact"
        ).eq("user_id", user_id).execute()
        objects_count = objects_res.count or 0

        missions_count = 0
        try:
            missions_res = supabase.table("misiones").select(
                "id", count="exact"
            ).eq("user_id", user_id).execute()
            missions_count = missions_res.count or 0
        except:
            pass

        return {
            "id": user_id,
            "username": profile.get("username") or profile.get("display_name") or "Usuario",
            "display_name": profile.get("display_name"),
            "avatar_url": profile.get("avatar_url"),
            "bio": profile.get("bio"),
            "created_at": profile.get("created_at"),
            "stats": {
                "objects": objects_count,
                "missions": missions_count,
                "points": objects_count * 10 + missions_count * 50
            }
        }
    except Exception as e:
        print(f"Profile error: {e}")
        return {"error": str(e)}


@router.get("/nearby")
async def get_nearby_objects(lat: float, lng: float, radius: int = 500):
    """
    Get all objects within a radius (meters) from a GPS location.
    Returns objects from ALL missions (including orphaned objects).
    """
    try:
        supabase = get_supabase()
        if not supabase:
            return []
        
        # Use PostGIS RPC function if available, otherwise fallback to raw query
        # Try using RPC first (search_nearby_objects_v2)
        try:
            res = supabase.rpc(
                'search_nearby_objects_v2',
                {
                    'user_lat': lat,
                    'user_lng': lng,
                    'max_distance': radius
                }
            ).execute()
            
            if res.data:
                return res.data
        except Exception as rpc_err:
            print(f"RPC fallback: {rpc_err}")
        
        # Fallback: Simple query without distance filtering
        # Use PostGIS functions to extract lat/lng from geometry
        res = supabase.rpc('get_all_objects_with_coords', {}).execute()
        
        if res.data:
            return res.data
        
        # If RPC doesn't exist, try raw select (lat/lng will need client parsing)
        res = supabase.table("objetos_exploracion").select(
            "id, nombre, tipo, descripcion, posicion, metadata, mission_id, created_at, subcategoria, genero"
        ).order("created_at", desc=True).limit(100).execute()
        
        # Post-process to add lat/lng (client-side WKB parsing is hard, so we approximate)
        if res.data:
            for obj in res.data:
                # If posicion exists but is WKB hex, extract from metadata as fallback
                if obj.get('metadata') and obj['metadata'].get('heading') is not None:
                    # Metadata usually has coordinates from save time
                    pass  # Already have metadata
            return res.data
        
        return []
        
    except Exception as e:
        print(f"Nearby objects error: {e}")
        return []


@router.post("/create")
async def create_object(req: ObjectCreateRequest, user = Depends(get_current_user)):
    """Create a new AR object. Requires Auth."""
    try:
        supabase = get_supabase()
        if not supabase: 
            return {"success": False, "error": "DB Connection Error"}
        
        # Build GeoJSON Point for PostGIS
        lat = req.location.get('lat', 0)
        lng = req.location.get('lng', 0)
        
        # AI embedding generation (optional)
        embedding = None
        if req.image_base64 and len(req.image_base64) > 100:
            try:
                embedding = ai_service.generate_embedding(req.image_base64)
            except Exception as e:
                print(f"Embedding gen failed: {e}")
        
        # Prepare data for insert WITH USER_ID
        insert_data = {
            "user_id": user.id,  # Assign ownership
            "nombre": req.name,
            "tipo": req.object_class,
            "descripcion": req.metadata.get('description', ''),
            "posicion": f"POINT({lng} {lat})",
            "metadata": {
                **req.metadata,
                "source": req.source,
                "confidence": req.confidence,
                "heading": req.heading,
                "timestamp": req.timestamp,
                "image_base64": (
                    crop_image_base64(req.image_base64, req.bbox)[:500000] 
                    if req.bbox and req.image_base64 and len(req.image_base64) > 100 
                    else (req.image_base64[:500000] if req.image_base64 and len(req.image_base64) > 100 else None)
                )
            }
        }
        
        if req.mission_id:
            insert_data["mission_id"] = req.mission_id
            
        if embedding:
            insert_data["embedding"] = embedding
            
        res = supabase.table("objetos_exploracion").insert(insert_data).execute()
        
        if res.data and len(res.data) > 0:
            return {"success": True, "data": res.data[0]}
        else:
            return {"success": False, "error": "Insert failed"}
            
    except Exception as e:
        print(f"Create object error: {e}")
        return {"success": False, "error": str(e)}


class MatchVisualRequest(BaseModel):
    image_base64: str
    entity_type: str  # 'persona' or 'poi'
    threshold: Optional[float] = 0.80


@router.post("/match-visual")
async def match_visual(req: MatchVisualRequest, user = Depends(get_current_user)):
    """
    AI Re-Identification: Check if a captured image matches an existing entity.
    Uses CLIP embeddings + pgvector cosine similarity via match_entity_by_embedding().
    """
    try:
        # 1. Generate embedding from captured image
        if not req.image_base64 or len(req.image_base64) < 100:
            return {"matched": False, "reason": "No image provided"}
        
        embedding = None
        try:
            embedding = ai_service.generate_embedding(req.image_base64)
        except Exception as e:
            print(f"[match-visual] Embedding error: {e}")
            return {"matched": False, "reason": "Embedding generation failed"}
        
        if not embedding:
            return {"matched": False, "reason": "Empty embedding"}
        
        # 2. Query similarity via SQL function
        supabase = get_supabase()
        if not supabase:
            return {"matched": False, "reason": "DB connection error"}
        
        res = supabase.rpc('match_entity_by_embedding', {
            'query_embedding': embedding,
            'entity_type': req.entity_type,
            'match_threshold': req.threshold or 0.80,
            'match_count': 3
        }).execute()
        
        if res.data and len(res.data) > 0:
            best = res.data[0]
            return {
                "matched": True,
                "entity": {
                    "id": best["id"],
                    "nombre": best["nombre"],
                    "similarity": round(best["similarity"], 4)
                },
                "alternatives": res.data[1:] if len(res.data) > 1 else []
            }
        
        return {"matched": False, "reason": "No matching entities found"}
    
    except Exception as e:
        print(f"[match-visual] Error: {e}")
        return {"matched": False, "reason": str(e)}

@router.put("/{object_id}")
async def update_object(object_id: str, req: ObjectUpdateRequest, user = Depends(get_current_user)):
    try:
        supabase = get_supabase()
        if not supabase:
            return {"success": False}

        update_data = {
            "nombre": req.nombre,
            "descripcion": req.descripcion,
            "subcategoria": req.subcategoria,
            "genero": req.genero
        }
        if req.tipo:
            update_data["tipo"] = req.tipo

        res = supabase.table("objetos_exploracion").update(update_data) \
            .eq("id", object_id) \
            .eq("user_id", user.id) \
            .execute()

        if not res.data:
            return {"success": False, "error": "Object not found or permission denied"}

        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.delete("/{object_id}")
async def delete_object(object_id: str, user = Depends(get_current_user)):
    try:
        supabase = get_supabase()
        if not supabase:
            return {"success": False}

        res = supabase.table("objetos_exploracion").delete() \
            .eq("id", object_id) \
            .eq("user_id", user.id) \
            .execute()

        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
