/**
 * useDashboardMenu Hook
 * Handles sliding menu state, animations, and toast notifications
 */

import { useState, useRef, useCallback } from 'react';
import { Animated, Dimensions } from 'react-native';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface ToastState {
    message: string;
    visible: boolean;
}

export interface UseDashboardMenuReturn {
    // Menu state
    menuOpen: boolean;
    toggleMenu: () => void;
    closeMenu: () => void;

    // Animations
    menuAnim: Animated.Value;
    fabRotation: Animated.Value;
    menuTranslateX: Animated.AnimatedInterpolation<number>;
    overlayOpacity: Animated.AnimatedInterpolation<number>;
    fabRotate: Animated.AnimatedInterpolation<string>;

    // Toast
    toast: ToastState;
    showToast: (message: string) => void;
}

export function useDashboardMenu(): UseDashboardMenuReturn {
    const [menuOpen, setMenuOpen] = useState(false);
    const [toast, setToast] = useState<ToastState>({ message: '', visible: false });

    // Animation values
    const menuAnim = useRef(new Animated.Value(0)).current;
    const fabRotation = useRef(new Animated.Value(0)).current;

    // Interpolations - Menu slides from RIGHT side
    const menuTranslateX = menuAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [SCREEN_WIDTH * 0.75, 0],  // Slide in from right
    });

    const overlayOpacity = menuAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.7],
    });

    const fabRotate = fabRotation.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '90deg'],
    });

    const toggleMenu = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const toValue = menuOpen ? 0 : 1;

        Animated.parallel([
            Animated.spring(menuAnim, {
                toValue,
                useNativeDriver: true,
                friction: 8,
                tension: 40,
            }),
            Animated.timing(fabRotation, {
                toValue,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start();

        setMenuOpen(!menuOpen);
    }, [menuOpen, menuAnim, fabRotation]);

    const closeMenu = useCallback(() => {
        if (!menuOpen) return;

        Animated.parallel([
            Animated.spring(menuAnim, {
                toValue: 0,
                useNativeDriver: true,
                friction: 8
            }),
            Animated.timing(fabRotation, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true
            }),
        ]).start();

        setMenuOpen(false);
    }, [menuOpen, menuAnim, fabRotation]);

    const showToast = useCallback((message: string) => {
        setToast({ message, visible: true });
        setTimeout(() => setToast({ message: '', visible: false }), 2500);
    }, []);

    return {
        menuOpen,
        toggleMenu,
        closeMenu,
        menuAnim,
        fabRotation,
        menuTranslateX,
        overlayOpacity,
        fabRotate,
        toast,
        showToast,
    };
}
