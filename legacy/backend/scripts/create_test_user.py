import asyncio
import httpx

# Configuration from docker-compose.yml
# Pointing directly to GoTrue container port
SUPABASE_URL = "http://localhost:9999"
# Service Role Key
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NjcwMjI1NzUsImV4cCI6NDkyMDYyMjU3NX0.8yY4_OYHapxiZaukJAoXrBxAGJSPV3MUualCsfOz36Q"

async def create_user():
    print(f"Connecting to Supabase Auth at {SUPABASE_URL}...")
    
    headers = {
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        # Some versions need API Key header too
        "apikey": SUPABASE_KEY
    }
    
    payload = {
        "email": "user@example.com",
        "password": "password123",
        "email_confirm": True
    }
    
    async with httpx.AsyncClient() as client:
        try:
            # Try /admin/users (Admin API)
            print(f"POST {SUPABASE_URL}/admin/users")
            resp = await client.post(f"{SUPABASE_URL}/admin/users", json=payload, headers=headers)
            
            print(f"Status: {resp.status_code}")
            if resp.status_code in (200, 201):
                print(f"User created: {resp.json()['id']}")
            elif resp.status_code == 422 and "already registered" in resp.text:
                print("User already exists.")
            else:
                print(f"Error: {resp.text}")
                
        except Exception as e:
            print(f"Request failed: {e}")

if __name__ == "__main__":
    asyncio.run(create_user())
