-- Drop conflicting/duplicate tables from previous attempts
DROP TABLE IF EXISTS public.missions CASCADE;
DROP TABLE IF EXISTS public.objects CASCADE;
DROP TABLE IF EXISTS public.minerals CASCADE;
DROP TABLE IF EXISTS public.pois CASCADE;
-- Also drop chat_logs references if they are linked to old tables? 
-- (Assuming chat_logs is independent or linked to auth.users, so it's fine)
