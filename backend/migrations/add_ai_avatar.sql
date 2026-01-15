-- Migration: Add AI Avatar URL to profiles table
-- This column stores a custom avatar image for the AI assistant

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS ai_avatar_url TEXT DEFAULT NULL;

COMMENT ON COLUMN public.profiles.ai_avatar_url IS 'Custom AI avatar URL for chat interface. If null, defaults to /icons/dashboard/IA.svg';
