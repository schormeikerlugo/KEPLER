/**
 * Chat Animations Module
 * Handles typewriter and scramble effects
 */

import { parseMessageWithImages } from './parser.js';

// Function to reveal text with scramble effect used in HTML nodes
const revealWithScramble = (node, charIndex, scrambleChars) => {
    if (node.nodeType === Node.TEXT_NODE) {
        const originalText = node.textContent;
        let newText = '';
        for (let i = 0; i < originalText.length; i++) {
            if (charIndex > 0) {
                // Revealed - show real character
                newText += originalText[i];
                charIndex--;
            } else if (originalText[i] === ' ' || originalText[i] === '\n') {
                // Keep spaces
                newText += originalText[i];
            } else if (i < 4) {
                // Next few chars - show scrambled (decoding effect)
                newText += scrambleChars.charAt(Math.floor(Math.random() * scrambleChars.length));
            } else {
                // Rest - hide
                newText += '';
            }
        }
        node.textContent = newText;
        return charIndex;
    }
    for (let child of node.childNodes) {
        charIndex = revealWithScramble(child, charIndex, scrambleChars);
    }
    return charIndex;
};

// Typewriter + Scramble effect for rendered HTML
export const runHTMLTypewriterEffect = (element, fullText, originalHTML, messagesContainer) => {
    let revealIndex = 0;
    const speed = 10;
    const scrambleChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*◆◇○●□■";

    const interval = setInterval(() => {
        revealIndex += 2;
        element.innerHTML = originalHTML;
        revealWithScramble(element, revealIndex, scrambleChars);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        if (revealIndex >= fullText.length + 5) {
            clearInterval(interval);
            element.innerHTML = originalHTML;
        }
    }, speed);
};

// Simple text - Typewriter effect with scramble (for plain text)
export const runTextTypewriterEffect = (element, text, messagesContainer) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;':,./<>?";
    let i = 0;
    const speed = 10;

    const interval = setInterval(() => {
        i++;

        let head = text.substring(0, i);
        let scramble = '';
        for (let j = 0; j < 3; j++) {
            scramble += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        element.innerText = head + scramble;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        if (i > text.length) {
            clearInterval(interval);
            element.innerHTML = parseMessageWithImages(text);
        }
    }, speed);
};
