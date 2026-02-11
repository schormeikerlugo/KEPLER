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
    Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { COLORS, SPACING, RADIUS, FONT_SIZES, LETTER_SPACING, SCREENS } from '../constants/config';
import { useSharedMenu, useUserProfile } from '../hooks';
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
    screen?: string;
    badge?: number;
    action?: () => void;
}

const MENU_ITEMS: MenuItem[] = [
    { id: 'mission', icon: '🚀', label: 'Iniciar Misión', screen: 'ARCamera' }, // Updated to ARCamera
    { id: 'archives', icon: '📦', label: 'Archivos', screen: 'Archives' },
    { id: 'taxonomy', icon: '🏷️', label: 'Taxonomía', screen: 'Taxonomy' }, // Placeholders
    { id: 'notifications', icon: '🔔', label: 'Notificaciones', screen: 'Notifications', badge: 3 },
    { id: 'map', icon: '🗺️', label: 'Mapa', screen: 'Map' },
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
    const { profile } = useUserProfile();

    const handleNavigate = (screen: string) => {
        menu.closeMenu();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        // @ts-ignore - Dynamic navigation
        if (screen === 'Notifications' || screen === 'Taxonomy') {
            menu.showToast('Funcionalidad disponible próximamente');
        } else {
            (navigation as any).navigate(screen);
        }
    };

    const handleLogout = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        menu.showToast('Sesión cerrada correctamente');
        // Logic to clear session would go here
        setTimeout(() => menu.closeMenu(), 1000);
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
                {/* Menu Header: Title + Close Config */}
                <View style={[styles.menuHeader, { paddingTop: insets.top + 20 }]}>
                    <Text style={styles.menuTitle}>MENÚ</Text>
                    <TouchableOpacity onPress={menu.closeMenu} style={styles.closeButton}>
                        <Text style={styles.closeButtonText}>×</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.menuContent} showsVerticalScrollIndicator={false}>

                    {/* Profile Section */}
                    <TouchableOpacity
                        style={styles.profileSection}
                        onPress={() => handleNavigate('Profile')}
                    >
                        <View style={styles.avatarContainer}>
                            {profile?.avatar_url ? (
                                profile.is_emoji ? (
                                    <Text style={{ fontSize: 24 }}>
                                        {profile.avatar_url.replace('emoji:', '')}
                                    </Text>
                                ) : (
                                    <Image
                                        source={{ uri: profile.avatar_url }}
                                        style={{ width: '100%', height: '100%' }}
                                        resizeMode="cover"
                                    />
                                )
                            ) : (
                                <Text style={styles.avatarText}>
                                    {profile?.username ? profile.username.charAt(0).toUpperCase() : 'S'}
                                </Text>
                            )}
                        </View>
                        <View style={styles.profileInfo}>
                            <Text style={styles.profileName}>
                                {profile?.username || 'schormeikerl'}
                            </Text>
                            <Text style={styles.profileEmail}>
                                {profile?.email || 'schormeikerl@gmail.com'}
                            </Text>
                        </View>
                    </TouchableOpacity>

                    <View style={styles.divider} />

                    {/* Menu Items (Cards) */}
                    <View style={styles.cardsContainer}>
                        {MENU_ITEMS.map((item) => (
                            <TouchableOpacity
                                key={item.id}
                                style={styles.menuCard}
                                onPress={() => item.screen && handleNavigate(item.screen)}
                            >
                                <View style={styles.cardContent}>
                                    <Text style={styles.cardIcon}>{item.icon}</Text>
                                    <Text style={styles.cardLabel}>{item.label}</Text>
                                </View>
                                {item.badge && (
                                    <View style={styles.badge}>
                                        <Text style={styles.badgeText}>{item.badge}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>

                {/* Logout Button (Footer) */}
                <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
                    <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                        <Text style={styles.logoutIcon}>🚪</Text>
                        <Text style={styles.logoutText}>Cerrar Sesión</Text>
                    </TouchableOpacity>
                </View>
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
    // Header Tile (Unchanged logic, minor tweaks)
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

    // Sliding Menu Panel
    menu: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: SCREEN_WIDTH * 0.85, // Slightly wider for card layout
        maxWidth: 340,
        backgroundColor: '#060B10', // Darker blue/black background from screenshot
        borderLeftWidth: 1,
        borderLeftColor: 'rgba(63, 168, 255, 0.2)',
        zIndex: 300,
        display: 'flex',
    },
    menuHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    menuTitle: {
        fontSize: 16,
        fontWeight: '400',
        color: COLORS.cyan,
        letterSpacing: 4,
    },
    closeButton: {
        padding: 5,
        backgroundColor: 'rgba(255, 68, 68, 0.15)',
        borderRadius: 8,
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 68, 68, 0.3)',
    },
    closeButtonText: {
        fontSize: 20,
        color: '#ff4444',
        lineHeight: 22,
    },

    // Scroll Content
    menuContent: {
        flex: 1,
    },

    // Profile Section
    profileSection: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 24,
        gap: 16,
    },
    avatarContainer: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#1E2329',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
    },
    avatarText: {
        fontSize: 24,
        color: '#fff',
        fontWeight: 'bold',
    },
    profileInfo: {
        flex: 1,
    },
    profileName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 2,
    },
    profileEmail: {
        fontSize: 12,
        color: '#888',
    },

    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        marginHorizontal: 0,
    },

    // Menu Cards
    cardsContainer: {
        padding: 24,
        gap: 12,
    },
    menuCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(19, 26, 35, 0.6)', // Card bg
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(63, 168, 255, 0.15)', // Subtle blue border
    },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    cardIcon: {
        fontSize: 20,
    },
    cardLabel: {
        fontSize: 15,
        color: '#d1d5db', // Light gray text
        fontWeight: '400',
    },
    badge: {
        backgroundColor: '#ff4444',
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 2,
        minWidth: 20,
        alignItems: 'center',
    },
    badgeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: 'bold',
    },

    // Footer Logout
    footer: {
        paddingHorizontal: 24,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 68, 68, 0.08)',
        paddingVertical: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 68, 68, 0.2)',
        gap: 10,
    },
    logoutIcon: {
        fontSize: 18,
    },
    logoutText: {
        color: '#ff8888',
        fontSize: 15,
        fontWeight: '500',
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
