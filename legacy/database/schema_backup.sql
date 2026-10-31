--
-- PostgreSQL database dump
--

-- Dumped from database version 15.1 (Ubuntu 15.1-1.pgdg20.04+1)
-- Dumped by pg_dump version 15.5 (Ubuntu 15.5-1.pgdg20.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: aal_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- Name: code_challenge_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- Name: factor_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- Name: factor_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.factor_type AS ENUM (
    'totp',
    'webauthn'
);


--
-- Name: one_time_token_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- Name: get_all_objects_with_coords(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_all_objects_with_coords() RETURNS TABLE(id uuid, name text, type text, lat double precision, lng double precision, description text, metadata jsonb, mission_id uuid, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY 
    SELECT 
        o.id,
        o.nombre as name,
        o.tipo as type,
        ST_Y(o.posicion::geometry) as lat,
        ST_X(o.posicion::geometry) as lng,
        o.descripcion as description,
        o.metadata,
        o.mission_id,
        o.created_at
    FROM objetos_exploracion o
    ORDER BY o.created_at DESC
    LIMIT 200;
END;
$$;


--
-- Name: get_mission_stats(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_mission_stats(mission_uuid uuid) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  obj_count int;
BEGIN
  SELECT count(*) INTO obj_count FROM objetos_exploracion WHERE mission_id = mission_uuid;
  RETURN json_build_object(
    'object_count', obj_count
  );
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    INSERT INTO public.profiles (id, username, display_name)
    VALUES (
        new.id,
        SPLIT_PART(new.email, '@', 1),
        SPLIT_PART(new.email, '@', 1)
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$;


--
-- Name: search_similar_objects(public.vector, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_similar_objects(query_embedding public.vector, match_threshold double precision DEFAULT 0.75, match_count integer DEFAULT 3) RETURNS TABLE(id uuid, nombre text, tipo text, lat double precision, lng double precision, metadata jsonb, similarity double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        objetos_exploracion.id,
        objetos_exploracion.nombre,
        objetos_exploracion.tipo,
        ST_Y(objetos_exploracion.posicion::geometry) as lat,
        ST_X(objetos_exploracion.posicion::geometry) as lng,
        objetos_exploracion.metadata,
        1 - (objetos_exploracion.embedding <=> query_embedding) as similarity
    FROM objetos_exploracion
    WHERE objetos_exploracion.embedding IS NOT NULL
        AND 1 - (objetos_exploracion.embedding <=> query_embedding) > match_threshold
    ORDER BY objetos_exploracion.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: categorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    color text DEFAULT '#3498db'::text,
    icono text DEFAULT 'folder'::text,
    orden integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: chat_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    title text,
    messages jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: etiquetas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.etiquetas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    color text DEFAULT '#2ecc71'::text,
    uso_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: misiones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.misiones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    codigo text,
    titulo text,
    estado text DEFAULT 'activa'::text,
    inicio_at timestamp with time zone DEFAULT now(),
    fin_at timestamp with time zone,
    zona_geografica text,
    zona text,
    clima_snapshot jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE ONLY public.misiones REPLICA IDENTITY FULL;


--
-- Name: objeto_etiquetas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.objeto_etiquetas (
    objeto_id uuid NOT NULL,
    etiqueta_id uuid NOT NULL
);


--
-- Name: objetos_exploracion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.objetos_exploracion (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    mission_id uuid,
    nombre text,
    tipo text,
    descripcion text,
    subcategoria text,
    genero text,
    posicion public.geography(Point,4326),
    embedding public.vector(512),
    metadata jsonb DEFAULT '{}'::jsonb,
    contexto_ambiental jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    categoria_id uuid,
    subcategoria_id uuid
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    username character varying(50),
    display_name character varying(100),
    avatar_url text,
    bio text,
    role character varying(20) DEFAULT 'explorador'::character varying,
    location character varying(100),
    preferences jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying(14) NOT NULL
);


--
-- Name: subcategorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subcategorias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    categoria_id uuid,
    nombre text NOT NULL,
    descripcion text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: categorias categorias_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_nombre_key UNIQUE (nombre);


--
-- Name: categorias categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_pkey PRIMARY KEY (id);


--
-- Name: chat_logs chat_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_logs
    ADD CONSTRAINT chat_logs_pkey PRIMARY KEY (id);


--
-- Name: etiquetas etiquetas_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etiquetas
    ADD CONSTRAINT etiquetas_nombre_key UNIQUE (nombre);


--
-- Name: etiquetas etiquetas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etiquetas
    ADD CONSTRAINT etiquetas_pkey PRIMARY KEY (id);


--
-- Name: misiones misiones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.misiones
    ADD CONSTRAINT misiones_pkey PRIMARY KEY (id);


--
-- Name: objeto_etiquetas objeto_etiquetas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objeto_etiquetas
    ADD CONSTRAINT objeto_etiquetas_pkey PRIMARY KEY (objeto_id, etiqueta_id);


--
-- Name: objetos_exploracion objetos_exploracion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objetos_exploracion
    ADD CONSTRAINT objetos_exploracion_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: subcategorias subcategorias_categoria_id_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategorias
    ADD CONSTRAINT subcategorias_categoria_id_nombre_key UNIQUE (categoria_id, nombre);


--
-- Name: subcategorias subcategorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategorias
    ADD CONSTRAINT subcategorias_pkey PRIMARY KEY (id);


--
-- Name: idx_chat_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_logs_user_id ON public.chat_logs USING btree (user_id);


--
-- Name: idx_obj_mission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_obj_mission ON public.objetos_exploracion USING btree (mission_id);


--
-- Name: idx_obj_pos; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_obj_pos ON public.objetos_exploracion USING gist (posicion);


--
-- Name: idx_objeto_etiquetas_etiqueta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_objeto_etiquetas_etiqueta ON public.objeto_etiquetas USING btree (etiqueta_id);


--
-- Name: idx_objeto_etiquetas_objeto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_objeto_etiquetas_objeto ON public.objeto_etiquetas USING btree (objeto_id);


--
-- Name: idx_objetos_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_objetos_categoria ON public.objetos_exploracion USING btree (categoria_id);


--
-- Name: idx_objetos_subcategoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_objetos_subcategoria ON public.objetos_exploracion USING btree (subcategoria_id);


--
-- Name: idx_subcategorias_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subcategorias_categoria ON public.subcategorias USING btree (categoria_id);


--
-- Name: schema_migrations_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX schema_migrations_version_idx ON public.schema_migrations USING btree (version);


--
-- Name: chat_logs chat_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_logs
    ADD CONSTRAINT chat_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: misiones misiones_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.misiones
    ADD CONSTRAINT misiones_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: objeto_etiquetas objeto_etiquetas_etiqueta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objeto_etiquetas
    ADD CONSTRAINT objeto_etiquetas_etiqueta_id_fkey FOREIGN KEY (etiqueta_id) REFERENCES public.etiquetas(id) ON DELETE CASCADE;


--
-- Name: objeto_etiquetas objeto_etiquetas_objeto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objeto_etiquetas
    ADD CONSTRAINT objeto_etiquetas_objeto_id_fkey FOREIGN KEY (objeto_id) REFERENCES public.objetos_exploracion(id) ON DELETE CASCADE;


--
-- Name: objetos_exploracion objetos_exploracion_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objetos_exploracion
    ADD CONSTRAINT objetos_exploracion_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id);


--
-- Name: objetos_exploracion objetos_exploracion_mission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objetos_exploracion
    ADD CONSTRAINT objetos_exploracion_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES public.misiones(id);


--
-- Name: objetos_exploracion objetos_exploracion_subcategoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objetos_exploracion
    ADD CONSTRAINT objetos_exploracion_subcategoria_id_fkey FOREIGN KEY (subcategoria_id) REFERENCES public.subcategorias(id);


--
-- Name: objetos_exploracion objetos_exploracion_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.objetos_exploracion
    ADD CONSTRAINT objetos_exploracion_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: subcategorias subcategorias_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcategorias
    ADD CONSTRAINT subcategorias_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE CASCADE;


--
-- Name: misiones Enable read access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all users" ON public.misiones FOR SELECT USING (true);


--
-- Name: profiles Profiles are viewable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles FOR SELECT TO authenticated USING (true);


--
-- Name: chat_logs Users can delete own chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own chats" ON public.chat_logs FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: chat_logs Users can insert own chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own chats" ON public.chat_logs FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));


--
-- Name: chat_logs Users can update own chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own chats" ON public.chat_logs FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id));


--
-- Name: chat_logs Users can view own chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own chats" ON public.chat_logs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: chat_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: misiones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.misiones ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION get_all_objects_with_coords(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_all_objects_with_coords() TO anon;
GRANT ALL ON FUNCTION public.get_all_objects_with_coords() TO authenticated;
GRANT ALL ON FUNCTION public.get_all_objects_with_coords() TO service_role;


--
-- Name: FUNCTION get_mission_stats(mission_uuid uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_mission_stats(mission_uuid uuid) TO anon;
GRANT ALL ON FUNCTION public.get_mission_stats(mission_uuid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_mission_stats(mission_uuid uuid) TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION search_similar_objects(query_embedding public.vector, match_threshold double precision, match_count integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.search_similar_objects(query_embedding public.vector, match_threshold double precision, match_count integer) TO anon;
GRANT ALL ON FUNCTION public.search_similar_objects(query_embedding public.vector, match_threshold double precision, match_count integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_similar_objects(query_embedding public.vector, match_threshold double precision, match_count integer) TO service_role;


--
-- Name: TABLE categorias; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.categorias TO anon;
GRANT ALL ON TABLE public.categorias TO authenticated;
GRANT ALL ON TABLE public.categorias TO service_role;


--
-- Name: TABLE chat_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_logs TO anon;
GRANT ALL ON TABLE public.chat_logs TO authenticated;
GRANT ALL ON TABLE public.chat_logs TO service_role;


--
-- Name: TABLE etiquetas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.etiquetas TO anon;
GRANT ALL ON TABLE public.etiquetas TO authenticated;
GRANT ALL ON TABLE public.etiquetas TO service_role;


--
-- Name: TABLE misiones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.misiones TO anon;
GRANT ALL ON TABLE public.misiones TO authenticated;
GRANT ALL ON TABLE public.misiones TO service_role;


--
-- Name: TABLE objeto_etiquetas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.objeto_etiquetas TO anon;
GRANT ALL ON TABLE public.objeto_etiquetas TO authenticated;
GRANT ALL ON TABLE public.objeto_etiquetas TO service_role;


--
-- Name: TABLE objetos_exploracion; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.objetos_exploracion TO anon;
GRANT ALL ON TABLE public.objetos_exploracion TO authenticated;
GRANT ALL ON TABLE public.objetos_exploracion TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE schema_migrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.schema_migrations TO anon;
GRANT ALL ON TABLE public.schema_migrations TO authenticated;
GRANT ALL ON TABLE public.schema_migrations TO service_role;


--
-- Name: TABLE subcategorias; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subcategorias TO anon;
GRANT ALL ON TABLE public.subcategorias TO authenticated;
GRANT ALL ON TABLE public.subcategorias TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES  TO service_role;


--
-- PostgreSQL database dump complete
--

