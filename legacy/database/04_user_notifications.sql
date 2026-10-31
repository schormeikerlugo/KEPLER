-- ============================================
-- USER NOTIFICATIONS TABLE
-- Per-user notification history for cross-device sync
-- ============================================

CREATE TABLE IF NOT EXISTS public.user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'info' CHECK (type IN ('critical', 'warning', 'success', 'info')),
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast user queries
CREATE INDEX IF NOT EXISTS idx_notifications_user ON user_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON user_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON user_notifications(type);

-- Enable RLS
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Users can only access their own notifications
CREATE POLICY "Users can view own notifications" ON user_notifications
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notifications" ON user_notifications
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON user_notifications
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications" ON user_notifications
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON user_notifications TO authenticated;
GRANT ALL ON user_notifications TO service_role;

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE user_notifications;
