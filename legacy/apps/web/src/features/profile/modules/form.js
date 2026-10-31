/**
 * Profile Form Module
 * Handles profile form submission and data persistence
 */

import { supabase } from '../../../js/auth.js';
import { profileService } from '../../../js/services/ProfileService.js';

/**
 * Setup profile form with pre-filled data and submission handler
 */
export function setupProfileForm(userId, profile) {
    const form = document.getElementById('profile-form');
    const displayNameInput = document.getElementById('inp-display-name');
    const bioInput = document.getElementById('inp-bio');
    const locationInput = document.getElementById('inp-location');

    if (!form) return;

    // Pre-fill form
    if (displayNameInput) displayNameInput.value = profile?.display_name || '';
    if (bioInput) bioInput.value = profile?.bio || '';
    if (locationInput) locationInput.value = profile?.location || '';

    // Save button
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const updates = {
            display_name: displayNameInput?.value.trim() || '',
            bio: bioInput?.value.trim() || '',
            location: locationInput?.value.trim() || '',
            updated_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', userId);

        if (error) {
            console.error('Error saving profile:', error);
            window.kepler?.notify?.warning('Error al guardar el perfil');
            return;
        }

        // Update UI
        const displayNameEl = document.getElementById('profile-display-name');
        if (displayNameEl) displayNameEl.textContent = updates.display_name;

        // Invalidate profile cache so changes reflect across app
        profileService.invalidateCache();

        window.kepler?.notify?.success('✅ Perfil actualizado correctamente');
    });
}
