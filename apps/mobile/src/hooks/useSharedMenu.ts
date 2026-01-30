/**
 * useSharedMenu Hook
 * Shared menu state and animations for use across all screens
 */

import { useState, useRef, useCallback } from 'react';
import { Animated, Dimensions } from 'react-native';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface ToastState {
    message: string;
    visible: boolean;
}

export interface UseSharedMenuReturn {
    // Menu state
    menuOpen: boolean;
    toggleMenu: () => void;
    closeMenu: () => void;

    // Animations
    menuAnim: Animated.Value;
    menuTranslateX: Animated.AnimatedInterpolation<number>;
    overlayOpacity: Animated.AnimatedInterpolation<number>;

    // Toast
    toast: ToastState;
    showToast: (message: string) => void;
}

export function useSharedMenu(): UseSharedMenuReturn {
    const [menuOpen, setMenuOpen] = useState(false);
    const [toast, setToast] = useState<ToastState>({ message: '', visible: false });

    // Animation values
    const menuAnim = useRef(new Animated.Value(0)).current;

    // Menu slides from RIGHT side
    const menuTranslateX = menuAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [SCREEN_WIDTH * 0.75, 0],
    });

    const overlayOpacity = menuAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.7],
    });

    const toggleMenu = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const toValue = menuOpen ? 0 : 1;

        Animated.spring(menuAnim, {
            toValue,
            useNativeDriver: true,
            friction: 8,
            tension: 40,
        }).start();

        setMenuOpen(!menuOpen);
    }, [menuOpen, menuAnim]);

    const closeMenu = useCallback(() => {
        if (!menuOpen) return;

        Animated.spring(menuAnim, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8
        }).start();

        setMenuOpen(false);
    }, [menuOpen, menuAnim]);

    const showToast = useCallback((message: string) => {
        setToast({ message, visible: true });
        setTimeout(() => setToast({ message: '', visible: false }), 2500);
    }, []);

    return {
        menuOpen,
        toggleMenu,
        closeMenu,
        menuAnim,
        menuTranslateX,
        overlayOpacity,
        toast,
        showToast,
    };
}
