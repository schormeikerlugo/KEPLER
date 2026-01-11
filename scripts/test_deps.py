import sys
import os
from pathlib import Path

# Add 'backend' to python path to mimic uvicorn running from backend/ or finding app package
# If running from Root:
backend_path = os.path.join(os.getcwd(), "backend")
sys.path.insert(0, backend_path)

print(f"Testing DEPS loading from {os.getcwd()}")
print(f"Sys Path[0]: {sys.path[0]}")

try:
    # Attempt import
    from app.api import deps
    print("Successfully imported app.api.deps")
    
    # Attempt env var check
    print(f"SUPABASE_URL in Env: {os.getenv('SUPABASE_URL')}")
    
    # Attempt client creation
    client = deps.get_supabase_client()
    print("Successfully created Supabase Client")
    print(f"Client URL: {client.supabase_url}")

except Exception as e:
    print(f"CRASHED: {e}")
