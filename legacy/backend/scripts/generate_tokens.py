import jwt
import time

secret = "VRvnHC3SowWNNaLNCqOPXZfxQcwL5Ryu7sQUaknYSL8="
# Verify if secret is Base64 encoded?
# Usually JWT secrets in Supabase are just strings, BUT the ending "=" suggests Base64.
# If it's used as the HMAC secret directly, PyJWT expects bytes or string.
# If it is meant to be the *value* of the secret, I use it as string.
# However, if Supabase treats it as a Base64 encoded string of the actual secret bytes, that's different.
# Standard Supabase docker env `JWT_SECRET` is a plain string.
# But `...L8=` looks like base64.
# Let's try treating it as a string first (most common error is over-decoding).

# Expiration: 10 years
exp = int(time.time()) + 315360000

def generate(role):
    payload = {
        "role": role,
        "iss": "supabase",
        "iat": int(time.time()),
        "exp": exp
    }
    # PyJWT 2.x encoding
    token = jwt.encode(payload, secret, algorithm="HS256")
    return token

print(f"ANON_KEY={generate('anon')}")
print(f"SERVICE_KEY={generate('service_role')}")
