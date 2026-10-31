import psycopg2
import os

DB_PARAMS = {
    "dbname": "postgres",
    "user": "postgres",
    "password": "mars2025",
    "host": "localhost",
    "port": 54322
}

SQL_FILE = "/home/lenovics/portafolio Dev/Mars‑Sight AR/backend/migrations/FULL_MIGRATION_EXPORT.sql"

INIT_ROLES_FILE = "/home/lenovics/portafolio Dev/Mars‑Sight AR/backend/migrations/init_roles.sql"
INIT_AUTH_FILE = "/home/lenovics/portafolio Dev/Mars‑Sight AR/backend/migrations/init_auth.sql"

def run_migration():
    print(f"Connecting to DB at port {DB_PARAMS['port']}...")
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        conn.autocommit = True
        cursor = conn.cursor()
        
        # 1. Init Roles
# print(f"Reading {INIT_ROLES_FILE}...")
# with open(INIT_ROLES_FILE, "r") as f:
#     roles_sql = f.read()
# print("Creating Supabase roles...")
# cursor.execute(roles_sql)

        # 2. Init Auth Schema
# print(f"Reading {INIT_AUTH_FILE}...")
# with open(INIT_AUTH_FILE, "r") as f:
#     auth_sql = f.read()
# print("Creating Auth schema...")
# cursor.execute(auth_sql)

        # 3. Run Main Migration
        print(f"Reading {SQL_FILE}...")
        with open(SQL_FILE, "r") as f:
            sql_content = f.read()
            
        print("Executing main migration...")
        cursor.execute(sql_content)
        
        print("Migration applied successfully!")
        conn.close()
    except Exception as e:
        print(f"Error applying migration: {e}")

if __name__ == "__main__":
    run_migration()
