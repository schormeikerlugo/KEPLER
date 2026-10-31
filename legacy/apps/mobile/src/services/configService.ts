/**
 * KEPLER Mobile — Runtime Config Service
 *
 * Persists user-overridable settings (backend URL, low-battery auto-pause,
 * etc.) in AsyncStorage and notifies subscribers on change.
 *
 * Why a service: the backend URL is hardcoded in `constants/config.ts` for
 * dev convenience, but a deployed APK in someone else's LAN needs to point
 * elsewhere. This service lets the user edit the URL at runtime without
 * rebuilding the binary.
 *
 * Other modules (`api.ts`, `MobileAIEngine`, etc.) read the URL via
 * `await configService.getBackendUrl()` and subscribe to `onChange()` to
 * react to live edits.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../constants/config';

const STORAGE_KEYS = {
    backendUrl: 'kepler.config.backendUrl',
    lowBatteryAutoPause: 'kepler.config.lowBatteryAutoPause',
    sentinelDuration: 'kepler.config.sentinelDuration',
} as const;

type Listener = (config: ConfigSnapshot) => void;

export interface ConfigSnapshot {
    backendUrl: string;
    wsUrl: string;
    lowBatteryAutoPause: boolean;
    sentinelDuration: number; // seconds
}

const DEFAULTS = {
    backendUrl: API_BASE_URL,
    lowBatteryAutoPause: true,
    sentinelDuration: 30,
};

class ConfigService {
    private cache: ConfigSnapshot;
    private listeners = new Set<Listener>();
    private hydrated = false;

    constructor() {
        this.cache = {
            backendUrl: DEFAULTS.backendUrl,
            wsUrl: this.deriveWsUrl(DEFAULTS.backendUrl),
            lowBatteryAutoPause: DEFAULTS.lowBatteryAutoPause,
            sentinelDuration: DEFAULTS.sentinelDuration,
        };
        // Hydrate asynchronously; callers that hit us before hydration is
        // done will get the defaults — fine for startup.
        this.hydrate();
    }

    /** Convert http(s):// → ws(s):// keeping host and port. */
    private deriveWsUrl(httpUrl: string): string {
        try {
            const url = new URL(httpUrl);
            const wsProto = url.protocol === 'https:' ? 'wss:' : 'ws:';
            return `${wsProto}//${url.host}`;
        } catch {
            return httpUrl.replace(/^http/, 'ws');
        }
    }

    private async hydrate() {
        try {
            const [storedUrl, storedAutoPause, storedSentinel] = await Promise.all([
                AsyncStorage.getItem(STORAGE_KEYS.backendUrl),
                AsyncStorage.getItem(STORAGE_KEYS.lowBatteryAutoPause),
                AsyncStorage.getItem(STORAGE_KEYS.sentinelDuration),
            ]);

            const url = storedUrl?.trim() || DEFAULTS.backendUrl;
            this.cache = {
                backendUrl: url,
                wsUrl: this.deriveWsUrl(url),
                lowBatteryAutoPause: storedAutoPause == null
                    ? DEFAULTS.lowBatteryAutoPause
                    : storedAutoPause === 'true',
                sentinelDuration: storedSentinel
                    ? Math.max(5, parseInt(storedSentinel, 10) || DEFAULTS.sentinelDuration)
                    : DEFAULTS.sentinelDuration,
            };
            this.hydrated = true;
            this.emit();
        } catch (e) {
            console.warn('[configService] hydrate failed:', e);
        }
    }

    /** Wait for the initial AsyncStorage read to complete. */
    async ready(): Promise<void> {
        if (this.hydrated) return;
        // Poll briefly; hydrate kicks off in the constructor.
        for (let i = 0; i < 50 && !this.hydrated; i++) {
            await new Promise(r => setTimeout(r, 20));
        }
    }

    private emit() {
        for (const fn of this.listeners) {
            try { fn(this.cache); } catch {}
        }
    }

    /** Subscribe to config changes. Returns unsubscribe fn. */
    onChange(fn: Listener): () => void {
        this.listeners.add(fn);
        return () => { this.listeners.delete(fn); };
    }

    getSnapshot(): ConfigSnapshot {
        return this.cache;
    }

    async getBackendUrl(): Promise<string> {
        await this.ready();
        return this.cache.backendUrl;
    }

    async getWsUrl(): Promise<string> {
        await this.ready();
        return this.cache.wsUrl;
    }

    /** Update backend URL. Validates and persists. */
    async setBackendUrl(rawUrl: string): Promise<void> {
        const url = rawUrl.trim().replace(/\/+$/, '');
        if (!/^https?:\/\//.test(url)) {
            throw new Error('La URL debe empezar con http:// o https://');
        }
        try {
            new URL(url);
        } catch {
            throw new Error('URL inválida');
        }

        this.cache = {
            ...this.cache,
            backendUrl: url,
            wsUrl: this.deriveWsUrl(url),
        };
        await AsyncStorage.setItem(STORAGE_KEYS.backendUrl, url);
        this.emit();
    }

    async setLowBatteryAutoPause(enabled: boolean): Promise<void> {
        this.cache = { ...this.cache, lowBatteryAutoPause: enabled };
        await AsyncStorage.setItem(STORAGE_KEYS.lowBatteryAutoPause, String(enabled));
        this.emit();
    }

    async setSentinelDuration(seconds: number): Promise<void> {
        const clamped = Math.max(5, Math.min(300, Math.round(seconds)));
        this.cache = { ...this.cache, sentinelDuration: clamped };
        await AsyncStorage.setItem(STORAGE_KEYS.sentinelDuration, String(clamped));
        this.emit();
    }

    async resetToDefaults(): Promise<void> {
        this.cache = {
            backendUrl: DEFAULTS.backendUrl,
            wsUrl: this.deriveWsUrl(DEFAULTS.backendUrl),
            lowBatteryAutoPause: DEFAULTS.lowBatteryAutoPause,
            sentinelDuration: DEFAULTS.sentinelDuration,
        };
        await AsyncStorage.multiRemove([
            STORAGE_KEYS.backendUrl,
            STORAGE_KEYS.lowBatteryAutoPause,
            STORAGE_KEYS.sentinelDuration,
        ]);
        this.emit();
    }

    /** Quick health check against the configured backend. */
    async testConnection(timeoutMs = 4000): Promise<{ ok: boolean; status?: number; error?: string }> {
        const url = await this.getBackendUrl();
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(`${url}/health`, { signal: controller.signal });
            clearTimeout(tid);
            return { ok: res.ok, status: res.status };
        } catch (e: any) {
            clearTimeout(tid);
            return { ok: false, error: e?.message || 'network error' };
        }
    }
}

export const configService = new ConfigService();
export default configService;
