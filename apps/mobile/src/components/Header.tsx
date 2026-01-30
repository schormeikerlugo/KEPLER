/**
 * KEPLER Mobile - Shared Header Component
 * 
 * Reusable header with animated sliding drawer menu.
 * Used across all screens except Map for consistent navigation.
 * 
 * @module components/Header
 */

import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    ScrollView,
    Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { COLORS, SPACING, RADIUS, FONT_SIZES, LETTER_SPACING, SCREENS } from '../constants/config';
import { useSharedMenu } from '../hooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// =============================================================================
// TYPES
// =============================================================================

interface HeaderProps {
    /** Whether to show the status indicator */
    showStatus?: boolean;
    /** Whether the system is online */
    isOnline?: boolean;
    /** Callback when status is pressed */
    onStatusPress?: () => void;
    /** Current screen name for active state */
    currentScreen?: string;
}

// =============================================================================
// MENU ITEMS CONFIG
// =============================================================================

interface MenuItem {
    id: string;
    icon: string;
    label: string;
    desc: string;
    screen?: string;  // Screen name as string
    type?: 'divider';
}

const MENU_ITEMS: MenuItem[] = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard', desc: 'Panel principal', screen: 'Dashboard' },
    { id: 'map', icon: '🗺️', label: 'Mapa', desc: 'Explorar zona', screen: 'Map' },
    { id: 'divider1', icon: '', label: '', desc: '', type: 'divider' },
    { id: 'archives', icon: '📁', label: 'Archivos', desc: 'Galería de hallazgos', screen: 'Archives' },
    { id: 'profile', icon: '👤', label: 'Perfil', desc: 'Mi cuenta', screen: 'Profile' },
];

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Header - Main navigation header with hamburger menu
 */
export default function Header({
    showStatus = true,
    isOnline = false,
    onStatusPress,
    currentScreen = 'Main',
}: HeaderProps) {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const insets = useSafeAreaInsets();
    const menu = useSharedMenu();

    const handleNavigate = (screen: string) => {
        menu.closeMenu();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        (navigation as any).navigate(screen);
    };

    const handleMenuItemPress = (item: MenuItem) => {
        if (item.type === 'divider' || !item.screen) return;
        handleNavigate(item.screen);
    };

    return (
        <>
            {/* Header Tile */}
            <View style={styles.headerTile}>
                <Text style={styles.logo}>K E P L E R</Text>

                <View style={styles.headerRight}>
                    {/* Status Indicator */}
                    {showStatus && (
                        <TouchableOpacity
                            style={styles.statusIndicator}
                            onPress={onStatusPress}
                        >
                            <View style={[styles.statusDot, !isOnline && styles.statusDotOffline]} />
                            <Text style={styles.statusArrow}>▼</Text>
                        </TouchableOpacity>
                    )}

                    {/* Menu Button */}
                    <TouchableOpacity
                        style={styles.menuButton}
                        onPress={menu.toggleMenu}
                    >
                        <View style={styles.menuLine} />
                        <View style={styles.menuLine} />
                        <View style={styles.menuLine} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Overlay */}
            <Animated.View
                style={[styles.menuOverlay, { opacity: menu.overlayOpacity }]}
                pointerEvents={menu.menuOpen ? 'auto' : 'none'}
            >
                <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    onPress={menu.closeMenu}
                    activeOpacity={1}
                />
            </Animated.View>

            {/* Sliding Menu (from right) */}
            <Animated.View
                style={[
                    styles.menu,
                    { transform: [{ translateX: menu.menuTranslateX }] }
                ]}
            >
                <View style={[styles.menuHeader, { paddingTop: insets.top + 16 }]}>
                    <Text style={styles.menuLogo}>K E P L E R</Text>
                    <TouchableOpacity onPress={menu.closeMenu}>
                        <Text style={styles.menuCloseIcon}>×</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.menuItems} showsVerticalScrollIndicator={false}>
                    {MENU_ITEMS.map((item) => {
                        if (item.type === 'divider') {
                            return <View key={item.id} style={styles.menuDivider} />;
                        }

                        const isActive = item.screen === currentScreen ||
                            (item.screen === 'Main' && currentScreen === 'Dashboard');

                        return (
                            <TouchableOpacity
                                key={item.id}
                                style={[styles.menuItem, isActive && styles.menuItemActive]}
                                onPress={() => handleMenuItemPress(item)}
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

            {/* Toast */}
            {menu.toast.visible && (
                <View style={[styles.toast, { bottom: insets.bottom + 100 }]}>
                    <Text style={styles.toastText}>{menu.toast.message}</Text>
                </View>
            )}
        </>
    );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
    // Header Tile
    headerTile: {
        backgroundColor: COLORS.backgroundSecondary,
        borderRadius: RADIUS.xl,
        paddingHorizontal: SPACING.xl,
        paddingVertical: SPACING.lg,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.lg,
        marginHorizontal: 16,
    },
    logo: {
        fontSize: FONT_SIZES.xxxl,
        fontWeight: '300',
        color: COLORS.textPrimary,
        letterSpacing: LETTER_SPACING.widest,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.md,
    },

    // Status Indicator
    statusIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.backgroundTertiary,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        borderRadius: RADIUS.md,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: COLORS.success,
        marginRight: SPACING.xs,
    },
    statusDotOffline: {
        backgroundColor: COLORS.error,
    },
    statusArrow: {
        color: COLORS.textMuted,
        fontSize: FONT_SIZES.sm,
    },

    // Menu Button
    menuButton: {
        backgroundColor: COLORS.cyan,
        padding: SPACING.md,
        borderRadius: RADIUS.md,
        gap: SPACING.xs,
    },
    menuLine: {
        width: 18,
        height: 2,
        backgroundColor: COLORS.background,
        borderRadius: 1,
    },

    // Menu Overlay
    menuOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000',
        zIndex: 200,
    },

    // Sliding Menu (from right)
    menu: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: SCREEN_WIDTH * 0.75,
        maxWidth: 300,
        backgroundColor: 'rgba(13, 18, 24, 0.98)',
        borderLeftWidth: 1,
        borderLeftColor: 'rgba(63, 168, 255, 0.2)',
        zIndex: 300,
    },
    menuHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(63, 168, 255, 0.15)',
    },
    menuLogo: {
        fontSize: 14,
        fontWeight: '300',
        color: COLORS.cyan,
        letterSpacing: 6,
    },
    menuCloseIcon: {
        fontSize: 28,
        color: COLORS.textMuted,
    },
    menuItems: {
        flex: 1,
        paddingVertical: 8,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 20,
    },
    menuItemActive: {
        backgroundColor: 'rgba(63, 168, 255, 0.1)',
    },
    menuItemIcon: {
        fontSize: 22,
        marginRight: 14,
    },
    menuItemText: {
        flex: 1,
    },
    menuItemLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
    menuItemLabelActive: {
        color: COLORS.cyan,
    },
    menuItemDesc: {
        fontSize: 11,
        color: COLORS.textMuted,
        marginTop: 2,
    },
    menuDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginVertical: 8,
        marginHorizontal: 20,
    },

    // Toast
    toast: {
        position: 'absolute',
        left: 32,
        right: 32,
        backgroundColor: 'rgba(18, 18, 18, 0.95)',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(63, 168, 255, 0.3)',
        alignItems: 'center',
        zIndex: 400,
    },
    toastText: {
        color: COLORS.textPrimary,
        fontSize: 14,
        fontWeight: '500',
    },
});
