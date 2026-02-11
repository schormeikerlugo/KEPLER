import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { SUPABASE_URL } from '../constants/config';

export interface UserProfile {
    id: string;
    email?: string;
    username?: string;
    display_name?: string;
    avatar_url?: string;
    biography?: string;
    location?: string;
    is_emoji?: boolean; // Helper flag
}

export function useUserProfile() {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    const resolveAvatarUrl = useCallback((url?: string) => {
        if (!url) return null;

        // 1. Emoji support
        if (url.startsWith('emoji:')) {
            return url; // Consumer handles 'emoji:' prefix
        }

        // 2. Localhost fix for mobile (replace localhost with configured Supabase IP)
        let finalUrl = url;
        if (url.includes('localhost') || url.includes('127.0.0.1')) {
            // Extract the path after the origin
            try {
                // If it's a full URL
                if (url.startsWith('http')) {
                    const urlObj = new URL(url);
                    // Reconstruct using SUPABASE_URL's origin
                    const supabaseOrigin = new URL(SUPABASE_URL).origin;
                    finalUrl = `${supabaseOrigin}${urlObj.pathname}${urlObj.search}`;
                }
            } catch (e) {
                console.warn('Failed to parse localhost URL', e);
            }
        }

        // 3. Resolve storage path if not http
        if (!finalUrl.startsWith('http') && !finalUrl.startsWith('emoji:')) {
            const { data: urlData } = supabase.storage
                .from('avatars')
                .getPublicUrl(finalUrl);
            finalUrl = urlData.publicUrl;
        }

        return finalUrl;
    }, []);

    const fetchProfile = useCallback(async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();

            if (!session?.user) {
                setLoading(false);
                return;
            }

            const user = session.user;
            const newProfile: UserProfile = {
                id: user.id,
                email: user.email,
                username: user.email?.split('@')[0],
            };

            const { data, error } = await supabase
                .from('profiles')
                .select('username, display_name, avatar_url')
                .eq('id', user.id)
                .single();

            if (!error && data) {
                console.log('[UserProfile] Raw DB data:', JSON.stringify(data));
                if (data.username) newProfile.username = data.username;
                // Prefer display_name
                if (data.display_name) newProfile.display_name = data.display_name;

                // Columns not yet in DB, ignoring for now until migration
                // if (data.biography) newProfile.biography = data.biography;
                // if (data.location) newProfile.location = data.location;

                // Process Avatar URL
                if (data.avatar_url) {
                    const resolved = resolveAvatarUrl(data.avatar_url);
                    if (resolved) {
                        newProfile.avatar_url = resolved;
                        newProfile.is_emoji = resolved.startsWith('emoji:');
                    }
                }
            } else if (error) {
                console.error('[UserProfile] DB fetch error:', error);
            }

            setProfile(newProfile);

        } catch (e) {
            console.error('[UserProfile] Error loading profile:', e);
        } finally {
            setLoading(false);
        }
    }, [resolveAvatarUrl]);

    useEffect(() => {
        fetchProfile();
    }, [fetchProfile]);

    // Update profile function
    const updateProfile = async (updates: Partial<UserProfile>) => {
        if (!profile?.id) return;
        try {
            // Filter out non-existent columns before sending to DB
            const { biography, location, ...validUpdates } = updates;

            // For now, logging intention but strictly sending only valid fields to avoid 42703
            console.log('Skipping non-existent columns for now:', { biography, location });

            const { error } = await supabase
                .from('profiles')
                .update(validUpdates)
                .eq('id', profile.id);

            if (error) throw error;
            await fetchProfile(); // Refresh
        } catch (e) {
            console.error('Error updating profile', e);
            throw e;
        }
    };

    // Upload Avatar function
    const uploadAvatar = async (uri: string) => {
        if (!profile?.id) return;
        try {
            console.log('[UserProfile] Starting upload for:', uri);
            const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
            const fileName = `${profile.id}/avatar.${ext}`;

            // React Native Supabase upload requires ArrayBuffer for best compatibility
            const response = await fetch(uri);
            const blob = await response.blob();
            const arrayBuffer = await new Response(blob).arrayBuffer();

            console.log('[UserProfile] File loaded, uploading to Supabase...');

            const { error: uploadError, data } = await supabase.storage
                .from('avatars')
                .upload(fileName, arrayBuffer, {
                    contentType: `image/${ext === 'png' ? 'png' : 'jpeg'}`,
                    upsert: true
                });

            if (uploadError) {
                console.error('[UserProfile] Upload failed:', uploadError);
                throw uploadError;
            }

            console.log('[UserProfile] Upload success, getting public URL...');

            const { data: urlData } = supabase.storage
                .from('avatars')
                .getPublicUrl(fileName);

            // Add timestamp to foil cache
            const publicUrl = urlData.publicUrl + '?t=' + Date.now();
            console.log('[UserProfile] Public URL:', publicUrl);

            await updateProfile({ avatar_url: publicUrl });

        } catch (e) {
            console.error('[UserProfile] Error uploadAvatar:', e);
            throw e;
        }
    };

    return { profile, loading, refetch: fetchProfile, updateProfile, uploadAvatar };
}
