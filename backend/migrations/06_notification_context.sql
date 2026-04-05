-- Migration: Add context JSONB column to user_notifications
-- Stores structured metadata for AI deep-dive analysis (error logs, mission data, etc.)

ALTER TABLE public.user_notifications
    ADD COLUMN IF NOT EXISTS context JSONB DEFAULT NULL;
