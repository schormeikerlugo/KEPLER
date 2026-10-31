-- Add subcategory and gender columns to objects table
ALTER TABLE public.objetos_exploracion ADD COLUMN IF NOT EXISTS subcategoria text;
ALTER TABLE public.objetos_exploracion ADD COLUMN IF NOT EXISTS genero text;

-- Add comment for documentation
COMMENT ON COLUMN public.objetos_exploracion.subcategoria IS 'Subcategory of the object (e.g., Puente, Perro, Rio)';
COMMENT ON COLUMN public.objetos_exploracion.genero IS 'Gender for Personas/Animales (Masculino, Femenino)';
