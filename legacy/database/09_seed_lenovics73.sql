-- Script Autogenerado por Kepler AI
-- Este script actualiza temporalmente las imágenes de las personas encontradas
-- NO necesita ID de usuario porque RLS no aplica en Supabase Studio (Admin)

UPDATE public.personas_encontradas 
SET image_url = 'https://api.dicebear.com/7.x/bottts/svg?seed=Alpha&backgroundColor=0e1e30' 
WHERE image_url IS NULL;

-- Para inyectar las rutas, por favor usa la consola del Frontend (F12) y ejecuta:
-- window.kepler.seedDummyRoutes()
