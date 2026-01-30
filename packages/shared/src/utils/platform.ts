/**
 * Platform Detection Utilities
 * @module @kepler/shared/utils/platform
 * 
 * Detect current platform and capabilities
 */

import type { Platform, DeviceInfo } from '../types';

/**
 * Detect current platform
 */
export function detectPlatform(): Platform {
    // Server-side rendering check
    if (typeof window === 'undefined') {
        return 'web';
    }

    // Electron/Tauri desktop check
    // @ts-expect-error - Global injected by Electron/Tauri
    if (window.__TAURI__ || window.electron) {
        return 'desktop';
    }

    // Mobile detection  
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
    ) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);

    return isMobile ? 'mobile' : 'web';
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
    if (typeof process !== 'undefined') {
        return process.env.NODE_ENV === 'development';
    }
    // Browser fallback - check for localhost
    if (typeof window !== 'undefined') {
        return window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1';
    }
    return false;
}

/**
 * Check if WebGL is available
 */
export function hasWebGL(): boolean {
    if (typeof document === 'undefined') return false;

    try {
        const canvas = document.createElement('canvas');
        return !!(
            canvas.getContext('webgl') ||
            canvas.getContext('webgl2') ||
            canvas.getContext('experimental-webgl')
        );
    } catch {
        return false;
    }
}

/**
 * Check if device has camera access
 */
export function hasCameraSupport(): boolean {
    if (typeof navigator === 'undefined') return false;
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/**
 * Check if geolocation is available
 */
export function hasGeolocation(): boolean {
    if (typeof navigator === 'undefined') return false;
    return !!navigator.geolocation;
}

/**
 * Get basic device info
 */
export function getDeviceInfo(): DeviceInfo {
    const platform = detectPlatform();

    return {
        platform,
        has_camera: hasCameraSupport(),
        has_gps: hasGeolocation(),
        memory_gb: typeof navigator !== 'undefined'
            // @ts-expect-error - deviceMemory is not standard
            ? navigator.deviceMemory
            : undefined,
    };
}
