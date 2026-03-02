import { auth } from '../../js/auth.js';
import template from './ia.html?raw';
import './index.css'; // Dedicated IA Styles

// Re-use logic
import { initChat } from './chat/index.js';

export async function render(container) {
    // 1. Check Auth (Fallback in router, but good practice)
    const user = await auth.getUser();

    // 2. Inject Template
    container.innerHTML = template;

    // 3. Setup Header Profile Info
    if (user) {
        const nameEl = document.getElementById('user-name');
        if (nameEl) nameEl.textContent = user.email.split('@')[0];
    }

    // 4. Initialize the extracted Chat logic
    initChat();

    console.log("IA Dedicated View: Initialized");
}
