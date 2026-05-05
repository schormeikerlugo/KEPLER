/**
 * CaptureButton — Quick Capture (⊕) one-tap button.
 *
 * Big circular button at the bottom-center. Triggers a single capture into
 * the queue. Provides haptic feedback and a brief "flash" animation.
 */

import React, { useCallback, useRef } from 'react';
import {
    Animated,
    Easing,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { COLORS } from '../../../constants/config';

interface CaptureButtonProps {
    onPress: () => void;
    disabled?: boolean;
}

export function CaptureButton({ onPress, disabled }: CaptureButtonProps) {
    const scale = useRef(new Animated.Value(1)).current;
    const flash = useRef(new Animated.Value(0)).current;

    const handlePress = useCallback(() => {
        if (disabled) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

        // Press feedback: scale down then back, plus a quick white flash
        Animated.sequence([
            Animated.timing(scale, {
                toValue: 0.85,
                duration: 80,
                useNativeDriver: true,
            }),
            Animated.timing(scale, {
                toValue: 1,
                duration: 120,
                easing: Easing.out(Easing.back(2)),
                useNativeDriver: true,
            }),
        ]).start();

        Animated.sequence([
            Animated.timing(flash, {
                toValue: 1,
                duration: 60,
                useNativeDriver: true,
            }),
            Animated.timing(flash, {
                toValue: 0,
                duration: 220,
                useNativeDriver: true,
            }),
        ]).start();

        onPress();
    }, [disabled, onPress, scale, flash]);

    return (
        <View style={styles.container}>
            <Animated.View
                pointerEvents="none"
                style={[styles.flashOverlay, { opacity: flash }]}
            />
            <Animated.View style={{ transform: [{ scale }] }}>
                <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={handlePress}
                    disabled={disabled}
                    style={[styles.button, disabled && styles.buttonDisabled]}
                >
                    <View style={styles.inner}>
                        <Text style={styles.icon}>⊕</Text>
                    </View>
                </TouchableOpacity>
            </Animated.View>
        </View>
    );
}

const SIZE = 80;
const INNER = SIZE - 12;

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    button: {
        width: SIZE,
        height: SIZE,
        borderRadius: SIZE / 2,
        borderWidth: 3,
        borderColor: COLORS.cyan,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: COLORS.cyan,
        shadowOpacity: 0.7,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 0 },
        elevation: 12,
    },
    buttonDisabled: {
        opacity: 0.4,
        borderColor: COLORS.textMuted,
    },
    inner: {
        width: INNER,
        height: INNER,
        borderRadius: INNER / 2,
        backgroundColor: COLORS.cyanDim,
        alignItems: 'center',
        justifyContent: 'center',
    },
    icon: {
        color: COLORS.textPrimary,
        fontSize: 38,
        fontWeight: '300',
        lineHeight: 42,
    },
    flashOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#fff',
        zIndex: -1,
    },
});
