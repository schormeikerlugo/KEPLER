"""
Capture Processing Endpoint
Handles heavy processing (CLIP embedding, AI enrichment, DB insert) for queued captures.
The frontend captures instantly and queues; this endpoint processes asynchronously.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from app.api.deps import get_current_user
from app.services.ai_service import ai_service
import os
import traceback
from supabase import create_client, Client

router = APIRouter()

def get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        return None
    return create_client(url, key)


class CaptureRequest(BaseModel):
    type: str  # 'persona', 'poi', 'object'
    name: str
    class_name: Optional[str] = None
    confidence: Optional[float] = 0
    bbox: Optional[List[float]] = None
    track_id: Optional[int] = None
    image_base64: Optional[str] = None
    location: Optional[Dict[str, Any]] = None
    heading: Optional[float] = None
    mission_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    captured_at: Optional[str] = None


class BatchCaptureRequest(BaseModel):
    captures: List[CaptureRequest]


def _process_single(capture: CaptureRequest, user_id: str, supabase) -> dict:
    """Process one capture: CLIP embedding → Re-ID → insert. Runs on GPU thread."""

    # 1. CLIP Embedding (GPU accelerated ~50ms on RTX 3060)
    embedding = None
    img_b64 = capture.image_base64 or ''

    # Clean base64 — remove data URI prefix if present
    if ',' in img_b64:
        img_b64 = img_b64.split(',', 1)[1]

    if len(img_b64) > 500:  # Need at least ~500 chars for a valid JPEG
        try:
            embedding = ai_service.generate_embedding(img_b64)
        except Exception as e:
            print(f"[Capture] Embedding error for '{capture.name}': {e}")
    else:
        print(f"[Capture] Skipping embedding for '{capture.name}' — image too small ({len(img_b64)} chars)")

    # 2. Re-ID check (~10ms with pgvector index)
    re_id_match = None
    if embedding:
        try:
            entity_type = 'persona' if capture.type == 'persona' else 'poi' if capture.type == 'poi' else 'generic'
            res = supabase.rpc('match_entity_by_embedding', {
                'query_embedding': embedding,
                'entity_type': entity_type,
                'match_threshold': 0.78,
                'match_count': 1
            }).execute()
            if res.data and len(res.data) > 0:
                re_id_match = res.data[0]
        except Exception as e:
            print(f"[Capture] Re-ID error: {e}")

    # 3. Insert (skip enrichment for speed — enrich async later)
    lat = capture.location.get('lat') if capture.location else None
    lng = capture.location.get('lng') if capture.location else None
    conf_pct = int((capture.confidence or 0) * 100)
    re_id_tag = f" [={re_id_match['nombre']} {int(re_id_match['similarity']*100)}%]" if re_id_match else ""
    description = f"{capture.class_name or capture.type} detectado. {conf_pct}% confianza."

    try:
        # Store base64 for image display.
        # The web client sends `data:image/jpeg;base64,...` already, but the
        # mobile client strips the prefix before queueing (so the backend's
        # CLIP path doesn't double-handle it). Re-prepend the prefix here so
        # the saved value is a valid <img>/<Image> URI on both web and RN.
        raw = capture.image_base64 if capture.image_base64 and len(capture.image_base64) > 100 else None
        if raw and not raw.startswith('data:'):
            image_for_db = f'data:image/jpeg;base64,{raw}'
        else:
            image_for_db = raw

        if capture.type == 'persona':
            insert_data = {
                "user_id": user_id,
                "mission_id": capture.mission_id,
                "nombre": capture.name + re_id_tag,
                "contexto": "desconocido",
                "notas": f"Sentinel. {description}",
                "lat": lat, "lng": lng,
            }
            if image_for_db:
                insert_data["image_url"] = image_for_db
            if embedding:
                insert_data["embedding"] = embedding
            result = supabase.table("personas_encontradas").insert(insert_data).execute()

        elif capture.type == 'poi':
            insert_data = {
                "user_id": user_id,
                "mission_id": capture.mission_id,
                "nombre": capture.name + re_id_tag,
                "nivel_riesgo": "bajo", "estado": "activo",
                "descripcion": f"Sentinel. {description}",
                "lat": lat, "lng": lng,
            }
            if image_for_db:
                insert_data["image_url"] = image_for_db
            if embedding:
                insert_data["embedding"] = embedding
            result = supabase.table("puntos_interes").insert(insert_data).execute()

        else:
            posicion = f"POINT({lng} {lat})" if lat and lng else None
            insert_data = {
                "user_id": user_id,
                "mission_id": capture.mission_id,
                "nombre": capture.name + re_id_tag,
                "tipo": capture.class_name or "unknown",
                "descripcion": description,
                "posicion": posicion,
                "metadata": {
                    "source": "sentinel", "confidence": capture.confidence,
                    "ai_class": capture.class_name, "track_id": capture.track_id,
                    "heading": capture.heading, "captured_at": capture.captured_at,
                    "image_base64": image_for_db[:500000] if image_for_db else None,
                    **(capture.metadata or {})
                }
            }
            if embedding:
                insert_data["embedding"] = embedding
            result = supabase.table("objetos_exploracion").insert(insert_data).execute()

        record_id = result.data[0]["id"] if result.data else None
        return {
            "success": True, "id": record_id, "name": capture.name,
            "re_id": {"matched": bool(re_id_match), "name": re_id_match["nombre"], "similarity": re_id_match["similarity"]} if re_id_match else None
        }
    except Exception as e:
        print(f"[Capture] INSERT ERROR for '{capture.name}': {e}")
        traceback.print_exc()
        return {"success": False, "error": str(e), "name": capture.name}


@router.post("/process")
async def process_capture(req: CaptureRequest, user=Depends(get_current_user)):
    """Process a single capture (backwards compatible)."""
    supabase = get_supabase()
    if not supabase:
        return {"success": False, "error": "DB not available"}
    return _process_single(req, user.id, supabase)


@router.post("/batch")
async def process_batch(req: BatchCaptureRequest, user=Depends(get_current_user)):
    """
    Process multiple captures in a single request.
    RTX 3060 + Ryzen 7: ~50ms CLIP per image, ~10ms Re-ID, ~5ms insert.
    5 captures ≈ 300ms total.
    """
    supabase = get_supabase()
    if not supabase:
        return {"success": False, "error": "DB not available"}

    results = []
    re_ids = 0

    for capture in req.captures:
        result = _process_single(capture, user.id, supabase)
        results.append(result)
        # `result['re_id']` may be None when there was no match — guard explicitly
        re_id_block = result.get("re_id") or {}
        if re_id_block.get("matched"):
            re_ids += 1

    success_count = sum(1 for r in results if r.get("success"))
    fail_count = len(results) - success_count

    return {
        "success": True,
        "processed": success_count,
        "failed": fail_count,
        "re_identifications": re_ids,
        "results": results
    }
