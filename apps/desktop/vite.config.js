import { defineConfig } from 'vite';
import path from 'path';

// Tauri expects a fixed port
const host = process.env.TAURI_DEV_HOST || 'localhost';

export default defineConfig({
    // Use the web app's source directly
    root: path.resolve(__dirname, '../web'),

    // Vite options
    clearScreen: false,

    server: {
        host: host,
        port: 5173,
        strictPort: true,
        hmr: host
            ? {
                protocol: 'ws',
                host,
                port: 5174,
            }
            : undefined,
        watch: {
            ignored: ['**/src-tauri/**'],
        },
        // Proxy API calls to backend
        proxy: {
            '/api': {
                target: 'http://localhost:8000',
                changeOrigin: true,
            },
        },
    },

    build: {
        outDir: path.resolve(__dirname, 'dist'),
        emptyOutDir: true,
        // Tauri uses Chromium on Windows and WebKit on macOS/Linux
        target: process.env.TAURI_ENV_PLATFORM == 'windows' ? 'chrome105' : 'safari14',
        // Produce sourcemaps for debugging
        sourcemap: !!process.env.TAURI_ENV_DEBUG,
    },

    // Environment variables
    envPrefix: ['VITE_', 'TAURI_ENV_'],
});
