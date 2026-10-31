-- CLEANUP SCRIPT: Remove Supabase Sample Data Tables
-- Only run this if you are sure you don't need the sample data (Meetups, Tickets, etc.)

DROP TABLE IF EXISTS "public"."feedback" CASCADE;
DROP TABLE IF EXISTS "public"."launch_weeks" CASCADE;
DROP TABLE IF EXISTS "public"."meetups" CASCADE;
DROP TABLE IF EXISTS "public"."page" CASCADE;
DROP TABLE IF EXISTS "public"."page_nimbus" CASCADE;
DROP TABLE IF EXISTS "public"."page_section" CASCADE;
DROP TABLE IF EXISTS "public"."page_section_nimbus" CASCADE;
DROP TABLE IF EXISTS "public"."tickets" CASCADE;
DROP TABLE IF EXISTS "public"."troubleshooting_entries" CASCADE;
DROP TABLE IF EXISTS "public"."validation_history" CASCADE;

-- Views (if any)
DROP VIEW IF EXISTS "public"."tickets_view";

-- NOTE: Do NOT drop 'spatial_ref_sys', 'geometry_columns', 'geography_columns' (PostGIS System)
-- NOTE: Do NOT drop 'misiones', 'objetos_exploracion', 'chat_logs' (Your Data)
