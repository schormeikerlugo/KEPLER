/**
 * MapMenu Component
 * Sliding drawer menu for map tools
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
import { MENU_ITEMS, MenuItem, MenuActionId } from '../constants';
import { styles } from '../styles';

interface MapMenuProps {
    visible: boolean;
    menuTranslateX: Animated.AnimatedInterpolation<number>;
    overlayOpacity: Animated.AnimatedInterpolation<number>;
    topInset: number;
    onClose: () => void;
    onAction: (actionId: MenuActionId) => void;
}

export function MapMenu({
    visible,
    menuTranslateX,
    overlayOpacity,
    topInset,
    onClose,
    onAction,
}: MapMenuProps) {
    const handleAction = (item: MenuItem) => {
        if (item.type === 'divider') return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onAction(item.id as MenuActionId);
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
                    <Text style={styles.menuTitle}>🛠️ HERRAMIENTAS</Text>
                    <TouchableOpacity onPress={onClose}>
                        <Text style={styles.menuCloseIcon}>×</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.menuItems} showsVerticalScrollIndicator={false}>
                    {MENU_ITEMS.map((item) => {
                        if (item.type === 'divider') {
                            return <View key={item.id} style={styles.menuDivider} />;
                        }
                        return (
                            <TouchableOpacity
                                key={item.id}
                                style={[styles.menuItem, item.isExit && styles.menuItemExit]}
                                onPress={() => handleAction(item)}
                            >
                                <Text style={styles.menuItemIcon}>{item.icon}</Text>
                                <View style={styles.menuItemText}>
                                    <Text style={[
                                        styles.menuItemLabel,
                                        item.isExit && styles.menuItemLabelExit
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
