/**
 * KEPLER System Preload
 * Handles pre-loading of all system resources after login
 */

import { auth, supabase } from '../../js/auth.js';

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
    { id: 'session', label: 'Verificando sesión...', weight: 10 },
    { id: 'profile', label: 'Cargando perfil...', weight: 10 },
    { id: 'missions', label: 'Sincronizando misiones...', weight: 15 },
    { id: 'model', label: 'Preparando IA de detección...', weight: 50 },
    { id: 'assets', label: 'Cargando recursos...', weight: 15 }
];

// ============================================================
// STATE
// ============================================================

let currentProgress = 0;
let tipInterval = null;
let yoloWorker = null;
let modelReady = false;

// ============================================================
// DOM ELEMENTS
// ============================================================

const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const progressPercent = document.getElementById('progress-percent');
const loadingStatus = document.getElementById('loading-status');
const tipText = document.getElementById('tip-text');
const btnSkip = document.getElementById('btn-skip');

// ============================================================
// INITIALIZATION
// ============================================================

async function init() {
    console.log('[Preload] Starting system preload...');

    // Start tip rotation
    startTipRotation();

    // Setup skip button
    btnSkip.addEventListener('click', skipToApp);

    // Run preload tasks
    try {
        await runPreloadTasks();
    } catch (error) {
        console.error('[Preload] Error:', error);
        // Even on error, allow user to continue
        showError('Error de carga. Algunos recursos pueden no estar disponibles.');
        showSkipButton();
    }
}

// ============================================================
// PRELOAD TASKS
// ============================================================

async function runPreloadTasks() {
    // Task 1: Verify Session
    updateStatus('session', '🔐 Verificando sesión...');
    const user = await verifySession();
    if (!user) {
        window.location.href = '/src/features/login/login.html';
        return;
    }
    completeTask('session');

    // Task 2: Load Profile
    updateStatus('profile', '👤 Cargando perfil...');
    await loadProfile(user.id);
    completeTask('profile');

    // Task 3: Sync Missions
    updateStatus('missions', '🚀 Sincronizando misiones...');
    await loadMissions(user.id);
    completeTask('missions');

    // Show skip button after 40%
    if (currentProgress >= 40) {
        showSkipButton();
    }

    // Task 4: Pre-load YOLO Model (heaviest task)
    updateStatus('model', '🧠 Preparando IA de detección...');
    await preloadYoloModel();
    completeTask('model');

    // Task 5: Preload Assets
    updateStatus('assets', '📦 Cargando recursos...');
    await preloadAssets();
    completeTask('assets');

    // Complete!
    updateStatus(null, '✅ Sistema listo');
    setProgress(100);

    // Wait a moment then redirect
    await delay(800);
    redirectToApp();
}

// ============================================================
// TASK IMPLEMENTATIONS
// ============================================================

async function verifySession() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    } catch {
        return null;
    }
}

async function loadProfile(userId) {
    try {
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        // Cache profile data
        if (data) {
            sessionStorage.setItem('kepler_profile', JSON.stringify(data));
        }
    } catch (e) {
        console.warn('[Preload] Profile load failed:', e);
    }
}

async function loadMissions(userId) {
    try {
        const { data } = await supabase
            .from('misiones')
            .select('id, titulo, estado, zona_geografica, inicio_at')
            .eq('user_id', userId)
            .order('inicio_at', { ascending: false })
            .limit(20);

        // Cache missions
        if (data) {
            sessionStorage.setItem('kepler_missions', JSON.stringify(data));
        }
    } catch (e) {
        console.warn('[Preload] Missions load failed:', e);
    }
}

async function preloadYoloModel() {
    // Skip preload on mobile to prevent OOM - model will load on-demand with optimized settings
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1);

    if (isMobile) {
        console.log('[Preload] Skipping YOLO preload on mobile (OOM prevention)');
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        try {
            // Create worker
            yoloWorker = new Worker(
                new URL('../../js/workers/yolo.worker.js', import.meta.url),
                { type: 'module' }
            );

            // Track progress simulation for model loading
            let modelProgress = 0;
            const progressTimer = setInterval(() => {
                if (modelProgress < 45) {
                    modelProgress += 1;
                    // Update subtask progress
                    const baseProgress = getBaseProgress('model');
                    const taskWeight = getTaskWeight('model');
                    const subProgress = (modelProgress / 50) * taskWeight;
                    setProgress(baseProgress + subProgress);
                }
            }, 200);

            // Handle worker messages
            yoloWorker.onmessage = (e) => {
                if (e.data.type === 'INIT_SUCCESS') {
                    console.log('[Preload] YOLO model ready!');
                    modelReady = true;
                    clearInterval(progressTimer);
                    // Store worker reference globally
                    window.__keplerYoloWorker = yoloWorker;
                    window.__keplerModelReady = true;
                    resolve();
                } else if (e.data.type === 'ERROR') {
                    console.error('[Preload] Model error:', e.data.error);
                    clearInterval(progressTimer);
                    resolve(); // Continue anyway
                }
            };

            // Initialize model
            yoloWorker.postMessage({
                type: 'INIT',
                data: {
                    modelPath: '/models/yolo11n.onnx',
                    wasmPath: '/onnx/',
                    numThreads: navigator.hardwareConcurrency || 4,
                    executionProviders: ['wasm']
                }
            });

            // Timeout after 90 seconds
            setTimeout(() => {
                if (!modelReady) {
                    console.warn('[Preload] Model timeout, continuing...');
                    clearInterval(progressTimer);
                    resolve();
                }
            }, 90000);

        } catch (e) {
            console.error('[Preload] Worker creation failed:', e);
            resolve();
        }
    });
}

async function preloadAssets() {
    // Preload critical images
    const images = [
        '/icons/dashboard/Start-mission.svg',
        '/icons/dashboard/IA.svg',
        '/icons/kepler-logo.svg'
    ];

    await Promise.all(images.map(src => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = resolve;
            img.src = src;
        });
    }));
}

// ============================================================
// UI HELPERS
// ============================================================

function updateStatus(taskId, message) {
    loadingStatus.textContent = message;
}

function setProgress(percent) {
    currentProgress = Math.min(100, percent);
    progressFill.style.width = `${currentProgress}%`;
    progressPercent.textContent = `${Math.round(currentProgress)}%`;

    // Update progress text based on current task
    if (currentProgress < 100) {
        const task = getCurrentTask();
        if (task) {
            progressText.textContent = task.label;
        }
    } else {
        progressText.textContent = 'Completado';
    }
}

function completeTask(taskId) {
    const taskIndex = TASKS.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;

    // Calculate progress up to this task
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

function getCurrentTask() {
    let accumulated = 0;
    for (const task of TASKS) {
        accumulated += task.weight;
        if (currentProgress < accumulated) {
            return task;
        }
    }
    return TASKS[TASKS.length - 1];
}

function showSkipButton() {
    btnSkip.style.display = 'block';
    btnSkip.animate([
        { opacity: 0, transform: 'translateY(10px)' },
        { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 300, fill: 'forwards' });
}

function showError(message) {
    loadingStatus.textContent = `⚠️ ${message}`;
    loadingStatus.style.color = '#ff6b6b';
}

// ============================================================
// TIP ROTATION
// ============================================================

function startTipRotation() {
    let tipIndex = 0;

    // Show random tip initially
    tipIndex = Math.floor(Math.random() * EXPLORATION_TIPS.length);
    tipText.textContent = EXPLORATION_TIPS[tipIndex];

    // Rotate every 5 seconds
    tipInterval = setInterval(() => {
        tipIndex = (tipIndex + 1) % EXPLORATION_TIPS.length;

        // Fade out
        tipText.style.opacity = '0';

        setTimeout(() => {
            tipText.textContent = EXPLORATION_TIPS[tipIndex];
            tipText.style.opacity = '1';
        }, 300);
    }, 5000);
}

// ============================================================
// NAVIGATION
// ============================================================

function skipToApp() {
    console.log('[Preload] User skipped, continuing to app...');
    stopTipRotation();
    redirectToApp();
}

function redirectToApp() {
    stopTipRotation();

    // Smooth transition
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.3s ease';

    setTimeout(() => {
        // Redirect to main app (SPA router loads dashboard with all CSS)
        window.location.href = '/';
    }, 300);
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

// ============================================================
// START
// ============================================================

// Add transition style
tipText.style.transition = 'opacity 0.3s ease';

init();
