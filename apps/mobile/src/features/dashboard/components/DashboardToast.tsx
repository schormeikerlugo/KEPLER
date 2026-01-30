/**
 * DashboardToast Component
 * Toast notification for dashboard actions
 */

import React from 'react';
import { View, Text } from 'react-native';
import { styles } from '../styles';

interface DashboardToastProps {
    bottomInset: number;
    message: string;
    visible: boolean;
}

export function DashboardToast({
    bottomInset,
    message,
    visible,
}: DashboardToastProps) {
    if (!visible) return null;

    return (
        <View style={[styles.toast, { bottom: bottomInset + 100 }]}>
            <Text style={styles.toastText}>{message}</Text>
        </View>
    );
}
