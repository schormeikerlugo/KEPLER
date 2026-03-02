/**
 * Chat UI Module
 * Handles UI elements, Modals, Toasts, and Message Rendering
 */

import { parseMessageWithImages, formatTime } from './parser.js';
import { runHTMLTypewriterEffect, runTextTypewriterEffect } from './animations.js';
import { profileService } from '../../../js/services/ProfileService.js';

// Cached AI avatar URL (loaded on init)
let cachedAiAvatarUrl = '/icons/dashboard/IA.svg';

// Initialize AI avatar from profile
export const initAiAvatar = async () => {
    try {
        cachedAiAvatarUrl = await profileService.getAiAvatarUrl();
    } catch (e) {
        console.warn('Could not load AI avatar, using default');
    }
};

// Toast notification function
export const showToast = (message, type = 'success') => {
    const toast = document.createElement('div');
    toast.className = `chat-toast chat-toast-${type}`;
    toast.innerHTML = `
        <span class="chat-toast-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
        <span class="chat-toast-message">${message}</span>
    `;

    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// Confirmation dialog function
export const showConfirmDialog = ({ title, message, confirmText, cancelText, onConfirm }) => {
    // Create dialog if it doesn't exist
    let dialog = document.getElementById('chat-confirm-dialog');
    if (!dialog) {
        dialog = document.createElement('div');
        dialog.id = 'chat-confirm-dialog';
        dialog.className = 'chat-confirm-dialog';
        document.body.appendChild(dialog);
    }

    dialog.innerHTML = `
        <div class="chat-confirm-content">
            <div class="chat-confirm-title">${title}</div>
            <div class="chat-confirm-message">${message.replace(/\n/g, '<br>')}</div>
            <div class="chat-confirm-actions">
                <button class="chat-confirm-btn chat-confirm-cancel">${cancelText}</button>
                <button class="chat-confirm-btn chat-confirm-ok">${confirmText}</button>
            </div>
        </div>
    `;

    dialog.style.display = 'flex';

    // Attach handlers
    dialog.querySelector('.chat-confirm-cancel').onclick = () => {
        dialog.style.display = 'none';
    };
    dialog.querySelector('.chat-confirm-ok').onclick = () => {
        dialog.style.display = 'none';
        if (onConfirm) onConfirm();
    };
    dialog.onclick = (e) => {
        if (e.target === dialog) dialog.style.display = 'none';
    };
};

// Image modal for enlarging chat images
export const setupImageModal = (messagesContainer, handleSend) => {
    // Create modal if it doesn't exist
    if (!document.getElementById('chat-image-modal')) {
        const modal = document.createElement('div');
        modal.id = 'chat-image-modal';
        modal.className = 'chat-image-modal';
        modal.innerHTML = `
            <div class="chat-image-modal-content">
                <div class="chat-image-modal-actions">
                    <button id="chat-image-download" class="chat-image-modal-btn" title="Descargar imagen">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                    </button>
                    <span class="chat-image-modal-close">&times;</span>
                </div>
                <img id="chat-image-modal-img" src="" alt="" />
                <div id="chat-image-modal-caption" class="chat-image-modal-caption"></div>
            </div>
        `;
        document.body.appendChild(modal);

        // Close on X click
        modal.querySelector('.chat-image-modal-close').onclick = () => {
            modal.style.display = 'none';
        };

        // Download button
        modal.querySelector('#chat-image-download').onclick = () => {
            const img = document.getElementById('chat-image-modal-img');
            const caption = document.getElementById('chat-image-modal-caption');
            const link = document.createElement('a');
            link.href = img.src;
            link.download = (caption.textContent || 'imagen') + '.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };

        // Close on outside click
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                modal.style.display = 'none';
            }
        });
    }

    // Delegate click handler for images and actions
    messagesContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('chat-img-clickable')) {
            const modal = document.getElementById('chat-image-modal');
            const modalImg = document.getElementById('chat-image-modal-img');
            const modalCaption = document.getElementById('chat-image-modal-caption');

            modalImg.src = e.target.dataset.fullsrc;
            modalCaption.textContent = e.target.dataset.name || e.target.alt;
            modal.style.display = 'flex';
        }

        // Handle action button clicks
        if (e.target.classList.contains('chat-action-btn')) {
            const action = e.target.dataset.action;
            const param = e.target.dataset.param;

            // Check if action needs confirmation
            if (action === 'delete') {
                showConfirmDialog({
                    title: '⚠️ Confirmar eliminación',
                    message: `¿Estás seguro de que quieres eliminar "${param}"?\n\nEsta acción no se puede deshacer.`,
                    confirmText: 'Sí, eliminar',
                    cancelText: 'Cancelar',
                    onConfirm: () => handleSend(`Sí, eliminar ${param}`)
                });
                return;
            }

            // Handle confirm delete button (from backend response)
            if (action === 'confirm_delete') {
                handleSend(`Sí, eliminar ${param}`);
                return;
            }

            // Handle cancel delete button
            if (action === 'cancel_delete') {
                // Just add a message that the action was cancelled
                const cancelMsg = document.createElement('div');
                cancelMsg.className = 'stream-thinking-message';
                cancelMsg.textContent = 'Eliminación cancelada.';
                messagesContainer.appendChild(cancelMsg);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                return;
            }

            // Map actions to chat commands
            const actionCommands = {
                'show_objects': `Muéstrame los objetos de la misión ${param}`,
                'show_image': `Muéstrame la imagen de ${param}`,
                'change_status': `Cambiar estado de la misión ${param}`,
                'export_csv': `Exportar objetos de ${param} a CSV`,
                'edit': `Editar ${param}`,
            };

            const command = actionCommands[action];
            if (command) {
                handleSend(command);
            }
        }
    });
};

// Append message to container
export const appendMessage = (messagesContainer, text, isAi = false, animate = true) => {
    if (isAi) {
        // AI message with avatar wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'ai-message-wrapper';

        const avatar = document.createElement('div');
        avatar.className = 'ai-avatar';
        avatar.innerHTML = `<img src="${cachedAiAvatarUrl}" alt="AI" class="ai-avatar-img" onerror="this.src='/icons/dashboard/IA.svg'" />`;

        const msg = document.createElement('div');
        msg.className = 'chat-message ai-message';
        msg.setAttribute('data-time', formatTime(new Date()));

        wrapper.appendChild(avatar);
        wrapper.appendChild(msg);
        messagesContainer.appendChild(wrapper);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        if (!animate) {
            msg.innerHTML = parseMessageWithImages(text);
            return;
        }

        // Check if message contains image data - skip animation for images
        if (text.includes('[IMG:') || text.includes('data:image')) {
            msg.innerHTML = parseMessageWithImages(text);
            return;
        }

        // Check if message contains markdown - use typewriter with rendered HTML
        const hasMarkdown = /[#*`|]|\[ACTION:/.test(text);

        if (hasMarkdown) {
            const parsedHTML = parseMessageWithImages(text);
            msg.innerHTML = parsedHTML;
            const fullText = msg.innerText;
            const originalHTML = msg.innerHTML;
            runHTMLTypewriterEffect(msg, fullText, originalHTML, messagesContainer);
            return;
        }

        runTextTypewriterEffect(msg, text, messagesContainer);
    } else {
        // User message (no avatar)
        const msg = document.createElement('div');
        msg.className = 'chat-message user-message';
        msg.setAttribute('data-time', formatTime(new Date()));
        msg.innerHTML = parseMessageWithImages(text);
        messagesContainer.appendChild(msg);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
};
