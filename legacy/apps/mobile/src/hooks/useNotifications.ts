/**
 * useNotifications Hook
 * In-app notification system with types, auto-dismiss, haptics, and persistence
 */

import { useState, useCallback, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type NotificationType = 'critical' | 'warning' | 'success' | 'info';

export interface AppNotification {
    id: string;
    type: NotificationType;
    message: string;
    timestamp: number;
    read: boolean;
}

const DISMISS_TIMES: Record<NotificationType, number> = {
    critical: 0,       // persistent
    warning: 7000,
    success: 4000,
    info: 5000,
};

const HAPTIC_MAP: Record<NotificationType, Haptics.NotificationFeedbackType> = {
    critical: Haptics.NotificationFeedbackType.Error,
    warning: Haptics.NotificationFeedbackType.Warning,
    success: Haptics.NotificationFeedbackType.Success,
    info: Haptics.NotificationFeedbackType.Success,
};

const STORAGE_KEY = 'kepler_notifications';

export interface ToastState {
    visible: boolean;
    notification: AppNotification | null;
}

export function useNotifications() {
    const [history, setHistory] = useState<AppNotification[]>([]);
    const [toast, setToast] = useState<ToastState>({ visible: false, notification: null });
    const [unreadCount, setUnreadCount] = useState(0);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Load history from storage
    const loadHistory = useCallback(async () => {
        try {
            const raw = await AsyncStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed: AppNotification[] = JSON.parse(raw);
                setHistory(parsed);
                setUnreadCount(parsed.filter(n => !n.read).length);
            }
        } catch { /* ignore */ }
    }, []);

    // Save to storage
    const persistHistory = useCallback(async (items: AppNotification[]) => {
        try {
            // Keep last 100
            const trimmed = items.slice(0, 100);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
        } catch { /* ignore */ }
    }, []);

    // Push new notification
    const notify = useCallback((type: NotificationType, message: string) => {
        const notification: AppNotification = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type,
            message,
            timestamp: Date.now(),
            read: false,
        };

        // Haptic feedback
        Haptics.notificationAsync(HAPTIC_MAP[type]).catch(() => {});

        // Add to history
        setHistory(prev => {
            const updated = [notification, ...prev];
            persistHistory(updated);
            return updated;
        });
        setUnreadCount(prev => prev + 1);

        // Show toast
        if (timerRef.current) clearTimeout(timerRef.current);
        setToast({ visible: true, notification });

        // Auto-dismiss (except critical)
        const dismissTime = DISMISS_TIMES[type];
        if (dismissTime > 0) {
            timerRef.current = setTimeout(() => {
                setToast({ visible: false, notification: null });
            }, dismissTime);
        }
    }, [persistHistory]);

    // Dismiss toast
    const dismissToast = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setToast({ visible: false, notification: null });
    }, []);

    // Mark all as read
    const markAllRead = useCallback(() => {
        setHistory(prev => {
            const updated = prev.map(n => ({ ...n, read: true }));
            persistHistory(updated);
            return updated;
        });
        setUnreadCount(0);
    }, [persistHistory]);

    // Clear all
    const clearAll = useCallback(async () => {
        setHistory([]);
        setUnreadCount(0);
        await AsyncStorage.removeItem(STORAGE_KEY);
    }, []);

    return {
        history,
        toast,
        unreadCount,
        notify,
        dismissToast,
        markAllRead,
        clearAll,
        loadHistory,
    };
}
