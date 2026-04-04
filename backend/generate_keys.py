import jwt
import time
import secrets

def generate_key(role, secret):
    payload = {
        "role": role,
        "iss": "supabase",
        "iat": int(time.time()),
        "exp": int(time.time()) + 3153600000  # 100 years
    }
    return jwt.encode(payload, secret, algorithm="HS256")

secret = secrets.token_hex(32)
anon_key = generate_key("anon", secret)
service_key = generate_key("service_role", secret)

print(f"JWT_SECRET={secret}")
print(f"ANON_KEY={anon_key}")
print(f"SERVICE_KEY={service_key}")