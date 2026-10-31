from fastapi import APIRouter, Depends, HTTPException
from supabase import create_client, Client
from app.api.deps import get_current_user
import os
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

def get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        raise HTTPException(status_code=500, detail="Supabase credentials not configured")
    return create_client(url, key)

@router.get("/stats")
async def get_dashboard_stats(user = Depends(get_current_user)):
    """
    Returns aggregated stats for the current user's dashboard.
    Filters all queries by user_id for proper data isolation.
    """
    supabase = get_supabase()

    try:
        # Missions
        try:
            missions_count = supabase.table("misiones") \
                .select("*", count="exact", head=True) \
                .eq("user_id", user.id).execute().count
            missions_data = supabase.table("misiones") \
                .select("*") \
                .eq("user_id", user.id) \
                .order("inicio_at", desc=True) \
                .limit(5).execute().data
        except Exception as e:
            print(f"Dashboard missions error: {e}")
            missions_count = 0
            missions_data = []

        # Objects
        try:
            objects_count = supabase.table("objetos_exploracion") \
                .select("*", count="exact", head=True) \
                .eq("user_id", user.id).execute().count
            objects_data = supabase.table("objetos_exploracion") \
                .select("id, nombre, tipo, metadata, created_at, mission_id") \
                .eq("user_id", user.id) \
                .order("created_at", desc=True) \
                .limit(5).execute().data
        except Exception as e:
            print(f"Dashboard objects error: {e}")
            objects_count = 0
            objects_data = []

        # Personas (optional)
        personas_count = 0
        try:
            personas_count = supabase.table("personas_encontradas") \
                .select("*", count="exact", head=True) \
                .eq("user_id", user.id).execute().count or 0
        except:
            pass

        # Rutas (optional)
        rutas_count = 0
        try:
            rutas_count = supabase.table("rutas_exploracion") \
                .select("*", count="exact", head=True) \
                .eq("user_id", user.id).execute().count or 0
        except:
            pass

        return {
            "counts": {
                "missions": missions_count,
                "objects": objects_count,
                "personas": personas_count,
                "rutas": rutas_count
            },
            "recent": {
                "missions": missions_data or [],
                "objects": objects_data or []
            }
        }

    except Exception as e:
        print(f"Error fetching dashboard stats: {e}")
        return {
            "counts": {"missions": 0, "objects": 0, "personas": 0, "rutas": 0},
            "recent": {"missions": [], "objects": []},
            "error": str(e)
        }
