/**
 * Profile Avatar Module
 * Handles avatar selection modal and image upload
 */

import { supabase } from '../../../js/auth.js';
import { profileService } from '../../../js/services/ProfileService.js';

// Predefined sci-fi avatars
export const AVATAR_OPTIONS = [
    { id: 'astronaut', emoji: '👨‍🚀', label: 'Astronauta' },
    { id: 'alien', emoji: '👽', label: 'Explorador' },
    { id: 'robot', emoji: '🤖', label: 'Android' },
    { id: 'rocket', emoji: '🚀', label: 'Piloto' },
    { id: 'satellite', emoji: '🛰️', label: 'Operador' },
    { id: 'star', emoji: '⭐', label: 'Comandante' },
    { id: 'moon', emoji: '🌙', label: 'Lunar' },
    { id: 'planet', emoji: '🪐', label: 'Planetario' },
];

/**
 * Setup avatar modal button
 */
export function setupAvatarModal(userId, profile) {
    const changeAvatarBtn = document.querySelector('.btn-change-avatar');
    if (changeAvatarBtn) {
        changeAvatarBtn.addEventListener('click', () => {
            showAvatarModal(userId);
        });
    }
}

/**
 * Show avatar selection modal with emoji options AND file upload
 */
export function showAvatarModal(userId) {
    const modal = document.createElement('div');
    modal.className = 'avatar-modal-overlay';
    modal.innerHTML = `
        <div class="avatar-modal">
            <div class="avatar-modal-header">
                <h3>Selecciona tu Avatar</h3>
                <button class="btn-close-modal">✕</button>
            </div>
            
            <!-- Upload Section -->
            <div class="avatar-upload-section">
                <label class="avatar-upload-btn" for="avatar-file-input">
                    📷 Subir Imagen
                </label>
                <input type="file" id="avatar-file-input" accept="image/jpeg,image/png,image/gif,image/webp" hidden />
                <div class="upload-preview" id="upload-preview" style="display:none;">
                    <img id="preview-img" />
                    <button id="confirm-upload" class="btn-confirm-upload">✓ Usar esta imagen</button>
                </div>
            </div>

            <div class="avatar-divider">
                <span>O elige un icono</span>
            </div>
            
            <!-- Emoji Grid -->
            <div class="avatar-grid">
                ${AVATAR_OPTIONS.map(opt => `
                    <button class="avatar-option" data-avatar="emoji:${opt.emoji}">
                        <span class="avatar-emoji">${opt.emoji}</span>
                        <span class="avatar-label">${opt.label}</span>
                    </button>
                `).join('')}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Setup handlers
    setupFileUpload(modal, userId);
    setupEmojiSelection(modal, userId);
    setupModalClose(modal);
}

/**
 * Handle file upload
 */
function setupFileUpload(modal, userId) {
    const fileInput = modal.querySelector('#avatar-file-input');
    const previewDiv = modal.querySelector('#upload-preview');
    const previewImg = modal.querySelector('#preview-img');
    const confirmBtn = modal.querySelector('#confirm-upload');
    let selectedFile = null;

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            window.kepler?.notify?.warning('Imagen muy grande (máx 5MB)');
            return;
        }

        selectedFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImg.src = e.target.result;
            previewDiv.style.display = 'flex';
        };
        reader.readAsDataURL(file);
    });

    confirmBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Subiendo...';

        try {
            const fileExt = selectedFile.name.split('.').pop();
            const fileName = `${userId}/avatar.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(fileName, selectedFile, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('avatars')
                .getPublicUrl(fileName);

            const publicUrl = urlData.publicUrl + '?t=' + Date.now();

            const { error } = await supabase
                .from('profiles')
                .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
                .eq('id', userId);

            if (error) throw error;

            updateAvatarUI(publicUrl, 'image');
            profileService.invalidateCache();
            window.kepler?.notify?.success('✅ Imagen de perfil actualizada');
            modal.remove();

        } catch (err) {
            console.error('Upload error:', err);
            window.kepler?.notify?.warning('Error al subir imagen');
            confirmBtn.disabled = false;
            confirmBtn.textContent = '✓ Usar esta imagen';
        }
    });
}

/**
 * Handle emoji selection
 */
function setupEmojiSelection(modal, userId) {
    modal.querySelectorAll('.avatar-option').forEach(btn => {
        btn.addEventListener('click', async () => {
            const avatarUrl = btn.dataset.avatar;

            const { error } = await supabase
                .from('profiles')
                .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
                .eq('id', userId);

            if (error) {
                console.error('Error updating avatar:', error);
                window.kepler?.notify?.warning('Error al cambiar avatar');
                return;
            }

            const emoji = avatarUrl.replace('emoji:', '');
            updateAvatarUI(emoji, 'emoji');
            profileService.invalidateCache();
            window.kepler?.notify?.success('Avatar actualizado');
            modal.remove();
        });
    });
}

/**
 * Setup modal close handlers
 */
function setupModalClose(modal) {
    modal.querySelector('.btn-close-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

/**
 * Update avatar UI element
 */
function updateAvatarUI(value, type) {
    const avatarLetterEl = document.getElementById('profile-avatar-letter');
    const avatarContainerEl = document.querySelector('.profile-avatar-large');

    if (!avatarLetterEl || !avatarContainerEl) return;

    if (type === 'image') {
        avatarLetterEl.textContent = '';
        avatarContainerEl.style.backgroundImage = `url(${value})`;
    } else {
        avatarLetterEl.textContent = value;
        avatarContainerEl.style.backgroundImage = 'none';
    }
}
