import os
from dotenv import load_dotenv
from supabase import create_client

# Load backend/.env
if os.path.exists("backend/.env"): load_dotenv("backend/.env")
elif os.path.exists(".env"): load_dotenv(".env")

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    exit(1)

print(f"Connecting to {url}...")
try:
    supabase = create_client(url, key)
    
    # List users (pagination might be needed if many, but for local dev usually few)
    # Supabase-py v2 syntax: supabase.auth.admin.list_users()
    response = supabase.auth.admin.list_users()
    
    if isinstance(response, list):
        users = response
    elif hasattr(response, 'users'):
        users = response.users
    else:
        print(f"DEBUG: Unknown response type: {type(response)}")
        print(response)
        users = []
    
    print(f"Total Users: {len(users)}")
    print("-" * 30)
    for user in users:
        print(f"ID: {user.id}")
        print(f"Email: {user.email}")
        print(f"Confirmed: {user.email_confirmed_at is not None}")
        print("-" * 30)

except Exception as e:
    print(f"ERROR: {e}")
