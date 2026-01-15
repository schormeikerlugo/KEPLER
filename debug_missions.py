import os
import json
import urllib.request
import urllib.parse
from pathlib import Path

def load_env_manual():
    env_path = Path("backend/.env")
    if not env_path.exists():
        print("No .env found")
        return
    
    with open(env_path) as f:
        for line in f:
            if '=' in line and not line.strip().startswith('#'):
                key, val = line.strip().split('=', 1)
                os.environ[key] = val.strip('"').strip("'")

def test_missions():
    load_env_manual()
    
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not url or not key:
        print("Missing URL/KEY")
        return

    # Query missions table
    print("\n--- Checking 'misiones' table ---")
    try:
        table_url = f"{url}/rest/v1/misiones?select=id,titulo,zona_geografica,estado&limit=5"
        req = urllib.request.Request(table_url)
        req.add_header("apikey", key)
        req.add_header("Authorization", f"Bearer {key}")
        
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            if data:
                print(f"✅ Found {len(data)} missions:")
                for m in data:
                    print(f"  - '{m.get('titulo')}' ({m.get('estado')})")
            else:
                print("⚠️ No missions found.")
    except Exception as e:
        print(f"❌ Error: {e}")

    # Search for "Prueba 5"
    print("\n--- Searching for 'Prueba 5' ---")
    try:
        search_url = f"{url}/rest/v1/misiones?titulo=ilike.*Prueba%205*&limit=1"
        req = urllib.request.Request(search_url)
        req.add_header("apikey", key)
        req.add_header("Authorization", f"Bearer {key}")
        
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            if data:
                print(f"✅ Found mission: {data[0]}")
            else:
                print("⚠️ No mission matching 'Prueba 5'")
    except Exception as e:
        print(f"❌ Search Error: {e}")

if __name__ == "__main__":
    test_missions()
