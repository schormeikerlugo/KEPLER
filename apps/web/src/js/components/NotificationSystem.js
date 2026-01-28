/**
 * KEPLER Notification System
 * Handles holographic HUD alerts, audio feedback, and persistent history.
 */
import { notificationStore } from '../services/NotificationStore.js';
import { modalSystem } from './ModalSystem.js';

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

        // 2. Create Log Panel (Bitácora)
        this.logPanel = document.createElement('div');
        this.logPanel.id = 'notification-log-panel';
        this.logPanel.innerHTML = `
            <div class="log-header">
                <span class="log-title">📜 BITÁCORA DEL SISTEMA</span>
                <div class="log-actions">
                    <button class="log-clear-all" title="Borrar todo">🗑️</button>
                    <button class="log-close">×</button>
                </div>
            </div>
            <div class="log-filters" id="log-filters">
                <button class="filter-tab active" data-filter="all">
                    📋 Todos <span class="filter-count" id="count-all">0</span>
                </button>
                <button class="filter-tab critical" data-filter="critical">
                    ⚠️ Crítico <span class="filter-count" id="count-critical">0</span>
                </button>
                <button class="filter-tab warning" data-filter="warning">
                    ⚡ Alerta <span class="filter-count" id="count-warning">0</span>
                </button>
                <button class="filter-tab success" data-filter="success">
                    ✅ Éxito <span class="filter-count" id="count-success">0</span>
                </button>
                <button class="filter-tab info" data-filter="info">
                    ℹ️ Info <span class="filter-count" id="count-info">0</span>
                </button>
            </div>
            <div class="log-content" id="log-content"></div>
        `;
        document.body.appendChild(this.logPanel);

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

        // Bind Filter Tabs
        this.logPanel.querySelectorAll('.filter-tab').forEach(tab => {
            tab.onclick = () => this.setFilter(tab.dataset.filter);
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
    show(message, type = 'info', duration = 5000) {
        // Save to persistent store
        const id = notificationStore.add(message, type);

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
            </div>
        `;

        // Click to dismiss
        notification.onclick = () => this.dismiss(notification);

        this.container.appendChild(notification);
        this.playSound(type);

        // GLITCH EFFECT (Critical)
        if (type === 'critical') {
            document.body.classList.add('system-failure-glitch');
            setTimeout(() => {
                document.body.classList.remove('system-failure-glitch');
            }, 600);
        }

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

        // Update active tab styling
        this.logPanel.querySelectorAll('.filter-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.filter === filter) {
                tab.classList.add('active');
            }
        });

        this.updateLogUI();
    }

    toggleLog(forceState = null) {
        const isOpen = this.logPanel.classList.contains('open');
        const newState = forceState !== null ? forceState : !isOpen;

        if (newState) {
            this.logPanel.classList.add('open');
            this.updateBadgeToZero();
        } else {
            this.logPanel.classList.remove('open');
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

        Object.keys(counts).forEach(type => {
            const countEl = this.logPanel.querySelector(`#count-${type}`);
            if (countEl) countEl.textContent = counts[type];
        });

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

    // Shortcuts
    critical(msg) { this.show(msg, 'critical', 0); } // Persistent
    warning(msg) { this.show(msg, 'warning', 7000); }
    success(msg) { this.show(msg, 'success', 4000); }
    info(msg) { this.show(msg, 'info', 5000); }
}
