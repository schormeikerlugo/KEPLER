import os
import json
import urllib.request
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

def test_rpc_curl():
    load_env_manual()
    
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not url or not key:
        print("Missing URL/KEY")
        return

    # TEST 1: Check Object Existence
    objects_to_check = ["Agazapada", "casa de mis padres"]
    print(f"\n--- Checking Objects: {objects_to_check} ---")
    
    for obj_name in objects_to_check:
        try:
            # Use same logic as spatial.py: ilike match
            rpc_url = f"{url}/rest/v1/rpc/get_all_objects_with_coords?name=ilike.*{urllib.parse.quote(obj_name)}*"
            req = urllib.request.Request(rpc_url)
            req.add_header("apikey", key)
            req.add_header("Authorization", f"Bearer {key}")
            
            print(f"\nSearching for: '{obj_name}'")
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read().decode())
                if data:
                    print(f"✅ FOUND '{obj_name}':")
                    item = data[0]
                    print(f"   Name: {item.get('name')}")
                    print(f"   Coords: Lat={item.get('lat')}, Lng={item.get('lng')}")
                else:
                    print(f"❌ NOT FOUND: '{obj_name}'")
        except Exception as e:
            print(f"❌ Error searching '{obj_name}': {e}")

    # TEST 2: Raw Select Posicion
    print("\n--- TEST 2: Raw Table Select (posicion) ---")
    try:
        table_url = f"{url}/rest/v1/objetos_exploracion?select=nombre,posicion&limit=1"
        req = urllib.request.Request(table_url)
        req.add_header("apikey", key)
        req.add_header("Authorization", f"Bearer {key}")
        
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            if data:
                print("✅ Raw Data Found!")
                print(f"Posicion Value: {data[0].get('posicion')}")
                print(f"Type: {type(data[0].get('posicion'))}")
            else:
                print("⚠️ No raw data returned.")
    except Exception as e:
        print(f"❌ Raw Select Failed: {e}")

if __name__ == "__main__":
    test_rpc_curl()
