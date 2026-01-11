import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv("backend/.env")

url = os.getenv("SUPABASE_URL")
anon_key = os.getenv("SUPABASE_ANON_KEY")
service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")

print(f"URL: {url}")
print(f"Anon Key Found: {bool(anon_key)}")
print(f"Service Key Found: {bool(service_key)}")

if not service_key:
    print("WARNING: No Service Key found. Using Anon Key (RLS might block data).")
    client = create_client(url, anon_key)
else:
    print("Using Service Key (Admin).")
    client = create_client(url, service_key)

try:
    print("\nQuerying 'objetos_exploracion' without user filter (Limit 5):")
    res = client.table("objetos_exploracion").select("*").limit(5).execute()
    print(f"Total rows retrieved: {len(res.data)}")
    for item in res.data:
        print(f" - ID: {item.get('id')}, UserID: {item.get('user_id')}, Label: {item.get('label')}")

    # Count total
    count = client.table("objetos_exploracion").select("*", count="exact", head=True).execute().count
    print(f"\nTotal Count in Table: {count}")

except Exception as e:
    print(f"Error: {e}")
