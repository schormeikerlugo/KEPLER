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
# Note: create_client might default to Client which doesn't expose admin directly in old versions?
# But modern supabase-py (v2) has supabase.auth.admin.
supabase = create_client(url, key)

email = "lenovics@mars.ar"
password = "leno12Ss."

print(f"Creating user {email}...")

try:
    # Check if user exists?
    # Admin API doesn't have easy 'get_user_by_email' without listing?
    # We'll just try to create. 
    
    user = supabase.auth.admin.create_user({
        "email": email,
        "password": password,
        "email_confirm": True,
        "user_metadata": { "username": "lenovics" }
    })
    
    print("SUCCESS: User created!")
    print(f"ID: {user.user.id}")
    print(f"Email: {email}")
    print(f"Password: {password}")

except Exception as e:
    print(f"ERROR: {e}")
