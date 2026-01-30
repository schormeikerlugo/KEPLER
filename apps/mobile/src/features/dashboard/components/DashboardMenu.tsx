/**
 * DashboardMenu Component
 * Sliding drawer menu for dashboard navigation
 */

import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    Animated,
    StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { MENU_ITEMS, DashboardMenuItem, DashboardMenuActionId } from '../constants';
import { styles } from '../styles';

interface DashboardMenuProps {
    visible: boolean;
    menuTranslateX: Animated.AnimatedInterpolation<number>;
    overlayOpacity: Animated.AnimatedInterpolation<number>;
    topInset: number;
    currentScreen?: string;
    onClose: () => void;
    onNavigate: (screen: string) => void;
}

export function DashboardMenu({
    visible,
    menuTranslateX,
    overlayOpacity,
    topInset,
    currentScreen = 'Dashboard',
    onClose,
    onNavigate,
}: DashboardMenuProps) {
    const handlePress = (item: DashboardMenuItem) => {
        if (item.type === 'divider') return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        if (item.screen) {
            onNavigate(item.screen);
        }
    };

    return (
        <>
            {/* Overlay */}
            <Animated.View
                style={[styles.menuOverlay, { opacity: overlayOpacity }]}
                pointerEvents={visible ? 'auto' : 'none'}
            >
                <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
            </Animated.View>

            {/* Menu */}
            <Animated.View style={[styles.menu, { transform: [{ translateX: menuTranslateX }] }]}>
                <View style={[styles.menuHeader, { paddingTop: topInset + 16 }]}>
                    <Text style={styles.menuLogo}>K E P L E R</Text>
                    <TouchableOpacity onPress={onClose}>
                        <Text style={styles.menuCloseIcon}>×</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.menuItems} showsVerticalScrollIndicator={false}>
                    {MENU_ITEMS.map((item) => {
                        if (item.type === 'divider') {
                            return <View key={item.id} style={styles.menuDivider} />;
                        }

                        const isActive = item.screen === currentScreen;

                        return (
                            <TouchableOpacity
                                key={item.id}
                                style={[styles.menuItem, isActive && styles.menuItemActive]}
                                onPress={() => handlePress(item)}
                            >
                                <Text style={styles.menuItemIcon}>{item.icon}</Text>
                                <View style={styles.menuItemText}>
                                    <Text style={[
                                        styles.menuItemLabel,
                                        isActive && styles.menuItemLabelActive
                                    ]}>
                                        {item.label}
                                    </Text>
                                    <Text style={styles.menuItemDesc}>{item.desc}</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </Animated.View>
        </>
    );
}
