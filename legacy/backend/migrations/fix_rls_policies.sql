-- Fix RLS Policies - Phase 1 Archives Improvement
-- Date: 2026-03-31
-- Purpose: Restrict misiones SELECT to owner only, add missing policies

-- ============================================================
-- 1. Fix misiones RLS: Replace permissive "SELECT true" policy
-- ============================================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Enable read access for all users" ON public.misiones;

-- Create proper owner-only SELECT policy
CREATE POLICY "Users can view own missions" ON public.misiones
    FOR SELECT USING (auth.uid() = user_id);

-- Add INSERT policy (if missing)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'misiones' AND policyname = 'Users can insert own missions'
    ) THEN
        CREATE POLICY "Users can insert own missions" ON public.misiones
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- Add UPDATE policy (if missing)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'misiones' AND policyname = 'Users can update own missions'
    ) THEN
        CREATE POLICY "Users can update own missions" ON public.misiones
            FOR UPDATE USING (auth.uid() = user_id);
    END IF;
END $$;

-- Add DELETE policy (if missing)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'misiones' AND policyname = 'Users can delete own missions'
    ) THEN
        CREATE POLICY "Users can delete own missions" ON public.misiones
            FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- ============================================================
-- 2. Add missing RLS policies for objetos_exploracion
-- ============================================================

ALTER TABLE public.objetos_exploracion ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objetos_exploracion' AND policyname = 'Users can view own objects'
    ) THEN
        CREATE POLICY "Users can view own objects" ON public.objetos_exploracion
            FOR SELECT USING (auth.uid() = user_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objetos_exploracion' AND policyname = 'Users can insert own objects'
    ) THEN
        CREATE POLICY "Users can insert own objects" ON public.objetos_exploracion
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objetos_exploracion' AND policyname = 'Users can update own objects'
    ) THEN
        CREATE POLICY "Users can update own objects" ON public.objetos_exploracion
            FOR UPDATE USING (auth.uid() = user_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objetos_exploracion' AND policyname = 'Users can delete own objects'
    ) THEN
        CREATE POLICY "Users can delete own objects" ON public.objetos_exploracion
            FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- ============================================================
-- 3. Add missing indexes for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_misiones_user_id ON public.misiones(user_id);
CREATE INDEX IF NOT EXISTS idx_misiones_estado ON public.misiones(estado);
CREATE INDEX IF NOT EXISTS idx_objetos_user_id ON public.objetos_exploracion(user_id);
CREATE INDEX IF NOT EXISTS idx_objetos_created_at ON public.objetos_exploracion(created_at DESC);

-- ============================================================
-- 4. RLS for categorias and etiquetas (read-only for all authenticated)
-- ============================================================

ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etiquetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcategorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objeto_etiquetas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'categorias' AND policyname = 'Authenticated users can read categorias'
    ) THEN
        CREATE POLICY "Authenticated users can read categorias" ON public.categorias
            FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'subcategorias' AND policyname = 'Authenticated users can read subcategorias'
    ) THEN
        CREATE POLICY "Authenticated users can read subcategorias" ON public.subcategorias
            FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'etiquetas' AND policyname = 'Authenticated users can read etiquetas'
    ) THEN
        CREATE POLICY "Authenticated users can read etiquetas" ON public.etiquetas
            FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objeto_etiquetas' AND policyname = 'Users can manage own object etiquetas'
    ) THEN
        CREATE POLICY "Users can manage own object etiquetas" ON public.objeto_etiquetas
            FOR ALL USING (
                objeto_id IN (
                    SELECT id FROM objetos_exploracion WHERE user_id = auth.uid()
                )
            );
    END IF;
END $$;
