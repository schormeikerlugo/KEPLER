/**
 * KEPLER Shared Types
 * Shared across all apps (web, desktop, mobile)
 */

// ============================================================
// API Configuration - Same ports everywhere
// ============================================================

export const API_CONFIG = {
    // Backend FastAPI
    BACKEND_URL: 'http://localhost:8000',
    BACKEND_PORT: 8000,

    // Supabase Services
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_PORT: 54321,

    // Database
    DATABASE_PORT: 54322,

    // Ollama AI
    OLLAMA_URL: 'http://localhost:11434',
    OLLAMA_PORT: 11434,

    // Realtime WebSocket
    REALTIME_PORT: 4000,

    // Frontend Dev Server
    FRONTEND_PORT: 5180,
} as const;

// ============================================================
// Mission Types
// ============================================================

export interface Mission {
    id: string;
    user_id: string;
    codigo: string;
    titulo: string;
    zona_geografica: string;
    descripcion_ia?: string;
    clima_snapshot?: Record<string, unknown>;
    estado: 'activa' | 'completada' | 'cancelada';
    inicio_at: string;
    fin_at?: string;
}

export interface MissionStartRequest {
    titulo: string;
    zona: string;
    clima: Record<string, unknown>;
    descripcion_ia?: string;
}

// ============================================================
// Object/Detection Types
// ============================================================

export interface DetectedObject {
    id: string;
    mission_id?: string;
    user_id?: string;
    nombre: string;
    descripcion?: string;
    clasificacion?: string;
    subcategoria?: string;
    genero?: string;
    imagen_url?: string;
    latitud?: number;
    longitud?: number;
    created_at: string;
}

export interface YOLODetection {
    class: string;
    confidence: number;
    bbox: [number, number, number, number]; // [x, y, width, height]
    frameId?: number;
}

// ============================================================
// User/Profile Types
// ============================================================

export interface UserProfile {
    id: string;
    email: string;
    nombre?: string;
    avatar_url?: string;
    ai_avatar_url?: string;
    created_at: string;
}

// ============================================================
// Telemetry Types
// ============================================================

export interface TelemetryData {
    timestamp: string;
    cpu_usage: number;
    memory_usage: number;
    battery_level?: number;
    gps_accuracy?: number;
    network_status: 'online' | 'offline';
}

// ============================================================
// Platform Detection
// ============================================================

export type Platform = 'web' | 'desktop' | 'mobile' | 'ar';

export function detectPlatform(): Platform {
    if (typeof window === 'undefined') return 'web';

    // @ts-ignore - Tauri global
    if (window.__TAURI__) return 'desktop';

    // Check for mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
    ) || (navigator.maxTouchPoints > 1);

    if (isMobile) return 'mobile';

    return 'web';
}
