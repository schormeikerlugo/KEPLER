/**
 * Loading Overlay Module
 * Shows a modal overlay with loading progress while system resources are being prepared
 * Blocks dashboard interaction until everything is ready
 */

import { supabase } from '../../../js/auth.js';

// ============================================================
// CONFIGURATION
// ============================================================

const EXPLORATION_TIPS = [
    "Los minerales brillantes pueden indicar presencia de agua subterránea.",
    "Las formaciones rocosas oscuras suelen ser de origen volcánico.",
    "El viento marciano puede alcanzar 100 km/h durante tormentas de polvo.",
    "La temperatura en Marte varía de -125°C a 20°C según la estación.",
    "El rover Perseverance tiene la cámara más potente enviada a Marte.",
    "Un día marciano (sol) dura 24 horas y 37 minutos terrestres.",
    "La gravedad en Marte es solo el 38% de la gravedad terrestre.",
    "El Olympus Mons es el volcán más grande del sistema solar.",
    "Los cráteres de impacto pueden revelar capas geológicas ocultas.",
    "El hielo de agua existe en los polos marcianos y bajo la superficie."
];

const TASKS = [
    { id: 'profile', label: 'Cargando perfil...', weight: 30 },
    { id: 'missions', label: 'Sincronizando misiones...', weight: 30 },
    { id: 'model', label: 'Abriendo conexión con Backend Core...', weight: 30 },
    { id: 'finalize', label: 'Finalizando...', weight: 10 }
];

// ============================================================
// STATE
// ============================================================

let overlay = null;
let tipInterval = null;
let currentProgress = 0;
let isVisible = false;

// ============================================================
// TEMPLATE
// ============================================================

const OVERLAY_HTML = `
<div class="loading-overlay" id="loading-overlay">
    <div class="loading-overlay-backdrop"></div>
    <div class="loading-overlay-content">
        <!-- Logo -->
        <div class="loading-header">
            <img src="/icons/kepler-logo.svg" alt="KEPLER" class="loading-logo" />
            <h1 class="loading-title">K E P L E R</h1>
            <p class="loading-subtitle">Preparando Sistema</p>
        </div>

        <!-- Progress Section -->
        <div class="loading-progress">
            <div class="progress-bar">
                <div class="progress-fill" id="overlay-progress-fill"></div>
            </div>
            <div class="progress-info">
                <span id="overlay-progress-text">Iniciando...</span>
                <span id="overlay-progress-percent">0%</span>
            </div>
        </div>

        <!-- Current Task -->
        <div class="loading-status" id="overlay-loading-status">
            ⏳ Verificando sesión...
        </div>

        <!-- Exploration Tip -->
        <div class="loading-tip">
            <div class="tip-icon">💡</div>
            <p class="tip-text" id="overlay-tip-text">
                Los minerales brillantes pueden indicar presencia de agua subterránea.
            </p>
        </div>
    </div>
</div>
`;

// ============================================================
// STYLES
// ============================================================

const OVERLAY_STYLES = `
<style id="loading-overlay-styles">
.loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 1;
    transition: opacity 0.5s ease;
}

.loading-overlay.hidden {
    opacity: 0;
    pointer-events: none;
}

.loading-overlay-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: radial-gradient(circle at center, #1b2735 0%, #090a0f 80%);
}

/* Stars Background */
.loading-overlay-backdrop::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-image:
        radial-gradient(2px 2px at 20px 30px, #eee, rgba(0, 0, 0, 0)),
        radial-gradient(2px 2px at 40px 70px, #fff, rgba(0, 0, 0, 0)),
        radial-gradient(2px 2px at 50px 160px, #ddd, rgba(0, 0, 0, 0)),
        radial-gradient(2px 2px at 90px 40px, #fff, rgba(0, 0, 0, 0)),
        radial-gradient(2px 2px at 130px 80px, #fff, rgba(0, 0, 0, 0)),
        radial-gradient(1px 1px at 200px 120px, #ccc, rgba(0, 0, 0, 0)),
        radial-gradient(1px 1px at 350px 200px, #eee, rgba(0, 0, 0, 0)),
        radial-gradient(1.5px 1.5px at 400px 50px, #fff, rgba(0, 0, 0, 0));
    background-size: 500px 300px;
    opacity: 0.4;
    animation: float-stars 30s infinite linear;
}

@keyframes float-stars {
    0% { transform: translateY(0) translateX(0); }
    50% { transform: translateY(-20px) translateX(10px); }
    100% { transform: translateY(0) translateX(0); }
}

.loading-overlay-content {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 480px;
    padding: 40px;
    background: rgba(10, 15, 25, 0.85);
    backdrop-filter: blur(15px);
    border: 1px solid rgba(63, 168, 255, 0.2);
    border-radius: 20px;
    box-shadow: 0 0 40px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    gap: 25px;
    animation: card-in 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

.loading-overlay-content::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 2px;
    background: linear-gradient(90deg, transparent, #3FA8FF, transparent);
}

@keyframes card-in {
    0% { opacity: 0; transform: scale(0.9) translateY(20px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
}

/* Header */
.loading-overlay .loading-header {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
}

.loading-overlay .loading-logo {
    width: 80px;
    height: 80px;
    filter: drop-shadow(0 0 10px rgba(63, 168, 255, 0.5));
    animation: pulse-logo 2s infinite ease-in-out;
}

@keyframes pulse-logo {
    0%, 100% { transform: scale(1); filter: drop-shadow(0 0 10px rgba(63, 168, 255, 0.5)); }
    50% { transform: scale(1.05); filter: drop-shadow(0 0 20px rgba(63, 168, 255, 0.8)); }
}

.loading-overlay .loading-title {
    font-size: 1.8rem;
    font-weight: 700;
    color: #fff;
    letter-spacing: 4px;
    margin: 0;
    text-shadow: 0 0 10px rgba(63, 168, 255, 0.3);
    font-family: 'Jura', sans-serif;
}

.loading-overlay .loading-subtitle {
    font-size: 0.8rem;
    color: #3FA8FF;
    letter-spacing: 3px;
    text-transform: uppercase;
    opacity: 0.8;
    margin: 0;
}

/* Progress Bar */
.loading-overlay .loading-progress {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.loading-overlay .progress-bar {
    width: 100%;
    height: 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    overflow: hidden;
}

.loading-overlay .progress-fill {
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, #3FA8FF, #00d4ff);
    border-radius: 4px;
    transition: width 0.3s ease;
    position: relative;
}

.loading-overlay .progress-fill::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%);
    animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
}

.loading-overlay .progress-info {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: #8899aa;
}

.loading-overlay #overlay-progress-percent {
    color: #3FA8FF;
    font-weight: 600;
}

/* Loading Status */
.loading-overlay .loading-status {
    text-align: center;
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.8);
    min-height: 24px;
}

/* Exploration Tip */
.loading-overlay .loading-tip {
    background: rgba(63, 168, 255, 0.1);
    border: 1px solid rgba(63, 168, 255, 0.2);
    border-radius: 12px;
    padding: 15px;
    display: flex;
    gap: 12px;
    align-items: flex-start;
}

.loading-overlay .tip-icon {
    font-size: 1.2rem;
    flex-shrink: 0;
}

.loading-overlay .tip-text {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.5;
    transition: opacity 0.3s ease;
}

@media (max-width: 480px) {
    .loading-overlay-content {
        margin: 15px;
        padding: 30px 20px;
    }
    
    .loading-overlay .loading-logo {
        width: 60px;
        height: 60px;
    }
    
    .loading-overlay .loading-title {
        font-size: 1.4rem;
        letter-spacing: 2px;
    }
}
</style>
`;

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Show loading overlay and start preloading all resources
 * @param {string} userId - Current user ID for loading profile/missions
 */
export async function showLoadingOverlay(userId) {
    if (isVisible) return;
    isVisible = true;

    // Inject styles if not present
    if (!document.getElementById('loading-overlay-styles')) {
        document.head.insertAdjacentHTML('beforeend', OVERLAY_STYLES);
    }

    // Inject overlay
    document.body.insertAdjacentHTML('beforeend', OVERLAY_HTML);
    overlay = document.getElementById('loading-overlay');

    // Start tip rotation
    startTipRotation();

    // Run preload tasks
    await runPreloadTasks(userId);

    // Hide overlay
    hideLoadingOverlay();
}

/**
 * Hide the loading overlay with fade animation
 */
export function hideLoadingOverlay() {
    if (!overlay) return;

    stopTipRotation();
    overlay.classList.add('hidden');

    setTimeout(() => {
        overlay?.remove();
        overlay = null;
        isVisible = false;
    }, 500);
}

/**
 * Check if overlay is currently visible
 */
export function isLoadingVisible() {
    return isVisible;
}

// ============================================================
// PRELOAD TASKS
// ============================================================

async function runPreloadTasks(userId) {
    // Task 1: Load Profile
    updateStatus('👤 Cargando perfil...');
    await loadProfile(userId);
    completeTask('profile');

    // Task 2: Sync Missions
    updateStatus('🚀 Sincronizando misiones...');
    await loadMissions(userId);
    completeTask('missions');

    // Task 3: Check Python Backend Core
    updateStatus('🧠 Conectando con Motor Local...');
    await preloadModel();
    completeTask('model');

    // Task 4: Finalize
    updateStatus('✅ Sistema listo');
    completeTask('finalize');

    // Small delay for user to see completion
    await delay(500);
}

async function loadProfile(userId) {
    try {
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (data) {
            sessionStorage.setItem('kepler_profile', JSON.stringify(data));
        }
    } catch (e) {
        console.warn('[LoadingOverlay] Profile load failed:', e);
    }
}

async function loadMissions(userId) {
    try {
        const { data } = await supabase
            .from('missions')
            .select('id, name, status, zone, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20);

        if (data) {
            sessionStorage.setItem('kepler_missions', JSON.stringify(data));
        }
    } catch (e) {
        console.warn('[LoadingOverlay] Missions load failed:', e);
    }
}

async function preloadModel() {
    // Simulate progress while waiting for backend
    let modelProgress = 0;
    const baseProgress = getBaseProgress('model');
    const taskWeight = getTaskWeight('model');

    const progressInterval = setInterval(() => {
        if (modelProgress < 95) {
            modelProgress += 10;
            const subProgress = (modelProgress / 100) * taskWeight;
            setProgress(baseProgress + subProgress);
        }
    }, 150);

    // Ping backend to ensure it's alive
    try {
        await fetch('/api/status?t=' + Date.now());
    } catch {
        // Continue anyway if backend is down, UI will show 'Desconectado'
        console.warn('[LoadingOverlay] Backend no responde al inicio');
    }

    clearInterval(progressInterval);
}

// ============================================================
// UI HELPERS
// ============================================================

function updateStatus(message) {
    const statusEl = document.getElementById('overlay-loading-status');
    if (statusEl) statusEl.textContent = message;
}

function setProgress(percent) {
    currentProgress = Math.min(100, percent);

    const fill = document.getElementById('overlay-progress-fill');
    const percentEl = document.getElementById('overlay-progress-percent');

    if (fill) fill.style.width = `${currentProgress}%`;
    if (percentEl) percentEl.textContent = `${Math.round(currentProgress)}%`;
}

function completeTask(taskId) {
    const taskIndex = TASKS.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;

    let progress = 0;
    for (let i = 0; i <= taskIndex; i++) {
        progress += TASKS[i].weight;
    }
    setProgress(progress);
}

function getBaseProgress(taskId) {
    const taskIndex = TASKS.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return 0;

    let progress = 0;
    for (let i = 0; i < taskIndex; i++) {
        progress += TASKS[i].weight;
    }
    return progress;
}

function getTaskWeight(taskId) {
    const task = TASKS.find(t => t.id === taskId);
    return task ? task.weight : 0;
}

// ============================================================
// TIP ROTATION
// ============================================================

function startTipRotation() {
    let tipIndex = Math.floor(Math.random() * EXPLORATION_TIPS.length);
    const tipEl = document.getElementById('overlay-tip-text');

    if (tipEl) {
        tipEl.textContent = EXPLORATION_TIPS[tipIndex];
    }

    tipInterval = setInterval(() => {
        tipIndex = (tipIndex + 1) % EXPLORATION_TIPS.length;

        if (tipEl) {
            tipEl.style.opacity = '0';
            setTimeout(() => {
                tipEl.textContent = EXPLORATION_TIPS[tipIndex];
                tipEl.style.opacity = '1';
            }, 300);
        }
    }, 5000);
}

function stopTipRotation() {
    if (tipInterval) {
        clearInterval(tipInterval);
        tipInterval = null;
    }
}

// ============================================================
// UTILITIES
// ============================================================

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
