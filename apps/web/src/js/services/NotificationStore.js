/**
 * NotificationStore - Persistent notification storage with Supabase sync
 * Stores notifications in Supabase per-user for cross-device sync
 * Falls back to localStorage when offline or not authenticated
 */

import { supabase, auth } from '../auth.js';

const STORAGE_KEY = 'kepler_notification_history';
const MAX_HISTORY_DAYS = 30;

export class NotificationStore {
    constructor() {
        this.history = [];
        this.isOnline = false;
        this.userId = null;
        this.initialized = false;

        // Initialize async
        this.init();
    }

    async init() {
        // Load from localStorage first (fast)
        this.history = this.loadLocal();

        // Try to sync with Supabase
        await this.syncWithSupabase();
        this.initialized = true;
    }

    /**
     * Load from localStorage (fallback/cache)
     */
    loadLocal() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.warn('Failed to load notification history:', e);
            return [];
        }
    }

    /**
     * Save to localStorage (cache)
     */
    saveLocal() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.history));
        } catch (e) {
            console.warn('Failed to save notification history:', e);
        }
    }

    /**
     * Sync with Supabase if authenticated
     */
    async syncWithSupabase() {
        try {
            const user = await auth.getUser();
            if (!user) {
                this.isOnline = false;
                return;
            }

            this.userId = user.id;
            this.isOnline = true;

            // Fetch from Supabase (last 30 days)
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - MAX_HISTORY_DAYS);

            const { data, error } = await supabase
                .from('user_notifications')
                .select('*')
                .gte('created_at', cutoffDate.toISOString())
                .order('created_at', { ascending: false });

            if (error) {
                console.warn('Supabase sync failed:', error);
                return;
            }

            // Merge with local (Supabase is source of truth)
            this.history = (data || []).map(n => ({
                id: n.id,
                message: n.message,
                type: n.type,
                timestamp: n.created_at,
                date: n.created_at.split('T')[0],
                read: n.read
            }));

            // Update local cache
            this.saveLocal();

        } catch (e) {
            console.warn('Supabase sync error:', e);
            this.isOnline = false;
        }
    }

    /**
     * Add a notification
     * @param {string} message 
     * @param {string} type - 'critical' | 'warning' | 'success' | 'info'
     * @returns {string} notification ID
     */
    async add(message, type) {
        const timestamp = new Date().toISOString();
        const localId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const notification = {
            id: localId,
            message,
            type,
            timestamp,
            date: timestamp.split('T')[0],
            read: false
        };

        // Add to local immediately
        this.history.unshift(notification);
        this.saveLocal();

        // Sync to Supabase if online
        if (this.isOnline && this.userId) {
            try {
                const { data, error } = await supabase
                    .from('user_notifications')
                    .insert({
                        user_id: this.userId,
                        message: message,
                        type: type
                    })
                    .select()
                    .single();

                if (!error && data) {
                    // Update local with real ID
                    notification.id = data.id;
                    this.saveLocal();
                }
            } catch (e) {
                console.warn('Failed to sync notification to Supabase:', e);
            }
        }

        return notification.id;
    }

    /**
     * Delete a single notification by ID
     * @param {string} id 
     */
    async deleteById(id) {
        this.history = this.history.filter(n => n.id !== id);
        this.saveLocal();

        // Sync to Supabase
        if (this.isOnline) {
            try {
                await supabase
                    .from('user_notifications')
                    .delete()
                    .eq('id', id);
            } catch (e) {
                console.warn('Failed to delete from Supabase:', e);
            }
        }
    }

    /**
     * Delete all notifications for a specific date
     * @param {string} date - YYYY-MM-DD format
     */
    async deleteByDate(date) {
        const toDelete = this.history.filter(n => n.date === date).map(n => n.id);
        this.history = this.history.filter(n => n.date !== date);
        this.saveLocal();

        // Sync to Supabase
        if (this.isOnline && toDelete.length > 0) {
            try {
                await supabase
                    .from('user_notifications')
                    .delete()
                    .in('id', toDelete);
            } catch (e) {
                console.warn('Failed to batch delete from Supabase:', e);
            }
        }
    }

    /**
     * Clear all history
     */
    async clearAll() {
        this.history = [];
        this.saveLocal();

        // Clear from Supabase
        if (this.isOnline && this.userId) {
            try {
                await supabase
                    .from('user_notifications')
                    .delete()
                    .eq('user_id', this.userId);
            } catch (e) {
                console.warn('Failed to clear Supabase notifications:', e);
            }
        }
    }

    /**
     * Get all notifications
     */
    getAll() {
        return this.history;
    }

    /**
     * Get notifications grouped by date
     * @returns {Object} { 'YYYY-MM-DD': [notifications], ... }
     */
    getGroupedByDate() {
        const grouped = {};

        for (const notif of this.history) {
            if (!grouped[notif.date]) {
                grouped[notif.date] = [];
            }
            grouped[notif.date].push(notif);
        }

        return grouped;
    }

    /**
     * Get sorted date keys (most recent first)
     */
    getSortedDates() {
        const grouped = this.getGroupedByDate();
        return Object.keys(grouped).sort((a, b) => b.localeCompare(a));
    }

    /**
     * Get count of notifications
     */
    count() {
        return this.history.length;
    }

    /**
     * Get count of notifications for today
     */
    countToday() {
        const today = new Date().toISOString().split('T')[0];
        return this.history.filter(n => n.date === today).length;
    }

    /**
     * Force refresh from Supabase
     */
    async refresh() {
        await this.syncWithSupabase();
    }
}

// Singleton instance
export const notificationStore = new NotificationStore();
