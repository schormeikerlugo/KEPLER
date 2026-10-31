/**
 * API Configuration Constants
 * @module @kepler/shared/constants/api
 * 
 * Centralized API endpoints and ports for all platforms
 */

/**
 * Backend FastAPI configuration
 */
export const BACKEND = {
    URL: 'http://localhost:8000',
    PORT: 8000,
    ENDPOINTS: {
        MISSIONS: '/api/missions',
        OBJECTS: '/api/objects',
        HEALTH: '/health',
        INFERENCE: '/api/inference',
    },
} as const;

/**
 * Supabase services configuration
 */
export const SUPABASE = {
    URL: 'http://localhost:54321',
    PORT: 54321,
    DATABASE_PORT: 54322,
    REALTIME_PORT: 4000,
} as const;

/**
 * Ollama AI configuration
 */
export const OLLAMA = {
    URL: 'http://localhost:11434',
    PORT: 11434,
    MODELS: {
        CHAT: 'mistral:7b',
        VISION: 'llava',
    },
} as const;

/**
 * Frontend dev server configuration
 */
export const FRONTEND = {
    PORT: 5180,
    URL: 'https://localhost:5180',
} as const;

/**
 * Combined API config (for backwards compatibility)
 */
export const API_CONFIG = {
    BACKEND_URL: BACKEND.URL,
    BACKEND_PORT: BACKEND.PORT,
    SUPABASE_URL: SUPABASE.URL,
    SUPABASE_PORT: SUPABASE.PORT,
    DATABASE_PORT: SUPABASE.DATABASE_PORT,
    OLLAMA_URL: OLLAMA.URL,
    OLLAMA_PORT: OLLAMA.PORT,
    REALTIME_PORT: SUPABASE.REALTIME_PORT,
    FRONTEND_PORT: FRONTEND.PORT,
} as const;
