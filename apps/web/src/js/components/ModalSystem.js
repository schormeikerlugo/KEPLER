/**
 * ModalSystem.js
 * Reusable system for confirmation and alert modals.
 * Supports different themes: DELETE, FINISH, CONFIRM, CANCEL.
 */

export class ModalSystem {
    constructor() {
        this.modalId = 'system-confirmation-modal';
        this.injectModal();
    }

    injectModal() {
        if (document.getElementById(this.modalId)) return;

        const styles = `
            <style>
                @keyframes sys-modal-in {
                    0% { opacity: 0; transform: scale(0.9); filter: blur(10px); }
                    100% { opacity: 1; transform: scale(1); filter: blur(0); }
                }
                @keyframes sys-modal-out {
                    0% { opacity: 1; transform: scale(1); filter: blur(0); }
                    100% { opacity: 0; transform: scale(0.95); filter: blur(5px); }
                }
                @keyframes sys-pulse-border {
                    0% { box-shadow: 0 0 20px var(--glow-color); }
                    50% { box-shadow: 0 0 40px var(--glow-color); border-color: rgba(255,255,255,0.8); }
                    100% { box-shadow: 0 0 20px var(--glow-color); }
                }

                .sys-modal-overlay {
                    transition: opacity 0.3s ease;
                }
                
                .sys-modal-content {
                    animation: sys-modal-in 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards;
                }

                .sys-modal-content.closing {
                    animation: sys-modal-out 0.2s ease-in forwards;
                }
            </style>
        `;

        const modalHtml = `
            ${styles}
            <div class="modal-overlay sys-modal-overlay" id="${this.modalId}" style="
                display:none; 
                position:fixed; 
                top:0; 
                left:0; 
                width:100%; 
                height:100%; 
                align-items:center; 
                justify-content:center; 
                z-index:20000; 
                background: rgba(0, 0, 0, 0.7); 
                backdrop-filter: blur(5px);
            ">
                <div class="system-modal-body sys-modal-content" style="
                    background: rgba(10, 15, 25, 0.95);
                    border-radius: 20px;
                    padding: 30px;
                    width: 100%;
                    max-width: 400px;
                    text-align: center;
                    border: 1px solid #444;
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                    /* Glow color variable updated by JS */
                    --glow-color: rgba(255,255,255,0.2);
                    animation: sys-modal-in 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards, sys-pulse-border 3s infinite ease-in-out;
                ">
                    <h3 class="system-modal-title" style="
                        font-family: 'Jura', sans-serif;
                        font-size: 1.4rem;
                        font-weight: 700;
                        text-transform: uppercase;
                        letter-spacing: 2px;
                        margin: 0;
                    ">CONFIRMACIÓN</h3>
                    
                    <p class="system-modal-msg" style="
                        color: #ccc;
                        font-family: 'Jura', sans-serif;
                        font-size: 1rem;
                        line-height: 1.5;
                        white-space: pre-line;
                        margin: 0;
                    "></p>

                    <div class="system-modal-actions" style="
                        display: flex;
                        gap: 15px;
                        justify-content: center;
                        margin-top: 10px;
                    ">
                        <button id="sys-btn-cancel" style="
                            flex: 1;
                            padding: 12px;
                            border-radius: 10px;
                            border: 1px solid #666;
                            background: transparent;
                            color: #888;
                            font-family: 'Jura', sans-serif;
                            font-weight: 600;
                            text-transform: uppercase;
                            cursor: pointer;
                            transition: all 0.2s;
                        ">CANCELAR</button>
                        
                        <button id="sys-btn-confirm" style="
                            flex: 1;
                            padding: 12px;
                            border-radius: 10px;
                            border: 1px solid #fff;
                            background: rgba(255,255,255,0.1);
                            color: #fff;
                            font-family: 'Jura', sans-serif;
                            font-weight: 600;
                            text-transform: uppercase;
                            cursor: pointer;
                            transition: all 0.2s;
                        ">CONFIRMAR</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    /**
     * Show confirmation modal
     * @param {string} message 
     * @param {string} type - 'DELETE' | 'FINISH' | 'CONFIRM'
     * @returns {Promise<boolean>}
     */
    confirm(message, type = 'DELETE') {
        return new Promise((resolve) => {
            const modal = document.getElementById(this.modalId);
            const titleEl = modal.querySelector('.system-modal-title');
            const msgEl = modal.querySelector('.system-modal-msg');
            const bodyEl = modal.querySelector('.system-modal-body');
            const btnConfirm = document.getElementById('sys-btn-confirm');
            const btnCancel = document.getElementById('sys-btn-cancel');

            // Reset Animation Class to trigger replay
            bodyEl.classList.remove('closing');

            // Apply Theme
            const theme = this.getTheme(type);

            titleEl.textContent = theme.title;
            titleEl.style.color = theme.color;

            // Set CSS Variable for Pulse Animation
            bodyEl.style.setProperty('--glow-color', theme.glow);
            bodyEl.style.borderColor = theme.color;

            btnConfirm.textContent = theme.btnText;
            btnConfirm.style.borderColor = theme.color;
            btnConfirm.style.background = theme.btnBg;
            btnConfirm.style.color = theme.color;

            // Hover effect workaround via inline events or just simple logic
            btnConfirm.onmouseover = () => {
                btnConfirm.style.background = theme.btnBgHover;
                btnConfirm.style.boxShadow = `0 0 15px ${theme.glow}`;
            };
            btnConfirm.onmouseout = () => {
                btnConfirm.style.background = theme.btnBg;
                btnConfirm.style.boxShadow = 'none';
            };

            // Cancel Button Theme (Lighter Red or Neutral)
            btnCancel.style.borderColor = '#666';
            btnCancel.style.color = '#aaa';
            btnCancel.onmouseover = () => { btnCancel.style.background = 'rgba(255,255,255,0.05)'; };
            btnCancel.onmouseout = () => { btnCancel.style.background = 'transparent'; };

            // Set Content
            msgEl.textContent = message;
            modal.style.display = 'flex';

            // FadeIn Overlay
            modal.style.opacity = '0';
            requestAnimationFrame(() => modal.style.opacity = '1');

            const close = (result) => {
                // Exit Animation
                bodyEl.classList.add('closing');
                modal.style.opacity = '0';

                setTimeout(() => {
                    modal.style.display = 'none';
                    bodyEl.classList.remove('closing');
                    resolve(result);
                }, 200); // Match animation duration
            };

            // Handlers
            const cleanup = () => {
                btnConfirm.onclick = null;
                btnCancel.onclick = null;
            };

            btnConfirm.onclick = () => {
                cleanup();
                close(true);
            };

            btnCancel.onclick = () => {
                cleanup();
                close(false);
            };
        });
    }

    getTheme(type) {
        switch (type) {
            case 'DELETE': // Red
                return {
                    color: '#ff4444',
                    glow: 'rgba(255, 68, 68, 0.3)',
                    btnBg: 'rgba(255, 68, 68, 0.1)',
                    btnBgHover: 'rgba(255, 68, 68, 0.2)',
                    title: '⚠️ ELIMINAR',
                    btnText: 'ELIMINAR'
                };
            case 'FINISH': // Blue
                return {
                    color: '#3fa8ff',
                    glow: 'rgba(63, 168, 255, 0.3)',
                    btnBg: 'rgba(63, 168, 255, 0.1)',
                    btnBgHover: 'rgba(63, 168, 255, 0.2)',
                    title: '🏁 FINALIZAR',
                    btnText: 'FINALIZAR'
                };
            case 'CONFIRM': // Green
                return {
                    color: '#00d4aa',
                    glow: 'rgba(0, 212, 170, 0.3)',
                    btnBg: 'rgba(0, 212, 170, 0.1)',
                    btnBgHover: 'rgba(0, 212, 170, 0.2)',
                    title: '✅ CONFIRMAR',
                    btnText: 'ACEPTAR'
                };
            default: // Neutral/System
                return {
                    color: '#ffffff',
                    glow: 'rgba(255, 255, 255, 0.2)',
                    btnBg: 'rgba(255, 255, 255, 0.1)',
                    btnBgHover: 'rgba(255, 255, 255, 0.2)',
                    title: 'AVISO',
                    btnText: 'OK'
                };
        }
    }
}

// Singleton instance for shared usage
export const modalSystem = new ModalSystem();
