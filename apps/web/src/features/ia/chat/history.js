/**
 * Chat History Module
 * Handles loading and managing chat history
 */

import { api } from '../../../js/services/api.js';
import { setCurrentChatId, clearSessionHistory } from './stream.js';
import { appendMessage } from './ui.js';

export const loadHistoryList = async (historyList, historyModal, loadChatSessionCallback) => {
    historyList.innerHTML = '<div class="history-item loading">Cargando...</div>';
    const history = await api.getChatHistory();

    historyList.innerHTML = '';
    if (history.length === 0) {
        historyList.innerHTML = '<div style="padding:10px; color:#666;">Sin conversaciones previas.</div>';
        return;
    }

    history.forEach(chat => {
        const date = new Date(chat.date).toLocaleDateString();
        const el = document.createElement('div');
        el.className = 'history-item';
        el.innerHTML = `
            <div class="history-info">
               <div style="font-weight:bold; color:#fff;">${chat.title || 'Conversación'}</div>
               <div class="history-meta">${date}</div>
            </div>
            <div class="history-actions">
                <button class="btn-edit-chat" data-id="${chat.id}" title="Renombrar">✎</button>
                <button class="btn-delete-chat" data-id="${chat.id}" title="Borrar">🗑</button>
            </div>
        `;

        el.addEventListener('click', async (e) => {
            const target = e.target;

            if (target.classList.contains('btn-delete-chat')) {
                if (confirm("¿Borrar esta conversación?")) {
                    await api.deleteChat(chat.id);
                    // Recursively reload
                    loadHistoryList(historyList, historyModal, loadChatSessionCallback);
                }
                return;
            }

            if (target.classList.contains('btn-edit-chat')) {
                const newTitle = prompt("Nuevo título:", chat.title);
                if (newTitle && newTitle.trim() !== "") {
                    await api.updateChatTitle(chat.id, newTitle.trim());
                    // Recursively reload
                    loadHistoryList(historyList, historyModal, loadChatSessionCallback);
                }
                return;
            }

            loadChatSessionCallback(chat.id);
            historyModal.style.display = 'none';
        });

        historyList.appendChild(el);
    });
};

export const loadChatSession = async (id, messagesContainer, suggestions, setChatIdCallback) => {
    // Invoke callback to set current ID in parent
    setChatIdCallback(id);

    // Sync with streaming module
    setCurrentChatId(id);
    clearSessionHistory();

    messagesContainer.innerHTML = '<div class="chat-message ai-message">Cargando historial...</div>';

    const chatData = await api.loadChat(id);
    messagesContainer.innerHTML = '';

    if (chatData && chatData.messages) {
        // Load messages into streaming module's session memory
        chatData.messages.forEach(msg => {
            appendMessage(messagesContainer, msg.content, msg.role === 'assistant', false);
        });
    } else {
        appendMessage(messagesContainer, "No se pudo cargar el historial.", true, false);
    }

    if (suggestions) suggestions.style.display = 'none';

    // Also sync to mobile modal if elements exist
    syncToMobileModal(messagesContainer);
};

const syncToMobileModal = (sourceContainer) => {
    const chatModalMessages = document.getElementById('chat-modal-messages');
    const chatModalWelcome = document.getElementById('chat-modal-welcome');
    const chatModalInputBottom = document.getElementById('chat-modal-input-bottom');

    if (chatModalMessages && sourceContainer) {
        chatModalMessages.innerHTML = sourceContainer.innerHTML;
        // Switch to chat mode in modal
        if (chatModalWelcome) chatModalWelcome.classList.add('hidden');
        if (chatModalMessages) chatModalMessages.classList.add('active');
        if (chatModalInputBottom) chatModalInputBottom.classList.add('active');
    }
};
