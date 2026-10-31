import psycopg2
import os

# DB Config from User's Step 2355 output
DB_HOST = "127.0.0.1"
DB_PORT = "54322"
DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASS = "postgres"

def apply_sql(file_path):
    print(f"Reading {file_path}...")
    with open(file_path, "r") as f:
        sql = f.read()

    print(f"Connecting to {DB_HOST}:{DB_PORT}...")
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASS
        )
        conn.autocommit = True
        cur = conn.cursor()
        
        print("Executing SQL...")
        cur.execute(sql)
        
        print("SUCCESS: Migration applied!")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"ERROR: {e}")

import sys

if __name__ == "__main__":
    if len(sys.argv) > 1:
        apply_sql(sys.argv[1])
    else:
        print("Usage: python apply_migration.py <path_to_sql_file>")
