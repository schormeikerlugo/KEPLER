import { auth } from '../../js/auth.js';
import './login.css';
import template from './login.html?raw';

export function render(container) {
    container.innerHTML = template;

    // DOM Elements
    const form = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passInput = document.getElementById('password');
    const confirmInput = document.getElementById('confirm-password');
    const btnAction = document.getElementById('btn-action'); // Login/Register Submit
    const btnToggle = document.getElementById('btn-toggle-mode'); // Switch Mode
    const groupConfirm = document.getElementById('group-confirm');
    const errorMsg = document.createElement('div');

    // Setup Error Message
    errorMsg.className = 'error-message';
    form.insertBefore(errorMsg, btnAction);

    // --- BOOT SEQUENCE ---
    // --- BOOT SEQUENCE ---
    function runBootSequence() {
        console.log("Starting Boot Sequence");
        document.body.classList.add('boot-mode');

        // Phase 2: Active Glitch (3s)
        setTimeout(() => {
            const logoWrapper = document.querySelector('.holo-logo-wrapper');
            if (logoWrapper) logoWrapper.classList.add('force-glitch');
        }, 3000);

        // Phase 3: Reveal Login (5s)
        setTimeout(() => {
            console.log("Ending Boot Sequence");
            document.body.classList.remove('boot-mode');
            const logoWrapper = document.querySelector('.holo-logo-wrapper');
            if (logoWrapper) logoWrapper.classList.remove('force-glitch');

            // Ensure buttons are clickable
            if (btnAction) btnAction.disabled = false;
            if (btnToggle) btnToggle.disabled = false;
        }, 5000);
    }

    // Start immediately
    if (!document.body.classList.contains('boot-mode-completed')) {
        runBootSequence();
        document.body.classList.add('boot-mode-completed');
    } else {
        // If re-rendering, ensure clean state
        document.body.classList.remove('boot-mode');
    }

    let isRegisterMode = false;

    // TOGGLE MODE
    btnToggle.addEventListener('click', () => {
        isRegisterMode = !isRegisterMode;

        // UI Updates
        if (isRegisterMode) {
            groupConfirm.style.display = 'flex';
            confirmInput.required = true;
            btnAction.textContent = "REGISTRARSE";
            btnToggle.textContent = "VOLVER (LOGIN)";
            errorMsg.textContent = "";
        } else {
            groupConfirm.style.display = 'none';
            confirmInput.required = false;
            btnAction.textContent = "INICIAR CONEXIÓN";
            btnToggle.textContent = "CREAR CUENTA NUEVA";
            errorMsg.textContent = "";
        }
    });

    // SUBMIT (Login or Register)
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (isRegisterMode) {
            if (passInput.value !== confirmInput.value) {
                errorMsg.textContent = "ERROR: Las contraseñas no coinciden.";
                return;
            }
        }

        handleAuth(isRegisterMode ? 'register' : 'login');
    });

    async function handleAuth(mode) {
        const isLogin = mode === 'login';
        const processText = isLogin ? "VERIFICANDO..." : "REGISTRANDO...";
        const successText = isLogin ? "ACCESO CONCEDIDO" : "REGISTRO COMPLETADO";

        btnAction.textContent = processText;
        btnAction.disabled = true;
        btnToggle.disabled = true;
        errorMsg.textContent = "";

        const email = emailInput.value;
        const password = passInput.value;

        try {
            const { user, error } = isLogin ? await auth.login(email, password) : await auth.register(email, password);

            if (error) {
                console.error("Auth Error:", error);

                // Visual Feedback: Failure
                btnAction.textContent = isLogin ? "ACCESO DENEGADO" : "REGISTRO FALLIDO";
                btnAction.style.borderColor = "var(--red)";
                btnAction.style.color = "var(--red)";
                btnAction.style.background = "rgba(255, 68, 68, 0.15)";
                btnAction.style.boxShadow = "0 0 15px rgba(255, 68, 68, 0.4)";

                if (error.message && error.message.includes("Failed to fetch")) {
                    errorMsg.textContent = "ERROR DE RED: Sin conexión.";
                } else {
                    errorMsg.textContent = "ERROR: " + (error.message || "Credenciales inválidas");
                }

                btnAction.disabled = false;
                btnToggle.disabled = false;

                // Reset button state after 2 seconds
                setTimeout(() => {
                    btnAction.textContent = isLogin ? "INICIAR CONEXIÓN" : "REGISTRARSE";
                    btnAction.style = ""; // Clear inline styles
                    errorMsg.textContent = "";
                }, 2000);

            } else {
                // Visual Feedback: Success
                btnAction.textContent = isLogin ? "ACCESO CONCEDIDO" : "REGISTRO COMPLETADO";
                btnAction.style.borderColor = "var(--green)";
                btnAction.style.color = "var(--green)";
                btnAction.style.background = "rgba(0, 212, 170, 0.15)";
                btnAction.style.boxShadow = "0 0 20px rgba(0, 212, 170, 0.5)";

                // Trigger Logo Success Animation
                const logoImg = document.querySelector('.holo-logo-img');
                const logoWrapper = document.querySelector('.holo-logo-wrapper');
                if (logoImg) logoImg.classList.add('success');
                if (logoWrapper) logoWrapper.classList.add('success');

                setTimeout(() => {
                    if (isLogin || !error) window.location.href = '/';
                }, 1000);
            }
        } catch (err) {
            console.error("Unexpected Auth Error:", err);
            errorMsg.textContent = "ERROR CRÍTICO";

            btnAction.textContent = "ERROR SISTEMA";
            btnAction.style.color = "var(--red)";
            btnAction.style.borderColor = "var(--red)";

            btnAction.disabled = false;
            btnToggle.disabled = false;
        }
    }
}
