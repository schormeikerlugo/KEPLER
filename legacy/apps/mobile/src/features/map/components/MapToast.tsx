/**
 * MapToast Component
 * Toast notification for map actions
 */

import React from 'react';
import { View, Text } from 'react-native';
import { styles } from '../styles';

interface MapToastProps {
    bottomInset: number;
    message: string;
    visible: boolean;
}

export function MapToast({
    bottomInset,
    message,
    visible,
}: MapToastProps) {
    if (!visible) return null;

    return (
        <View style={[styles.toast, { bottom: bottomInset + 100 }]}>
            <Text style={styles.toastText}>{message}</Text>
        </View>
    );
}
