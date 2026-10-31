#!/usr/bin/env python3
"""
Run telemetry tables migration
"""
import psycopg2

DB_PARAMS = {
    "dbname": "postgres",
    "user": "postgres",
    "password": "mars2025",
    "host": "localhost",
    "port": 54322
}

MIGRATION_FILE = "/home/lenovics/portafolio Dev/KEPLER/backend/migrations/add_telemetry_tables.sql"

def run_migration():
    print(f"Connecting to DB at port {DB_PARAMS['port']}...")
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        conn.autocommit = True
        cursor = conn.cursor()
        
        print(f"Reading {MIGRATION_FILE}...")
        with open(MIGRATION_FILE, "r") as f:
            sql_content = f.read()
            
        print("Executing telemetry tables migration...")
        cursor.execute(sql_content)
        
        print("✅ Telemetry migration applied successfully!")
        conn.close()
    except Exception as e:
        print(f"❌ Error applying migration: {e}")

if __name__ == "__main__":
    run_migration()
