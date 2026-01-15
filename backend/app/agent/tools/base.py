"""
Base utilities for AI Agent Tools
Shared dependencies and helper functions
"""
import os
from supabase import create_client, Client
from app.api.deps import get_supabase_client


def get_admin_client() -> Client:
    """
    Returns a Supabase client with Service Role (Admin) privileges to bypass RLS.
    """
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
    
    if not url or not key:
        return get_supabase_client()
        
    return create_client(url, key)
