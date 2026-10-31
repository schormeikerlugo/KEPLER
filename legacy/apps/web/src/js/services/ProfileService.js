/**
 * Profile Service - Central profile data management
 * KEPLER Project
 * 
 * Provides cached profile data across the application
 */

import { supabase } from '../auth.js';

class ProfileService {
    constructor() {
        this.cache = null;
        this.cacheTime = 0;
        this.cacheDuration = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Get current user's profile (with caching)
     */
    async getProfile(forceRefresh = false) {
        const now = Date.now();

        // Return cached if still valid
        if (!forceRefresh && this.cache && (now - this.cacheTime) < this.cacheDuration) {
            return this.cache;
        }

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) return null;

            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();

            if (error) {
                console.error('Error loading profile:', error);
                return null;
            }

            // Cache and return
            this.cache = {
                ...data,
                email: session.user.email,
                user_id: session.user.id,
                created_at: session.user.created_at
            };
            this.cacheTime = now;

            return this.cache;
        } catch (e) {
            console.error('ProfileService error:', e);
            return null;
        }
    }

    /**
     * Get display name
     */
    async getDisplayName() {
        const profile = await this.getProfile();
        return profile?.display_name || profile?.username || profile?.email?.split('@')[0] || 'Usuario';
    }

    /**
     * Get avatar URL or emoji
     */
    async getAvatarUrl() {
        const profile = await this.getProfile();
        const avatarUrl = profile?.avatar_url || null;
        return this._resolveAvatarUrl(avatarUrl, profile?.id);
    }

    /**
     * Get AI avatar URL (custom or default)
     */
    async getAiAvatarUrl() {
        const profile = await this.getProfile();
        return profile?.ai_avatar_url || '/icons/dashboard/IA.svg';
    }

    /**
     * Get avatar display (emoji or first letter)
     */
    async getAvatarDisplay() {
        const profile = await this.getProfile();
        const avatarUrl = profile?.avatar_url;

        if (avatarUrl && avatarUrl.startsWith('emoji:')) {
            return { type: 'emoji', value: avatarUrl.replace('emoji:', '') };
        } else if (avatarUrl && (avatarUrl.startsWith('http') || avatarUrl.startsWith('/'))) {
            const resolvedUrl = this._resolveAvatarUrl(avatarUrl, profile?.id);
            return { type: 'image', value: resolvedUrl };
        } else {
            const name = profile?.display_name || profile?.email || 'U';
            return { type: 'letter', value: name[0].toUpperCase() };
        }
    }

    /**
     * Resolve avatar URL - use proxy for remote access
     * When accessing via tunnel, localhost URLs won't work on remote device
     */
    _resolveAvatarUrl(avatarUrl, userId) {
        if (!avatarUrl) return null;

        // Fix Mixed Content (Electron HTTPS block):
        // If the DB saved an insecure local IP (http:), rewrite it to the active Supabase URL origin
        const storagePathMatch = avatarUrl.match(/\/storage\/v1\/object\/public\/.*/);
        if (avatarUrl.startsWith('http:') && storagePathMatch) {
            let supaEnv = import.meta.env.VITE_SUPABASE_URL || window.location.origin;
            const supaOrigin = supaEnv.startsWith('/') ? window.location.origin + supaEnv : supaEnv;
            const cleanOrigin = supaOrigin.endsWith('/') ? supaOrigin.slice(0, -1) : supaOrigin;
            avatarUrl = `${cleanOrigin}${storagePathMatch[0]}`;
        }

        // Check if we're accessing remotely (not localhost)
        const isRemote = !window.location.hostname.includes('localhost') &&
            !window.location.hostname.includes('127.0.0.1');

        // If remote and URL points to localhost, use backend proxy
        if (isRemote && avatarUrl.includes('localhost')) {
            // Use backend proxy: /api/utils/avatar/{user_id}
            if (userId) {
                return `/api/utils/avatar/${userId}`;
            }
        }

        return avatarUrl;
    }

    /**
     * Invalidate cache (call after profile update)
     */
    invalidateCache() {
        this.cache = null;
        this.cacheTime = 0;
    }

    /**
     * Get user's short name for notifications
     */
    async getShortName() {
        const profile = await this.getProfile();
        const name = profile?.display_name || profile?.username || profile?.email?.split('@')[0] || 'Usuario';
        // Return first 15 chars if too long
        return name.length > 15 ? name.substring(0, 15) + '...' : name;
    }
}

// Singleton instance
export const profileService = new ProfileService();
