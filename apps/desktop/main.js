/**
 * KEPLER Desktop - Electron Main Process
 * 
 * Wraps the web frontend in a native desktop window.
 */

const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');

// Development mode - load from Vite dev server or local files
const isDev = process.env.NODE_ENV === 'development';
const VITE_DEV_URL = 'https://localhost:5180';
const WEB_DIST_PATH = path.join(__dirname, '..', 'web', 'dist', 'index.html');

let mainWindow = null;

/**
 * Create the main application window
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        title: '🔭 KEPLER v0.5.0 - Sistema de Exploración',
        icon: path.join(__dirname, 'assets', 'icon.png'),
        backgroundColor: '#000000',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
        },
        show: false, // Show when ready to prevent flicker
    });

    // Load the frontend
    if (isDev) {
        // Development: load from Vite dev server
        console.log('🔧 Loading from Vite dev server:', VITE_DEV_URL);
        mainWindow.loadURL(VITE_DEV_URL);
        mainWindow.webContents.openDevTools();
    } else {
        // Production: load from built dist folder
        console.log('📦 Loading from dist:', WEB_DIST_PATH);
        mainWindow.loadFile(WEB_DIST_PATH);
    }

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.focus();
    });

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Cleanup on close
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

/**
 * Create application menu
 */
function createMenu() {
    const template = [
        {
            label: 'KEPLER',
            submenu: [
                { label: 'Acerca de KEPLER', click: showAbout },
                { type: 'separator' },
                { label: 'Recargar', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
                { label: 'DevTools', accelerator: 'F12', click: () => mainWindow?.webContents.toggleDevTools() },
                { type: 'separator' },
                { label: 'Salir', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
            ],
        },
        {
            label: 'Editar',
            submenu: [
                { role: 'undo', label: 'Deshacer' },
                { role: 'redo', label: 'Rehacer' },
                { type: 'separator' },
                { role: 'cut', label: 'Cortar' },
                { role: 'copy', label: 'Copiar' },
                { role: 'paste', label: 'Pegar' },
            ],
        },
        {
            label: 'Ver',
            submenu: [
                { role: 'togglefullscreen', label: 'Pantalla Completa' },
                { role: 'resetZoom', label: 'Zoom 100%' },
                { role: 'zoomIn', label: 'Acercar' },
                { role: 'zoomOut', label: 'Alejar' },
            ],
        },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

/**
 * Show about dialog
 */
function showAbout() {
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Acerca de KEPLER',
        message: '🔭 KEPLER v0.5.0',
        detail: 'Sistema de Exploración con IA\n\nDesarrollado por KEPLER Team\n\nPowered by Electron + Chromium',
        buttons: ['OK'],
    });
}

// App lifecycle
app.whenReady().then(() => {
    createMenu();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Handle certificate errors for local development
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    if (url.startsWith('https://localhost') || url.startsWith('wss://localhost')) {
        event.preventDefault();
        callback(true);
    } else {
        callback(false);
    }
});

console.log('🔭 KEPLER Desktop starting...');
console.log('   Mode:', isDev ? 'Development' : 'Production');
