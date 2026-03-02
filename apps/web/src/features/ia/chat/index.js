/**
 * Chat Module
 * Handles AI chat, message history, and chat session management
 */

import { api } from '../../../js/services/api.js';
import { auth } from '../../../js/auth.js';
import {
    streamChat,
    createThinkingIndicator,
    updateThinkingIndicator,
    setCurrentChatId,
    clearSessionHistory
} from './stream.js';

// Modular imports
import { parseMessageWithImages } from './parser.js';
import {
    showToast,
    showConfirmDialog,
    setupImageModal,
    appendMessage,
    initAiAvatar
} from './ui.js';
import {
    runHTMLTypewriterEffect,
    runTextTypewriterEffect
} from './animations.js';
import {
    loadHistoryList,
    loadChatSession
} from './history.js';

export function initChat() {
    let currentChatId = null;

    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('btn-send-chat');
    const messagesContainer = document.getElementById('chat-messages');
    const suggestions = document.getElementById('chat-suggestions');
    const suggestionBtns = document.querySelectorAll('.suggestion-btn');

    // History UI
    const historyBtn = document.getElementById('btn-chat-history');
    const historyModal = document.getElementById('history-modal');
    const historyList = document.getElementById('history-list');
    const closeHistoryBtn = document.getElementById('btn-close-history');
    const newChatBtn = document.getElementById('btn-new-chat');

    // Initialize UI Helpers
    window.showChatToast = showToast;
    if (messagesContainer) {
        setupImageModal(messagesContainer, (cmd) => handleSend(cmd));
    }

    // Initialize AI avatar from user profile
    initAiAvatar();

    // Send message handler (Streaming Mode)
    const handleSend = async (text) => {
        if (!text.trim()) return;

        if (suggestions) suggestions.style.display = 'none';

        appendMessage(messagesContainer, text, false);
        if (input) input.value = '';

        // Create thinking indicator
        const thinkingIndicator = createThinkingIndicator('Procesando...');
        messagesContainer.appendChild(thinkingIndicator);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Create streaming message container
        const streamMsg = document.createElement('div');
        streamMsg.className = 'chat-message ai-message streaming';
        streamMsg.style.display = 'none';
        messagesContainer.appendChild(streamMsg);

        // Start streaming
        streamChat(text, {
            onStatus: (status) => {
                updateThinkingIndicator(thinkingIndicator, status);
            },
            onToken: (token, fullText) => {
                // Just keep the indicator visible while tokens arrive
                // The actual text will be animated on complete
            },
            onComplete: (finalText) => {
                // Remove indicator
                if (thinkingIndicator.parentNode) {
                    thinkingIndicator.classList.add('fade-out');
                    setTimeout(() => {
                        if (thinkingIndicator.parentNode) {
                            thinkingIndicator.remove();
                        }
                    }, 300);
                }

                // Show message container
                streamMsg.style.display = 'block';
                streamMsg.classList.remove('streaming');

                // Check for images - skip animation if present
                if (finalText.includes('[IMG:') || finalText.includes('data:image')) {
                    streamMsg.innerHTML = parseMessageWithImages(finalText);
                    return;
                }

                // Check if message contains markdown - use scramble with rendered HTML
                const hasMarkdown = /[#*`|]|\[ACTION:/.test(finalText);

                if (hasMarkdown) {
                    // Parse HTML first
                    const parsedHTML = parseMessageWithImages(finalText);
                    streamMsg.innerHTML = parsedHTML;
                    const fullText = streamMsg.innerText;
                    const originalHTML = streamMsg.innerHTML;

                    // Use animation module
                    runHTMLTypewriterEffect(streamMsg, fullText, originalHTML, messagesContainer);
                    return;
                }

                // Simple text - Typewriter effect with scramble
                runTextTypewriterEffect(streamMsg, finalText, messagesContainer);
            },
            onError: (error) => {
                if (thinkingIndicator.parentNode) thinkingIndicator.remove();
                streamMsg.style.display = 'block';
                streamMsg.classList.remove('streaming');
                streamMsg.textContent = `Error: ${error}`;
            }
        }, currentChatId);
    };

    // Event bindings
    if (sendBtn && input) {
        sendBtn.addEventListener('click', () => handleSend(input.value));
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSend(input.value);
        });
    }

    suggestionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            handleSend(btn.dataset.prompt);
        });
    });

    // History management
    if (historyBtn && historyModal) {
        historyBtn.addEventListener('click', async () => {
            historyModal.style.display = 'flex';
            loadHistoryList(historyList, historyModal, (id) => {
                loadChatSession(id, messagesContainer, suggestions, (newId) => {
                    currentChatId = newId;
                    setCurrentChatId(newId); // Sync stream module
                });
            });
        });

        closeHistoryBtn.addEventListener('click', () => {
            historyModal.style.display = 'none';
        });
    }

    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            currentChatId = null;
            // Sync with streaming module
            setCurrentChatId(null);
            clearSessionHistory();

            messagesContainer.innerHTML = '';
            appendMessage(messagesContainer, "Nueva sesión iniciada. ¿En qué puedo ayudarte?", true);

            if (historyModal) historyModal.style.display = 'none';
            if (suggestions) suggestions.style.display = 'flex';
        });
    }

    // ========== MOBILE FAB & MODAL (OpenWebUI Style) ==========
    const chatFab = document.getElementById('chat-fab');
    const chatModalOverlay = document.getElementById('chat-modal-overlay');
    const chatModalClose = document.getElementById('chat-modal-close');

    // Welcome state elements
    const chatModalWelcome = document.getElementById('chat-modal-welcome');
    const chatModalMessages = document.getElementById('chat-modal-messages');
    const chatModalInputBottom = document.getElementById('chat-modal-input-bottom');

    // Switch to chat mode (hide welcome, show messages)
    const switchToChatMode = () => {
        if (chatModalWelcome) chatModalWelcome.classList.add('hidden');
        if (chatModalMessages) chatModalMessages.classList.add('active');
        if (chatModalInputBottom) chatModalInputBottom.classList.add('active');
    };

    // Switch to welcome mode
    const switchToWelcomeMode = () => {
        if (chatModalWelcome) chatModalWelcome.classList.remove('hidden');
        if (chatModalMessages) chatModalMessages.classList.remove('active');
        if (chatModalInputBottom) chatModalInputBottom.classList.remove('active');
    };

    // Open modal
    if (chatFab && chatModalOverlay) {
        chatFab.addEventListener('click', () => {
            chatModalOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';

            // Check if modal has its own messages
            const hasModalMessages = chatModalMessages && chatModalMessages.children.length > 0;

            // Show appropriate view based on message state
            if (hasModalMessages) {
                switchToChatMode();
            } else {
                switchToWelcomeMode();
            }
        });
    }

    // Close modal
    if (chatModalClose && chatModalOverlay) {
        chatModalClose.addEventListener('click', () => {
            chatModalOverlay.classList.remove('active');
            document.body.style.overflow = '';
        });
    }

    // ========== MOBILE MENU TOGGLE & ACTIONS ==========
    const chatModalMenuBtn = document.getElementById('chat-modal-menu-btn');
    const chatModalMenu = document.getElementById('chat-modal-menu');

    // Toggle menu dropdown
    if (chatModalMenuBtn && chatModalMenu) {
        chatModalMenuBtn.addEventListener('click', () => {
            chatModalMenu.classList.toggle('active');
        });

        // Close menu when clicking outside
        chatModalOverlay?.addEventListener('click', (e) => {
            if (!chatModalMenu.contains(e.target) && !chatModalMenuBtn.contains(e.target)) {
                chatModalMenu.classList.remove('active');
            }
        });
    }

    // Menu item: New Chat
    const modalNewChat = document.getElementById('modal-new-chat');
    if (modalNewChat) {
        modalNewChat.addEventListener('click', () => {
            currentChatId = null;
            setCurrentChatId(null);
            clearSessionHistory();
            if (chatModalMessages) chatModalMessages.innerHTML = '';
            switchToWelcomeMode();
            chatModalMenu?.classList.remove('active');
        });
    }

    // Menu item: History
    const modalHistory = document.getElementById('modal-history');
    if (modalHistory && historyModal) {
        modalHistory.addEventListener('click', () => {
            chatModalMenu?.classList.remove('active');
            historyModal.style.display = 'flex';
            loadHistoryList(historyList, historyModal, (id) => {
                loadChatSession(id, messagesContainer, suggestions, (newId) => {
                    currentChatId = newId;
                    setCurrentChatId(newId);
                });
            });
        });
    }

    // Menu item: Open Map
    const modalOpenMap = document.getElementById('modal-open-map');
    if (modalOpenMap && chatModalOverlay) {
        modalOpenMap.addEventListener('click', () => {
            chatModalMenu?.classList.remove('active');
            chatModalOverlay.classList.remove('active');
            document.body.style.overflow = '';
            // Trigger map open (dispatch custom event or call global function)
            const navBtnMap = document.getElementById('nav-btn-map');
            if (navBtnMap) navBtnMap.click();
        });
    }

    // Menu item: Exit to Dashboard
    const modalExit = document.getElementById('modal-exit');
    if (modalExit && chatModalOverlay) {
        modalExit.addEventListener('click', () => {
            chatModalMenu?.classList.remove('active');
            chatModalOverlay.classList.remove('active');
            document.body.style.overflow = '';
        });
    }

    // Note: Mobile modal sending already uses separate inputs which we might need to bind if we want full functionality, 
    // but the original code had distinct logic for modal sending which duplicated a lot.
    // For now, I kept the core logic but if there are specific inputs for mobile modal that need binding,
    // they should reuse handleSend or similar if possible.
    // The original code had specific handlers for modal inputs. Let's add them back using our modular functions if needed.

    // ... Any other event listeners ...
    // Send from modal (welcome state input)
    const handleModalSend = async (text, inputElement) => {
        if (!text.trim()) return;
        switchToChatMode();
        handleSend(text);
        if (inputElement) inputElement.value = '';
    };

    // Mobile Input Elements (defined here for usage in handlers)
    const btnSendModal = document.getElementById('btn-send-modal');
    const chatModalInput = document.getElementById('chat-modal-input');

    // Mobile Event Bindings
    if (btnSendModal && chatModalInput) {
        btnSendModal.addEventListener('click', () => handleModalSend(chatModalInput.value, chatModalInput));
        chatModalInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleModalSend(chatModalInput.value, chatModalInput);
        });
    }

    // Active chat modal input
    const btnSendModalActive = document.getElementById('btn-send-modal-active');
    const chatModalInputActive = document.getElementById('chat-modal-input-active');

    if (btnSendModalActive && chatModalInputActive) {
        btnSendModalActive.addEventListener('click', () => handleSend(chatModalInputActive.value));
        chatModalInputActive.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleSend(chatModalInputActive.value);
                chatModalInputActive.value = '';
            }
        });
    }

    // Modal suggestions
    const modalSuggestionCards = document.querySelectorAll('.suggestion-card');
    modalSuggestionCards.forEach(card => {
        card.addEventListener('click', () => {
            const text = card.querySelector('p').textContent;
            handleModalSend(text, chatModalInput);
        });
    });
}
