/**
 * AI Avatar Module
 * Handles AI avatar selection and saving in profile
 */

import { supabase, auth } from '../../../js/auth.js';

/**
 * Setup AI Avatar selection functionality
 */
export function setupAiAvatar(userId, profile) {
    const currentImg = document.getElementById('ai-avatar-current');
    const presetButtons = document.querySelectorAll('.ai-avatar-option');
    const urlInput = document.getElementById('inp-ai-avatar-url');
    const saveBtn = document.getElementById('btn-save-ai-avatar');

    if (!currentImg) return;

    // Load current AI avatar from profile
    const currentAiAvatar = profile?.ai_avatar_url || '/icons/dashboard/IA.svg';
    updateAvatarPreview(currentAiAvatar, currentImg);

    // Mark the currently selected preset
    presetButtons.forEach(btn => {
        const avatarValue = btn.dataset.avatar;
        if (avatarValue === currentAiAvatar) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });

    // Preset button clicks
    presetButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const avatarValue = btn.dataset.avatar;

            // Update UI immediately
            presetButtons.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            updateAvatarPreview(avatarValue, currentImg);

            // Clear URL input
            if (urlInput) urlInput.value = '';

            // Save to database
            await saveAiAvatar(userId, avatarValue);
        });
    });

    // Save custom URL
    if (saveBtn && urlInput) {
        saveBtn.addEventListener('click', async () => {
            const url = urlInput.value.trim();
            if (!url) return;

            // Clear preset selection
            presetButtons.forEach(b => b.classList.remove('selected'));

            // Update preview
            updateAvatarPreview(url, currentImg);

            // Save to database
            await saveAiAvatar(userId, url);
        });
    }
}

/**
 * Update avatar preview display
 */
function updateAvatarPreview(avatarValue, imgElement) {
    if (!imgElement) return;

    if (avatarValue.startsWith('emoji:')) {
        // Emoji avatar - show as text
        const emoji = avatarValue.replace('emoji:', '');
        imgElement.style.display = 'none';

        // Create or update emoji display
        let emojiDisplay = imgElement.parentElement.querySelector('.ai-avatar-emoji-display');
        if (!emojiDisplay) {
            emojiDisplay = document.createElement('span');
            emojiDisplay.className = 'ai-avatar-emoji-display';
            emojiDisplay.style.cssText = 'font-size: 3rem; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; background: rgba(63, 168, 255, 0.1); border-radius: 50%; border: 2px solid rgba(63, 168, 255, 0.3);';
            imgElement.parentElement.insertBefore(emojiDisplay, imgElement);
        }
        emojiDisplay.textContent = emoji;
        emojiDisplay.style.display = 'flex';
    } else {
        // Image URL
        imgElement.src = avatarValue;
        imgElement.style.display = 'block';

        // Hide emoji display if exists
        const emojiDisplay = imgElement.parentElement.querySelector('.ai-avatar-emoji-display');
        if (emojiDisplay) emojiDisplay.style.display = 'none';
    }
}

/**
 * Save AI avatar to database
 */
async function saveAiAvatar(userId, avatarValue) {
    try {
        const { error } = await supabase
            .from('profiles')
            .update({ ai_avatar_url: avatarValue })
            .eq('id', userId);

        if (error) {
            console.error('Error saving AI avatar:', error);
            showToast('Error al guardar avatar', 'error');
            return;
        }

        showToast('Avatar de IA guardado ✓', 'success');
    } catch (e) {
        console.error('Error:', e);
        showToast('Error al guardar', 'error');
    }
}

/**
 * Simple toast notification
 */
function showToast(message, type = 'success') {
    const existing = document.querySelector('.profile-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `profile-toast profile-toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'success' ? 'rgba(46, 204, 113, 0.9)' : 'rgba(255, 107, 107, 0.9)'};
        color: #fff;
        padding: 12px 24px;
        border-radius: 25px;
        font-family: var(--font-jura);
        font-size: 0.95rem;
        z-index: 10000;
        animation: fadeIn 0.3s ease-out;
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}
