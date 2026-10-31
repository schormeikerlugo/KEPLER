/**
 * OfflineSyncService
 * Handles offline object storage, connection detection, and automatic sync
 * Objects persist in localStorage until successfully synced to server
 */

import { auth } from '../auth.js';

const API_BASE = '/api';
const STORAGE_KEY = 'kepler_pending_objects';
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds between retries

class OfflineSyncService {
    constructor() {
        this.isOnline = navigator.onLine;
        this.isSyncing = false;
        this.pendingQueue = [];
        this.onStatusChange = null; // Callback for UI updates

        // Load pending queue from localStorage
        this._loadQueue();

        // Setup connection listeners
        this._setupConnectionListeners();
    }

    // ============================================================
    // PUBLIC API
    // ============================================================

    /**
     * Create an object - handles offline storage automatically
     * @param {Object} data - Object data to create
     * @returns {Promise<Object>} - Result with success status
     */
    async createObject(data) {
        const pendingItem = {
            id: `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            data: data,
            createdAt: new Date().toISOString(),
            attempts: 0,
            status: 'pending'
        };

        if (this.isOnline) {
            // Try to sync immediately
            const result = await this._syncItem(pendingItem);
            if (result.success) {
                const objName = data.nombre || data.label || data.class_name || 'Objeto';
                this._notify('success', `✅ "${objName}" registrado correctamente`, {
                    source: 'sync', action: 'create', isOnline: true,
                    object: { nombre: objName, tipo: data.tipo || data.class_name }
                });
                return result;
            }
        }

        // If offline or sync failed, add to queue
        this._addToQueue(pendingItem);
        const objName = data.nombre || data.label || data.class_name || 'Objeto';
        const pending = this.getPendingCount();
        this._notify('info', `💾 "${objName}" guardado localmente\n📋 ${pending} objeto(s) en cola de sincronizacion`, {
            source: 'sync', action: 'queued', isOnline: this.isOnline,
            object: { nombre: objName, tipo: data.tipo || data.class_name },
            pendingCount: pending
        });

        return {
            success: true,
            offline: true,
            pendingId: pendingItem.id,
            message: 'Guardado localmente, se sincronizará automáticamente'
        };
    }

    /**
     * Force sync all pending objects
     * @returns {Promise<Object>} - Sync results
     */
    async forceSync() {
        if (!this.isOnline) {
            this._notify('warning', '📴 Sin conexión. No se puede sincronizar.');
            return { success: false, synced: 0, failed: 0 };
        }

        if (this.isSyncing) {
            this._notify('info', '⏳ Sincronización en progreso...');
            return { success: false, synced: 0, failed: 0 };
        }

        return await this._processQueue();
    }

    /**
     * Get pending count
     * @returns {number}
     */
    getPendingCount() {
        return this.pendingQueue.filter(item => item.status === 'pending').length;
    }

    /**
     * Get full queue status
     * @returns {Object}
     */
    getStatus() {
        return {
            isOnline: this.isOnline,
            isSyncing: this.isSyncing,
            pendingCount: this.getPendingCount(),
            totalQueued: this.pendingQueue.length,
            failedCount: this.pendingQueue.filter(item => item.status === 'failed').length
        };
    }

    /**
     * Set callback for status changes
     * @param {Function} callback
     */
    setStatusCallback(callback) {
        this.onStatusChange = callback;
    }

    /**
     * Clear all pending items (use with caution)
     */
    clearQueue() {
        this.pendingQueue = [];
        this._saveQueue();
        this._notifyStatusChange();
    }

    // ============================================================
    // PRIVATE: Connection Management
    // ============================================================

    _setupConnectionListeners() {
        window.addEventListener('online', () => {
            console.log('[OfflineSync] Connection restored');
            this.isOnline = true;
            const pending = this.getPendingCount();
            const summary = this._getPendingSummary();
            this._notify('success', `📶 Conexion restaurada${pending > 0 ? `\n📋 ${pending} objeto(s) pendientes de sync` : ''}`, {
                source: 'sync', action: 'online', isOnline: true, pendingCount: pending, pendingItems: summary.labels
            });
            this._notifyStatusChange();

            if (pending > 0) {
                setTimeout(() => {
                    const s = this._getPendingSummary();
                    const itemList = s.labels.join('\n  - ');
                    this._notify('info', `🔄 Sincronizando ${pending} objetos...\n  - ${itemList}${s.hasMore ? '\n  ...y mas' : ''}`, {
                        source: 'sync', action: 'syncing', isOnline: true, pendingCount: pending, pendingItems: s.labels
                    });
                    this._processQueue();
                }, 2000);
            }
        });

        window.addEventListener('offline', () => {
            console.log('[OfflineSync] Connection lost');
            this.isOnline = false;
            const pending = this.getPendingCount();
            this._notify('warning', `📴 Sin conexion${pending > 0 ? ` — ${pending} objeto(s) en cola local` : ''}`, {
                source: 'sync', action: 'offline', isOnline: false, pendingCount: pending
            });
            this._notifyStatusChange();
        });

        // Check for pending items on startup
        setTimeout(() => {
            const pending = this.getPendingCount();
            if (pending > 0) {
                const s = this._getPendingSummary();
                const itemList = s.labels.join('\n  - ');
                let msg = `📤 ${pending} objeto(s) pendiente(s) de sincronizacion`;
                if (s.labels.length > 0) msg += `:\n  - ${itemList}`;
                if (s.hasMore) msg += `\n  ...y ${pending - 5} mas`;
                if (s.failed > 0) msg += `\n⚠️ ${s.failed} con error permanente`;

                this._notify('warning', msg, {
                    source: 'sync', action: 'startup_pending', isOnline: this.isOnline,
                    pendingCount: pending, failedCount: s.failed, pendingItems: s.labels
                });
                if (this.isOnline) {
                    this._processQueue();
                }
            }
        }, 3000);
    }

    // ============================================================
    // PRIVATE: Queue Management
    // ============================================================

    _loadQueue() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            this.pendingQueue = stored ? JSON.parse(stored) : [];
            console.log(`[OfflineSync] Loaded ${this.pendingQueue.length} pending items`);
        } catch (e) {
            console.error('[OfflineSync] Failed to load queue:', e);
            this.pendingQueue = [];
        }
    }

    _saveQueue() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.pendingQueue));
        } catch (e) {
            console.error('[OfflineSync] Failed to save queue:', e);
        }
    }

    _addToQueue(item) {
        this.pendingQueue.push(item);
        this._saveQueue();
        this._notifyStatusChange();
    }

    _removeFromQueue(itemId) {
        this.pendingQueue = this.pendingQueue.filter(item => item.id !== itemId);
        this._saveQueue();
        this._notifyStatusChange();
    }

    _updateItemStatus(itemId, status, attempts = null) {
        const item = this.pendingQueue.find(i => i.id === itemId);
        if (item) {
            item.status = status;
            if (attempts !== null) item.attempts = attempts;
            this._saveQueue();
        }
    }

    // ============================================================
    // PRIVATE: Sync Logic
    // ============================================================

    async _processQueue() {
        if (this.isSyncing || !this.isOnline) return { success: false, synced: 0, failed: 0 };

        this.isSyncing = true;
        this._notifyStatusChange();

        const pendingItems = this.pendingQueue.filter(item =>
            item.status === 'pending' || (item.status === 'failed' && item.attempts < MAX_RETRIES)
        );

        let synced = 0;
        let failed = 0;

        for (const item of pendingItems) {
            if (!this.isOnline) {
                console.log('[OfflineSync] Lost connection during sync');
                break;
            }

            this._updateItemStatus(item.id, 'syncing');
            const result = await this._syncItem(item);

            if (result.success) {
                this._removeFromQueue(item.id);
                synced++;
            } else {
                const newAttempts = item.attempts + 1;
                const newStatus = newAttempts >= MAX_RETRIES ? 'failed' : 'pending';
                this._updateItemStatus(item.id, newStatus, newAttempts);
                failed++;
            }

            // Small delay between requests
            await this._delay(500);
        }

        this.isSyncing = false;
        this._notifyStatusChange();

        // Notify results with details
        const remaining = this.getPendingCount();
        const syncCtx = { source: 'sync', action: 'sync_result', synced, failed, remaining, isOnline: this.isOnline };

        if (synced > 0 && failed === 0) {
            this._notify('success', `✅ ${synced} objeto(s) sincronizado(s) correctamente${remaining > 0 ? `\n📋 ${remaining} aun pendientes` : ''}`, syncCtx);
        } else if (synced > 0 && failed > 0) {
            const failedSummary = this._getPendingSummary();
            this._notify('warning', `✅ ${synced} sincronizado(s), ⚠️ ${failed} con error${failedSummary.labels.length > 0 ? ':\n  - ' + failedSummary.labels.join('\n  - ') : ''}`, { ...syncCtx, failedItems: failedSummary.labels });
        } else if (failed > 0) {
            const failedSummary = this._getPendingSummary();
            this._notify('critical', `⚠️ Error al sincronizar ${failed} objeto(s)${failedSummary.labels.length > 0 ? ':\n  - ' + failedSummary.labels.join('\n  - ') : ''}`, { ...syncCtx, failedItems: failedSummary.labels });
        }

        return { success: true, synced, failed };
    }

    async _syncItem(item) {
        try {
            const token = await auth.getToken();
            const res = await fetch(`${API_BASE}/objects/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(item.data)
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const data = await res.json();
            console.log(`[OfflineSync] Synced item ${item.id}:`, data);
            return { success: true, data };

        } catch (err) {
            console.error(`[OfflineSync] Failed to sync ${item.id}:`, err);
            return { success: false, error: err.message };
        }
    }

    // ============================================================
    // PRIVATE: Notifications
    // ============================================================

    _notify(type, message, context = null) {
        console.log(`[OfflineSync] ${type.toUpperCase()}: ${message}`);

        if (window.kepler && window.kepler.notify) {
            window.kepler.notify.show(message, type, 4000, context);
        }
    }

    /**
     * Build a summary of pending items for richer notifications
     */
    _getPendingSummary() {
        const items = this.pendingQueue.filter(i => i.status !== 'failed');
        const failed = this.pendingQueue.filter(i => i.status === 'failed');
        const labels = items.map(i => {
            const d = i.data || {};
            const name = d.nombre || d.label || d.titulo || 'Sin nombre';
            const type = d.tipo || d.class_name || 'objeto';
            return `${type}: "${name}"`;
        });
        return { total: items.length, failed: failed.length, labels: labels.slice(0, 5), hasMore: labels.length > 5 };
    }

    _notifyStatusChange() {
        if (this.onStatusChange) {
            this.onStatusChange(this.getStatus());
        }
    }

    // ============================================================
    // PRIVATE: Utilities
    // ============================================================

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export singleton instance
export const offlineSync = new OfflineSyncService();
