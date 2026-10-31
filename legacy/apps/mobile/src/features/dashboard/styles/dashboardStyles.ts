/**
 * Dashboard Styles
 * StyleSheet for all dashboard components
 */

import { StyleSheet, Dimensions } from 'react-native';
import { colors } from '../../../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================================
// Dashboard-specific Colors
// ============================================================

export const DASHBOARD_COLORS = {
    background: '#000',
    cardBg: '#121212',
    cardBgLight: '#1a1a1a',
    accent: colors.cyan,
    accentGlow: 'rgba(63, 168, 255, 0.4)',
    textPrimary: '#fff',
    textSecondary: '#888',
    textMuted: '#666',
    border: 'rgba(255,255,255,0.1)',
    divider: '#222',
    online: '#00ff88',
    offline: '#ff4444',
    overlay: 'rgba(0,0,0,0.7)',
    menuBg: 'rgba(13, 18, 24, 0.98)',
};

// ============================================================
// Styles
// ============================================================

export const styles = StyleSheet.create({
    // Container
    container: {
        flex: 1,
        backgroundColor: DASHBOARD_COLORS.background,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingTop: 8,
    },

    // Header Tile
    headerTile: {
        backgroundColor: DASHBOARD_COLORS.cardBg,
        borderRadius: 16,
        paddingHorizontal: 20,
        paddingVertical: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    logo: {
        fontSize: 20,
        fontWeight: '300',
        color: DASHBOARD_COLORS.textPrimary,
        letterSpacing: 8,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },

    // Status Indicator
    statusIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1e1e1e',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: DASHBOARD_COLORS.online,
        marginRight: 6,
    },
    statusDotOffline: {
        backgroundColor: DASHBOARD_COLORS.offline,
    },
    statusArrow: {
        color: DASHBOARD_COLORS.textMuted,
        fontSize: 10,
    },

    // Menu Button (Header)
    menuButton: {
        backgroundColor: DASHBOARD_COLORS.accent,
        padding: 12,
        borderRadius: 8,
        gap: 4,
    },
    menuLine: {
        width: 18,
        height: 2,
        backgroundColor: '#000',
        borderRadius: 1,
    },

    // FAB Menu Button (Sliding)
    fab: {
        position: 'absolute',
        left: 16,
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: DASHBOARD_COLORS.accent,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: DASHBOARD_COLORS.accent,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 8,
        zIndex: 100,
    },
    fabIcon: {
        fontSize: 24,
        color: '#000',
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
        right: 0,  // Position on right side
        top: 0,
        bottom: 0,
        width: SCREEN_WIDTH * 0.75,
        maxWidth: 300,
        backgroundColor: DASHBOARD_COLORS.menuBg,
        borderLeftWidth: 1,  // Left border since menu is on right
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
        color: DASHBOARD_COLORS.accent,
        letterSpacing: 6,
    },
    menuCloseIcon: {
        fontSize: 28,
        color: DASHBOARD_COLORS.textSecondary,
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
        color: DASHBOARD_COLORS.textPrimary,
    },
    menuItemLabelActive: {
        color: DASHBOARD_COLORS.accent,
    },
    menuItemDesc: {
        fontSize: 11,
        color: DASHBOARD_COLORS.textSecondary,
        marginTop: 2,
    },
    menuDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginVertical: 8,
        marginHorizontal: 20,
    },

    // Quick Controls
    quickControls: {
        position: 'absolute',
        right: 16,
        flexDirection: 'row',
        gap: 10,
        zIndex: 50,
    },
    quickBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(18, 18, 18, 0.95)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(63, 168, 255, 0.3)',
    },
    quickBtnIcon: {
        fontSize: 20,
    },

    // Telemetry
    telemetryContainer: {
        backgroundColor: DASHBOARD_COLORS.cardBg,
        borderRadius: 16,
        padding: 12,
        marginBottom: 16,
        overflow: 'hidden',
    },
    scanLine: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 2,
        backgroundColor: DASHBOARD_COLORS.accent,
        zIndex: 10,
        shadowColor: DASHBOARD_COLORS.accent,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 6,
        elevation: 10,
    },
    telemetryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 8,
    },
    telemetryCard: {
        flex: 1,
        backgroundColor: DASHBOARD_COLORS.cardBgLight,
        borderRadius: 12,
        paddingVertical: 16,
        paddingHorizontal: 8,
        alignItems: 'center',
    },
    telemetryValue: {
        fontSize: 18,
        fontWeight: '600',
        color: DASHBOARD_COLORS.textPrimary,
        marginBottom: 4,
    },
    telemetryLabel: {
        fontSize: 8,
        color: DASHBOARD_COLORS.textMuted,
        letterSpacing: 1,
    },

    // Section Cards
    sectionCard: {
        backgroundColor: DASHBOARD_COLORS.cardBg,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '500',
        color: DASHBOARD_COLORS.textPrimary,
    },
    countBadge: {
        backgroundColor: DASHBOARD_COLORS.cardBgLight,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: DASHBOARD_COLORS.accent,
    },
    countText: {
        fontSize: 14,
        color: DASHBOARD_COLORS.accent,
        fontWeight: '600',
    },
    missionCount: {
        fontSize: 24,
        fontWeight: '600',
        color: DASHBOARD_COLORS.accent,
    },
    sectionDivider: {
        height: 1,
        backgroundColor: DASHBOARD_COLORS.divider,
        marginVertical: 12,
    },
    noDataText: {
        color: DASHBOARD_COLORS.textMuted,
        fontSize: 14,
    },
    missionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: DASHBOARD_COLORS.cardBgLight,
        padding: 14,
        borderRadius: 12,
        marginTop: 8,
        gap: 10,
    },
    missionIcon: {
        fontSize: 20,
    },
    missionCode: {
        fontSize: 13,
        color: DASHBOARD_COLORS.textPrimary,
        fontWeight: '500',
    },
    missionDate: {
        fontSize: 10,
        color: DASHBOARD_COLORS.textMuted,
        marginTop: 2,
    },

    // Status Badge
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    statusBadgeText: {
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 0.5,
    },

    // View All Button
    viewAllButton: {
        marginTop: 12,
        paddingVertical: 10,
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: DASHBOARD_COLORS.divider,
    },
    viewAllText: {
        fontSize: 12,
        fontWeight: '600',
        color: DASHBOARD_COLORS.accent,
        letterSpacing: 1,
    },

    // Chat FAB (Bottom Right)
    chatFab: {
        position: 'absolute',
        bottom: 30,
        right: 20,
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: DASHBOARD_COLORS.accent,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: DASHBOARD_COLORS.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 8,
    },
    chatFabIcon: {
        fontSize: 24,
    },

    // Status Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: DASHBOARD_COLORS.overlay,
        justifyContent: 'flex-start',
        alignItems: 'flex-end',
        paddingTop: 100,
        paddingRight: 16,
    },
    statusModal: {
        backgroundColor: DASHBOARD_COLORS.menuBg,
        borderRadius: 16,
        padding: 16,
        minWidth: 220,
        borderWidth: 1,
        borderColor: 'rgba(63, 168, 255, 0.2)',
    },
    statusModalTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: DASHBOARD_COLORS.accent,
        letterSpacing: 2,
        marginBottom: 8,
    },
    statusRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
    },
    statusLabel: {
        fontSize: 14,
        color: DASHBOARD_COLORS.textPrimary,
    },
    statusIndicatorDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: DASHBOARD_COLORS.offline,
    },
    statusIndicatorOnline: {
        backgroundColor: DASHBOARD_COLORS.online,
    },
    statusNote: {
        fontSize: 12,
        color: DASHBOARD_COLORS.textSecondary,
        textAlign: 'center',
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
    },
    toastText: {
        color: DASHBOARD_COLORS.textPrimary,
        fontSize: 14,
        fontWeight: '500',
    },
});
