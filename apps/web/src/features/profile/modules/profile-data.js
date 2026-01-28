/**
 * Profile Data Module
 * Handles loading profile data and populating the UI
 */

import { auth, supabase } from '../../../js/auth.js';

/**
 * Load profile from database or create if not exists
 */
export async function loadProfile(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error && error.code === 'PGRST116') {
        // Profile doesn't exist, create it
        return await createProfile(userId);
    }

    if (error) {
        console.error('Error loading profile:', error);
        return null;
    }

    return data;
}

/**
 * Create new profile for user
 */
async function createProfile(userId) {
    const user = await auth.getUser();
    const username = user?.email?.split('@')[0] || 'user';

    const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert({
            id: userId,
            username: username,
            display_name: username,
            role: 'explorador'
        })
        .select()
        .single();

    if (insertError) {
        console.error('Error creating profile:', insertError);
        return null;
    }
    return newProfile;
}

/**
 * Populate profile UI with user and profile data
 */
export function populateProfileUI(user, profile) {
    const userName = profile?.display_name || user.email.split('@')[0];
    const avatarUrl = profile?.avatar_url;

    // Update text elements
    setText('profile-display-name', userName);
    setText('profile-email', user.email);
    setText('profile-member-since', formatDate(user.created_at));

    // Update avatar
    updateAvatarDisplay(avatarUrl, userName);

    // Update role badge
    updateRoleBadge(profile?.role);
}

/**
 * Helper: Set text content safely
 */
function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

/**
 * Helper: Format date to Spanish locale
 */
function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

/**
 * Update avatar display (image, emoji, or letter)
 */
function updateAvatarDisplay(avatarUrl, userName) {
    const avatarLetterEl = document.getElementById('profile-avatar-letter');
    const avatarContainerEl = document.querySelector('.profile-avatar-large');

    if (!avatarLetterEl || !avatarContainerEl) return;

    if (avatarUrl && avatarUrl.startsWith('emoji:')) {
        // Emoji avatar
        avatarLetterEl.textContent = avatarUrl.replace('emoji:', '');
        avatarContainerEl.style.backgroundImage = 'none';
    } else if (avatarUrl && (avatarUrl.startsWith('http') || avatarUrl.startsWith('/'))) {
        // Image URL - apply to parent container
        avatarLetterEl.textContent = '';
        avatarContainerEl.style.backgroundImage = `url(${avatarUrl})`;
    } else {
        // Fallback to initial letter
        avatarLetterEl.textContent = userName[0].toUpperCase();
        avatarContainerEl.style.backgroundImage = 'none';
    }
}

/**
 * Update role badge display
 */
function updateRoleBadge(role) {
    const badgeEl = document.querySelector('.badge');
    if (!badgeEl || !role) return;

    const roleEmojis = {
        explorador: '🚀',
        investigador: '🔬',
        comandante: '⭐'
    };

    const emoji = roleEmojis[role] || '🚀';
    const capitalizedRole = role.charAt(0).toUpperCase() + role.slice(1);

    badgeEl.textContent = `${emoji} ${capitalizedRole}`;
    badgeEl.className = `badge ${role}`;
}
