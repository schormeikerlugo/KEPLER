import jwt

secret = "VRvnHC3SowWNNaLNCqOPXZfxQcwL5Ryu7sQUaknYSL8="
token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE"

# Cleanup token (newlines)
token = token.replace(" \n", "").replace("\n", "").replace(" ", "")

print(f"Token: {token[:20]}...")

try:
    # Try with string secret
    decoded = jwt.decode(token, secret, algorithms=["HS256"], options={"verify_signature": True})
    print("SUCCESS: Token verified with string secret.")
except Exception as e:
    print(f"FAIL string: {e}")

try:
    # Try with "super-secret-jwt-token-with-at-least-32-characters-long" (Default)
    default_sec = "super-secret-jwt-token-with-at-least-32-characters-long"
    decoded = jwt.decode(token, default_sec, algorithms=["HS256"], options={"verify_signature": True})
    print("SUCCESS: Token verified with DEFAULT secret.")
except Exception as e:
    print(f"FAIL default: {e}")
