import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [
    basicSsl()
  ],
  appType: 'spa', // Enable SPA fallback (all routes → index.html)
  server: {
    host: true, // Listen on all IP addresses
    port: 5180,  // Different port from React app
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        ws: true, // Enable WebSocket proxy for YOLO detection
      },
      '/supabase': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
        ws: true, // Habilitar soporte para WebSockets (Realtime)
        rewrite: (path) => path.replace(/^\/supabase/, ''),
      }
    }
  }
});
