/**
 * KEPLER Notification System
 * Handles holographic HUD alerts, audio feedback, and persistent history.
 */
import { notificationStore } from '../services/NotificationStore.js';
import { modalSystem } from './ModalSystem.js';
import { deepDiveModal } from './DeepDiveModal.js';

export class NotificationSystem {
    constructor() {
        this.container = null;
        this.logPanel = null;
        this.sounds = {};
        this.currentFilter = 'all'; // Filter state: 'all', 'critical', 'warning', 'success', 'info'

        this.init();
    }

    init() {
        // 1. Create Toast Container
        this.container = document.createElement('div');
        this.container.id = 'notification-container';
        document.body.appendChild(this.container);

        // 2. Create Log Overlay (backdrop) + Panel (Bitácora)
        this.logOverlay = document.createElement('div');
        this.logOverlay.id = 'notification-log-overlay';
        this.logOverlay.onclick = (e) => {
            if (e.target === this.logOverlay) this.toggleLog(false);
        };

        this.logPanel = document.createElement('div');
        this.logPanel.id = 'notification-log-panel';
        this.logPanel.innerHTML = `
            <div class="log-header">
                <span class="log-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    Bitácora de Sistema
                </span>
                <div class="log-actions">
                    <button class="log-clear-all" title="Borrar todo">Limpiar</button>
                    <button class="log-close">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </div>
            <div class="log-summary" id="log-summary"></div>
            <div class="log-filters">
                <div class="select-wrapper">
                    <select id="log-filter-select" class="log-filter-select">
                        <option value="all">📋 Todas las Notificaciones (0)</option>
                        <option value="critical">🚨 Alertas Críticas (0)</option>
                        <option value="warning">⚠️ Advertencias (0)</option>
                        <option value="success">✅ Éxitos (0)</option>
                        <option value="info">ℹ️ Información (0)</option>
                    </select>
                    <svg class="select-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
                </div>
            </div>
            <div class="log-content" id="log-content"></div>
        `;

        this.logOverlay.appendChild(this.logPanel);
        document.body.appendChild(this.logOverlay);

        // Bind Close
        this.logPanel.querySelector('.log-close').onclick = () => this.toggleLog(false);

        // Bind Clear All
        this.logPanel.querySelector('.log-clear-all').onclick = async () => {
            try {
                const confirmed = await modalSystem.confirm('¿Borrar toda la bitácora del sistema?', 'DELETE');
                if (confirmed) {
                    notificationStore.clearAll();
                    this.updateLogUI();
                }
            } catch (e) {
                console.error('Modal error:', e);
            }
        };

        // Bind Select Filter
        const filterSelect = this.logPanel.querySelector('#log-filter-select');
        if (filterSelect) {
            filterSelect.addEventListener('change', (e) => this.setFilter(e.target.value));
        }

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.logOverlay.classList.contains('open')) {
                this.toggleLog(false);
            }
        });

        // 3. Preload Sounds
        const audioPath = '/assets/song/notifications/';
        this.sounds = {
            critical: new Audio(`${audioPath}critical.wav`),
            warning: new Audio(`${audioPath}warning.mp3`),
            success: new Audio(`${audioPath}success.wav`),
            info: new Audio(`${audioPath}success.wav`) // Fallback
        };

        // Adjust volumes
        this.sounds.critical.volume = 0.8;
        this.sounds.warning.volume = 0.6;
        this.sounds.success.volume = 0.5;
        this.sounds.info.volume = 0.3;

        // Initial render of history
        this.updateLogUI();
    }

    /**
     * Show a notification
     * @param {string} message - Content
     * @param {string} type - 'critical' | 'warning' | 'success' | 'info'
     * @param {number} duration - ms (0 for persistent)
     */
    show(message, type = 'info', duration = 5000, context = null) {
        // Save to persistent store (with optional context for AI deep-dive)
        const id = notificationStore.add(message, type, context);

        // Create toast element
        const notification = document.createElement('div');
        notification.className = `holo-notification ${type}`;
        notification.dataset.id = id;
        notification.innerHTML = `
            <div class="holo-notification-content">
                <div class="holo-notification-title">
                    ${this.getIcon(type)} ${type.toUpperCase()}
                </div>
                <div class="holo-notification-message">${message.replace(/\n/g, '<br>')}</div>
                <div class="holo-notification-hint">Click para analizar</div>
            </div>
        `;

        // Click to dismiss + open AI deep-dive
        notification.onclick = () => {
            this.dismiss(notification);
            const notifData = notificationStore.getAll().find(n => n.id === id);
            if (notifData) deepDiveModal.show(notifData);
        };

        this.container.appendChild(notification);
        this.playSound(type);

        // Update log UI
        this.updateLogUI();
        this.updateBadge();

        // Auto Dismiss
        if (duration > 0 && type !== 'critical') {
            setTimeout(() => {
                if (notification.isConnected) this.dismiss(notification);
            }, duration);
        }

        return id;
    }

    setFilter(filter) {
        this.currentFilter = filter;

        const select = this.logPanel.querySelector('#log-filter-select');
        if (select && select.value !== filter) {
            select.value = filter;
        }

        this.updateLogUI();
    }

    toggleLog(forceState = null) {
        const isOpen = this.logOverlay.classList.contains('open');
        const newState = forceState !== null ? forceState : !isOpen;

        if (newState) {
            this.logOverlay.classList.add('open');
            this.updateLogUI();
            this.updateBadgeToZero();
        } else {
            this.logOverlay.classList.remove('open');
        }
    }

    updateLogUI() {
        const content = this.logPanel.querySelector('#log-content');
        if (!content) return;

        const sortedDates = notificationStore.getSortedDates();
        const grouped = notificationStore.getGroupedByDate();
        const allNotifications = notificationStore.getAll();

        // Update filter counts
        const counts = { all: 0, critical: 0, warning: 0, success: 0, info: 0 };
        allNotifications.forEach(n => {
            counts.all++;
            if (counts[n.type] !== undefined) counts[n.type]++;
        });

        // Update summary bar
        const summary = this.logPanel.querySelector('#log-summary');
        if (summary) {
            summary.innerHTML = `
                <button class="summary-chip ${this.currentFilter === 'all' ? 'active' : ''}" data-filter="all">
                    <span class="chip-count">${counts.all}</span> Total
                </button>
                <button class="summary-chip critical ${this.currentFilter === 'critical' ? 'active' : ''}" data-filter="critical">
                    <span class="chip-dot critical"></span><span class="chip-count">${counts.critical}</span>
                </button>
                <button class="summary-chip warning ${this.currentFilter === 'warning' ? 'active' : ''}" data-filter="warning">
                    <span class="chip-dot warning"></span><span class="chip-count">${counts.warning}</span>
                </button>
                <button class="summary-chip success ${this.currentFilter === 'success' ? 'active' : ''}" data-filter="success">
                    <span class="chip-dot success"></span><span class="chip-count">${counts.success}</span>
                </button>
                <button class="summary-chip info ${this.currentFilter === 'info' ? 'active' : ''}" data-filter="info">
                    <span class="chip-dot info"></span><span class="chip-count">${counts.info}</span>
                </button>
            `;
            summary.querySelectorAll('.summary-chip').forEach(chip => {
                chip.onclick = () => this.setFilter(chip.dataset.filter);
            });
        }

        const labels = {
            all: '📋 Todas las Notificaciones',
            critical: '🚨 Alertas Críticas',
            warning: '⚠️ Advertencias',
            success: '✅ Éxitos',
            info: 'ℹ️ Información'
        };

        const select = this.logPanel.querySelector('#log-filter-select');
        if (select) {
            Array.from(select.options).forEach(opt => {
                const type = opt.value;
                if (labels[type]) {
                    opt.text = `${labels[type]} (${counts[type] || 0})`;
                }
            });
        }

        // Check if empty after filters
        let hasVisibleItems = false;

        if (sortedDates.length === 0) {
            content.innerHTML = '<div class="empty-log">Sin registros recientes</div>';
            return;
        }

        // Build timeline HTML with filter applied
        let html = '';
        for (const date of sortedDates) {
            const dateLabel = this.formatDateLabel(date);
            let notifications = grouped[date];

            // Apply filter
            if (this.currentFilter !== 'all') {
                notifications = notifications.filter(n => n.type === this.currentFilter);
            }

            // Skip empty groups
            if (notifications.length === 0) continue;
            hasVisibleItems = true;

            html += `
                <div class="log-date-group">
                    <div class="log-date-header">
                        <span class="log-date-label">📅 ${dateLabel}</span>
                        <button class="log-date-delete" data-date="${date}" title="Borrar día">🗑️</button>
                    </div>
                    <div class="log-date-items">
            `;

            for (const item of notifications) {
                const time = new Date(item.timestamp).toLocaleTimeString();
                html += `
                    <div class="log-item ${item.type}">
                        <span class="log-icon">${this.getIcon(item.type)}</span>
                        <div class="log-item-content">
                            <div class="log-item-message">${item.message.replace(/\n/g, '<br>')}</div>
                            <span class="log-time">${time}</span>
                        </div>
                        <button class="log-item-delete" data-id="${item.id}" title="Borrar">×</button>
                    </div>
                `;
            }

            html += `
                    </div>
                </div>
            `;
        }

        if (!hasVisibleItems) {
            html = `<div class="empty-log">Sin registros de tipo "${this.currentFilter}"</div>`;
        }

        content.innerHTML = html;

        // Bind delete handlers
        content.querySelectorAll('.log-date-delete').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const date = btn.dataset.date;
                try {
                    const confirmed = await modalSystem.confirm(
                        `¿Borrar todos los registros del ${this.formatDateLabel(date)}?`,
                        'DELETE'
                    );
                    if (confirmed) {
                        notificationStore.deleteByDate(date);
                        this.updateLogUI();
                    }
                } catch (err) {
                    console.error('Delete date modal error:', err);
                }
            };
        });

        content.querySelectorAll('.log-item-delete').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                try {
                    const confirmed = await modalSystem.confirm('¿Eliminar esta notificación?', 'DELETE');
                    if (confirmed) {
                        notificationStore.deleteById(btn.dataset.id);
                        this.updateLogUI();
                    }
                } catch (err) {
                    console.error('Delete item modal error:', err);
                }
            };
        });

        // Deep-dive: click on log item opens AI analysis
        content.querySelectorAll('.log-item').forEach(item => {
            item.onclick = (e) => {
                if (e.target.closest('.log-item-delete')) return;
                const id = item.querySelector('.log-item-delete')?.dataset.id;
                if (!id) return;
                const notifData = notificationStore.getAll().find(n => n.id === id);
                if (notifData) deepDiveModal.show(notifData);
            };
        });
    }

    formatDateLabel(dateStr) {
        const date = new Date(dateStr + 'T00:00:00');
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        if (dateStr === today.toISOString().split('T')[0]) {
            return 'Hoy';
        } else if (dateStr === yesterday.toISOString().split('T')[0]) {
            return 'Ayer';
        } else {
            return date.toLocaleDateString('es-ES', {
                weekday: 'long',
                day: 'numeric',
                month: 'short'
            });
        }
    }

    updateBadge() {
        const badge = document.getElementById('notification-badge');
        if (badge) {
            const count = notificationStore.countToday();
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    }

    updateBadgeToZero() {
        const badge = document.getElementById('notification-badge');
        if (badge) {
            badge.style.display = 'none';
        }
    }

    dismiss(element) {
        element.classList.add('hiding');
        element.addEventListener('animationend', () => {
            if (element.isConnected) element.remove();
        });
    }

    playSound(type) {
        const sound = this.sounds[type] || this.sounds.info;
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(e => console.warn("Audio blocked:", e));
        }
    }

    getIcon(type) {
        switch (type) {
            case 'critical': return '🚨';
            case 'warning': return '⚠️';
            case 'success': return '✅';
            case 'info': return 'ℹ️';
            default: return '🔹';
        }
    }

    // Shortcuts (optional context for AI deep-dive)
    critical(msg, ctx) { this.show(msg, 'critical', 0, ctx); }
    warning(msg, ctx) { this.show(msg, 'warning', 7000, ctx); }
    success(msg, ctx) { this.show(msg, 'success', 4000, ctx); }
    info(msg, ctx) { this.show(msg, 'info', 5000, ctx); }
}
