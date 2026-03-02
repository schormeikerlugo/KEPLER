/**
 * Chat Streaming Module
 * Handles Server-Sent Events (SSE) for real-time AI responses
 * Includes in-session memory to maintain conversation context
 */

import { api } from '../../../js/services/api.js';

// In-session conversation memory (persists until page refresh)
let sessionHistory = [];
// Persistent chat ID from database
let currentChatId = null;

/**
 * Clear session history (call when starting new chat)
 */
export function clearSessionHistory() {
    sessionHistory = [];
    currentChatId = null;
}

/**
 * Get current session history
 */
export function getSessionHistory() {
    return [...sessionHistory];
}

/**
 * Get current chat ID (for persistence)
 */
export function getCurrentChatId() {
    return currentChatId;
}

/**
 * Set chat ID (e.g., when loading existing chat)
 */
export function setCurrentChatId(id) {
    currentChatId = id;
}

/**
 * Stream a chat message via SSE
 * @param {string} message - User message to send
 * @param {Object} callbacks - Event handlers
 * @param {string} [chatId] - Optional existing chat ID
 * @returns {Object} Controller with abort() method
 */
export function streamChat(message, callbacks = {}, chatId = null) {
    const { onStatus, onToken, onComplete, onError } = callbacks;

    let abortController = new AbortController();
    let fullResponse = '';

    // Add user message to session memory immediately
    sessionHistory.push({ role: 'user', content: message });

    const startStream = async () => {
        try {
            const token = await getAuthToken();

            const response = await fetch('/api/chat/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    message,
                    chat_id: chatId || currentChatId,  // Use stored ID if none provided
                    context: '',
                    // Send recent session history for context (last 10 messages)
                    history: sessionHistory.slice(-10)
                }),
                signal: abortController.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));

                            switch (data.type) {
                                case 'status':
                                    if (onStatus) onStatus(data.message);
                                    break;

                                case 'token':
                                    fullResponse += data.content;
                                    if (onToken) onToken(data.content, fullResponse);
                                    break;

                                case 'complete':
                                    // Store chat_id from server for persistence
                                    if (data.chat_id) {
                                        currentChatId = data.chat_id;
                                    }
                                    // Add AI response to session memory
                                    sessionHistory.push({ role: 'assistant', content: data.message });
                                    if (onComplete) onComplete(data.message, data.chat_id);
                                    break;

                                case 'error':
                                    if (onError) onError(data.message);
                                    break;
                            }
                        } catch (e) {
                            // Ignore parse errors for incomplete chunks
                        }
                    }
                }
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                if (onError) onError(error.message);
            }
        }
    };

    startStream();

    return {
        abort: () => abortController.abort(),
        getResponse: () => fullResponse
    };
}

/**
 * Create a thinking indicator element
 * @param {string} message - Status message to display
 * @returns {HTMLElement}
 */
export function createThinkingIndicator(message = 'Pensando...') {
    const indicator = document.createElement('div');
    indicator.className = 'chat-thinking-indicator';
    indicator.innerHTML = `
        <span class="thinking-dots">
            <span></span><span></span><span></span>
        </span>
        <span class="thinking-text">${message}</span>
    `;
    return indicator;
}

/**
 * Update thinking indicator message
 * @param {HTMLElement} indicator 
 * @param {string} message 
 */
export function updateThinkingIndicator(indicator, message) {
    const textEl = indicator.querySelector('.thinking-text');
    if (textEl) textEl.textContent = message;
}
