/**
 * Map Styles
 * StyleSheet for all map components
 */

import { StyleSheet, Platform, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================================
// Map-specific Colors
// ============================================================

export const MAP_COLORS = {
    background: '#0a0f14',
    cardBg: 'rgba(10,15,20,0.9)',
    cardBgSolid: '#0d1218',
    accent: '#00f7ff',
    accentDim: 'rgba(0,247,255,0.3)',
    accentGlow: 'rgba(0,247,255,0.4)',
    textPrimary: '#fff',
    textSecondary: '#446688',
    textMuted: '#666',
    border: 'rgba(0,247,255,0.2)',
    borderActive: 'rgba(0,247,255,0.4)',
    overlay: 'rgba(0,0,0,0.85)',
    divider: 'rgba(255,255,255,0.08)',
    exit: '#ff6b6b',
};

// ============================================================
// Styles
// ============================================================

export const styles = StyleSheet.create({
    // Container
    container: {
        flex: 1,
        backgroundColor: MAP_COLORS.background,
    },
    map: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: MAP_COLORS.background,
    },

    // Loading States
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: MAP_COLORS.background,
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(10,15,20,0.9)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        color: MAP_COLORS.accent,
        fontSize: 14,
    },

    // FAB Button
    fab: {
        position: 'absolute',
        left: 16,
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(10,15,20,0.95)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: MAP_COLORS.borderActive,
        shadowColor: MAP_COLORS.accent,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
        zIndex: 100,
    },
    fabIcon: {
        fontSize: 24,
        color: MAP_COLORS.accent,
    },

    // Menu Overlay
    menuOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000',
        zIndex: 200,
    },

    // Sliding Menu
    menu: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: SCREEN_WIDTH * 0.75,
        maxWidth: 300,
        backgroundColor: MAP_COLORS.cardBgSolid,
        borderRightWidth: 1,
        borderRightColor: MAP_COLORS.border,
        zIndex: 300,
    },
    menuHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,247,255,0.15)',
    },
    menuTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: MAP_COLORS.accent,
        letterSpacing: 1,
    },
    menuCloseIcon: {
        fontSize: 28,
        color: MAP_COLORS.textSecondary,
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
    menuItemExit: {
        marginTop: 8,
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
        color: MAP_COLORS.textPrimary,
    },
    menuItemLabelExit: {
        color: MAP_COLORS.exit,
    },
    menuItemDesc: {
        fontSize: 11,
        color: MAP_COLORS.textSecondary,
        marginTop: 2,
    },
    menuDivider: {
        height: 1,
        backgroundColor: MAP_COLORS.divider,
        marginVertical: 8,
        marginHorizontal: 20,
    },

    // Quick Controls
    quickControls: {
        position: 'absolute',
        right: 16,
        gap: 12,
        zIndex: 50,
    },
    quickBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: MAP_COLORS.cardBg,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: MAP_COLORS.accentDim,
    },
    quickBtnIcon: {
        fontSize: 20,
    },

    // Coords Widget
    coordsWidget: {
        position: 'absolute',
        right: 16,
        backgroundColor: MAP_COLORS.cardBg,
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: MAP_COLORS.border,
        minWidth: 130,
    },
    coordRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    coordLabel: {
        fontSize: 10,
        color: MAP_COLORS.textSecondary,
        fontWeight: '600',
        letterSpacing: 1,
    },
    coordValue: {
        fontSize: 12,
        color: MAP_COLORS.accent,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },

    // Status Badge
    statusBadge: {
        position: 'absolute',
        left: 16,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: MAP_COLORS.cardBg,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: MAP_COLORS.border,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
        backgroundColor: MAP_COLORS.textMuted,
    },
    statusOnline: {
        backgroundColor: MAP_COLORS.accent,
    },
    statusText: {
        fontSize: 10,
        color: MAP_COLORS.accent,
        fontWeight: '600',
        letterSpacing: 1,
    },

    // Modal Overlay
    modalOverlay: {
        flex: 1,
        backgroundColor: MAP_COLORS.overlay,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Search Modal
    searchModal: {
        position: 'absolute',
        left: 16,
        right: 16,
        backgroundColor: MAP_COLORS.cardBgSolid,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: MAP_COLORS.border,
    },
    searchInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        paddingHorizontal: 12,
    },
    searchIcon: {
        fontSize: 18,
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        height: 48,
        color: MAP_COLORS.textPrimary,
        fontSize: 16,
    },
    searchClear: {
        fontSize: 24,
        color: MAP_COLORS.textSecondary,
        paddingHorizontal: 8,
    },
    searchHint: {
        fontSize: 12,
        color: MAP_COLORS.textSecondary,
        textAlign: 'center',
        marginTop: 12,
    },

    // Layer Modal
    layerModal: {
        backgroundColor: MAP_COLORS.cardBgSolid,
        borderRadius: 20,
        padding: 20,
        width: '85%',
        maxWidth: 360,
        borderWidth: 1,
        borderColor: MAP_COLORS.border,
    },
    layerModalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: MAP_COLORS.accent,
        textAlign: 'center',
        marginBottom: 20,
    },
    layerGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 12,
    },
    layerCard: {
        width: '47%',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    layerCardActive: {
        borderColor: MAP_COLORS.accent,
        backgroundColor: 'rgba(0,247,255,0.1)',
    },
    layerIcon: {
        fontSize: 28,
        marginBottom: 8,
    },
    layerName: {
        fontSize: 14,
        fontWeight: '600',
        color: MAP_COLORS.textPrimary,
        marginBottom: 4,
    },
    layerDesc: {
        fontSize: 11,
        color: MAP_COLORS.textSecondary,
        textAlign: 'center',
    },

    // Toast
    toast: {
        position: 'absolute',
        left: 32,
        right: 32,
        backgroundColor: 'rgba(10,15,20,0.95)',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: MAP_COLORS.accentDim,
        alignItems: 'center',
    },
    toastText: {
        color: MAP_COLORS.textPrimary,
        fontSize: 14,
        fontWeight: '500',
    },
});
