/**
 * NotificationToast - Floating toast notification with type-based styling
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ToastState } from '../hooks/useNotifications';

const TYPE_CONFIG = {
    critical: { icon: '🚨', bg: 'rgba(255, 68, 68, 0.95)', border: '#ff4444' },
    warning: { icon: '⚠️', bg: 'rgba(255, 169, 77, 0.95)', border: '#ffa94d' },
    success: { icon: '✅', bg: 'rgba(81, 207, 102, 0.95)', border: '#51cf66' },
    info: { icon: 'ℹ️', bg: 'rgba(63, 168, 255, 0.95)', border: '#3fa8ff' },
};

interface Props {
    toast: ToastState;
    onDismiss: () => void;
}

export function NotificationToast({ toast, onDismiss }: Props) {
    if (!toast.visible || !toast.notification) return null;

    const config = TYPE_CONFIG[toast.notification.type];

    return (
        <TouchableOpacity
            style={[s.container, { top: useSafeAreaInsets().top + 60 }]}
            onPress={onDismiss}
            activeOpacity={0.9}
        >
            <View style={[s.toast, { backgroundColor: config.bg, borderColor: config.border }]}>
                <Text style={s.icon}>{config.icon}</Text>
                <Text style={s.message} numberOfLines={2}>{toast.notification.message}</Text>
                <Text style={s.dismiss}>✕</Text>
            </View>
        </TouchableOpacity>
    );
}

const s = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 16,
        right: 16,
        zIndex: 9999,
    },
    toast: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        gap: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    icon: { fontSize: 20 },
    message: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
    dismiss: { color: 'rgba(255,255,255,0.6)', fontSize: 16 },
});
