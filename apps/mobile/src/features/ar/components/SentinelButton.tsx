/**
 * SentinelButton — Toggle for the auto-burst capture mode.
 *
 *   • Idle:  small icon button.
 *   • Active: red pulsing glow + countdown of seconds remaining.
 *
 * The active state is derived from `secondsRemaining > 0`. The parent
 * runs the countdown (in `useARCamera`) and passes the value down.
 */

import React, { useEffect, useRef } from 'react';
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

interface SentinelButtonProps {
    active: boolean;
    secondsRemaining: number;
    onPress: () => void;
    disabled?: boolean;
}

export function SentinelButton({
    active,
    secondsRemaining,
    onPress,
    disabled,
}: SentinelButtonProps) {
    const pulse = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!active) {
            pulse.stopAnimation();
            pulse.setValue(0);
            return;
        }
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, {
                    toValue: 1,
                    duration: 700,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(pulse, {
                    toValue: 0,
                    duration: 700,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [active, pulse]);

    const handlePress = () => {
        if (disabled) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
        onPress();
    };

    const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
    const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

    return (
        <View style={styles.container}>
            {active && (
                <Animated.View
                    pointerEvents="none"
                    style={[
                        styles.pulseRing,
                        { transform: [{ scale: ringScale }], opacity: ringOpacity },
                    ]}
                />
            )}
            <TouchableOpacity
                activeOpacity={0.85}
                onPress={handlePress}
                disabled={disabled}
                style={[
                    styles.button,
                    active && styles.buttonActive,
                    disabled && styles.buttonDisabled,
                ]}
            >
                <Text style={styles.icon}>🛡</Text>
            </TouchableOpacity>
            {active && secondsRemaining > 0 && (
                <View style={styles.countdownPill}>
                    <Text style={styles.countdownText}>{secondsRemaining}s</Text>
                </View>
            )}
        </View>
    );
}

const SIZE = 52;

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    button: {
        width: SIZE,
        height: SIZE,
        borderRadius: SIZE / 2,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.2)',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonActive: {
        borderColor: COLORS.error,
        backgroundColor: 'rgba(255, 68, 68, 0.18)',
    },
    buttonDisabled: { opacity: 0.4 },
    icon: {
        fontSize: 22,
    },
    pulseRing: {
        position: 'absolute',
        width: SIZE,
        height: SIZE,
        borderRadius: SIZE / 2,
        borderWidth: 2,
        borderColor: COLORS.error,
    },
    countdownPill: {
        position: 'absolute',
        bottom: -22,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        borderRadius: 8,
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderWidth: 1,
        borderColor: COLORS.error,
    },
    countdownText: {
        color: COLORS.error,
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1,
    },
});
