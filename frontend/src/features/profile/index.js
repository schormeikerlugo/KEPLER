/**
 * Profile Page - Main Orchestrator
 * KEPLER Project
 * 
 * This file orchestrates all profile modules:
 * - modules/profile-data.js - Data loading and UI population
 * - modules/form.js - Form handling
 * - modules/avatar.js - Avatar modal and upload
 * - modules/stats.js - User statistics
 * - modules/security.js - Security options
 */

import { auth } from '../../js/auth.js';

// Import modules
import { loadProfile, populateProfileUI } from './modules/profile-data.js';
import { setupProfileForm } from './modules/form.js';
import { setupAvatarModal } from './modules/avatar.js';
import { loadStats } from './modules/stats.js';
import { setupSecurityButtons } from './modules/security.js';
import { setupAiAvatar } from './modules/ai-avatar.js';

/**
 * Main initialization function - initializes the profile page
 */
export async function init() {
    // Get current user
    const user = await auth.getUser();
    if (!user) {
        window.location.href = '/login';
        return;
    }

    // Load profile data
    const profile = await loadProfile(user.id);

    // Populate UI with profile data
    populateProfileUI(user, profile);

    // Load user statistics
    await loadStats(user.id);

    // Setup modules
    setupProfileForm(user.id, profile);
    setupAvatarModal(user.id, profile);
    setupSecurityButtons();
    setupAiAvatar(user.id, profile);

    // Back button
    setupBackButton();
}

/**
 * Setup back button navigation
 */
function setupBackButton() {
    const backBtn = document.getElementById('btn-back');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = '/';
        });
    }
}
