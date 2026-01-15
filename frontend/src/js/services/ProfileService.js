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
        return profile?.avatar_url || null;
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
            return { type: 'image', value: avatarUrl };
        } else {
            const name = profile?.display_name || profile?.email || 'U';
            return { type: 'letter', value: name[0].toUpperCase() };
        }
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
