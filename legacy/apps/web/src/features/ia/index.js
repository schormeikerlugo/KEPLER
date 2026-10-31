import { auth } from '../../js/auth.js';
import template from './ia.html?raw';
import './index.css'; // Dedicated IA Styles
import { initHeader } from '../../components/Header/Header.js';
import { initChat } from './chat/index.js';

export async function render(container) {
    // 1. Check Auth
    const user = await auth.getUser();

    // 2. Inject Template
    container.innerHTML = template;

    // 3. Initialize Global Reusable Header
    await initHeader('global-header-container', { context: 'ia' });

    // 4. Initialize the extracted Chat logic
    initChat();

    console.log("IA Dedicated View: Initialized");
}
