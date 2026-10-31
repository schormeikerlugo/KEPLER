from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.ai_service import ai_service
import os
from supabase import create_client

router = APIRouter()

class EnrichmentRequest(BaseModel):
    label: str

class EmbeddingRequest(BaseModel):
    image_base64: str

class ContextualDescriptionRequest(BaseModel):
    object_name: str
    category: str = None
    subcategory: str = None
    tags: list = None
    location_context: str = None

def get_supabase():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
    return create_client(url, key) if url and key else None

@router.post("/enrich-data")
async def enrich_data(req: EnrichmentRequest):
    return ai_service.enrich_label(req.label)

@router.post("/generate-embedding")
async def generate_embedding(req: EmbeddingRequest):
    try:
        embedding = ai_service.generate_embedding(req.image_base64)
        return {"embedding": embedding}
    except Exception as e:
        return {"error": str(e)}

@router.post("/contextual-description")
async def contextual_description(req: ContextualDescriptionRequest):
    """
    Genera una descripción inteligente usando contexto de taxonomía.
    """
    try:
        description = ai_service.generate_contextual_description(
            object_name=req.object_name,
            category=req.category,
            subcategory=req.subcategory,
            tags=req.tags,
            location_context=req.location_context
        )
        return {"description": description, "success": True}
    except Exception as e:
        return {"description": f"{req.object_name} detectado.", "success": False, "error": str(e)}

@router.post("/search-similar")
async def search_similar(req: EmbeddingRequest):
    try:
        embedding = ai_service.generate_embedding(req.image_base64)
        supabase = get_supabase()
        if not supabase: return {"matches": [], "error": "DB Config Missing"}
        
        # Note: 'search_similar_objects' RPC must exist (original main.py used it)
        result = supabase.rpc('search_similar_objects', {
            'query_embedding': embedding,
            'match_threshold': 0.75,
            'match_count': 3
        }).execute()
        
        matches = result.data if result.data else []
        return {"matches": matches}
        
    except Exception as e:
        return {"error": str(e), "matches": []}

