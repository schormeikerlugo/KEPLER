import psycopg2
import sys

def test_conn(port, password):
    try:
        conn = psycopg2.connect(
            dbname="postgres",
            user="postgres",
            password=password,
            host="localhost",
            port=port,
            connect_timeout=2
        )
        print(f"SUCCESS: Connected to port {port} with password '{password}'")
        conn.close()
        return True
    except Exception as e:
        print(f"FAILED: Port {port} with password '{password}' - Error: {e}")
        return False

print("Testing connections...")
# Test standard passwords
passwords = ["mars2025", "postgres", "password"]
ports = [5432, 54322]

for port in ports:
    for pwd in passwords:
        test_conn(port, pwd)
