/**
 * Archives Styles
 */
import { StyleSheet, Dimensions } from 'react-native';
import { COLORS, SPACING, RADIUS, FONT_SIZES } from '../../constants/config';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: SPACING.lg,
    },

    // Filters
    filterContainer: {
        flexDirection: 'row',
        gap: SPACING.sm,
        marginBottom: SPACING.lg,
    },
    filterPill: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.backgroundSecondary,
    },
    filterPillActive: {
        borderColor: COLORS.cyan,
        backgroundColor: 'rgba(63, 168, 255, 0.1)',
    },
    filterText: {
        fontSize: FONT_SIZES.sm,
        color: COLORS.textMuted,
        fontWeight: '600',
    },
    filterTextActive: {
        color: COLORS.cyan,
    },

    // Mission List
    sectionTitle: {
        fontSize: FONT_SIZES.sm,
        color: COLORS.textSecondary,
        letterSpacing: 2,
        marginBottom: SPACING.md,
        textTransform: 'uppercase',
    },

    // Mission Card
    card: {
        backgroundColor: COLORS.backgroundSecondary,
        borderRadius: RADIUS.lg,
        padding: SPACING.lg,
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: SPACING.sm,
    },
    missionCode: {
        fontSize: FONT_SIZES.lg,
        color: COLORS.textPrimary,
        fontWeight: '500',
        letterSpacing: 1,
    },
    statusBadge: {
        paddingVertical: 2,
        paddingHorizontal: 6,
        borderRadius: 4,
        backgroundColor: 'rgba(0, 255, 136, 0.1)',
    },
    statusText: {
        fontSize: 8,
        color: COLORS.success,
        fontWeight: 'bold',
    },
    cardMeta: {
        marginTop: SPACING.sm,
        gap: 4,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    metaText: {
        fontSize: FONT_SIZES.sm,
        color: COLORS.textMuted,
    },
    metaIcon: {
        fontSize: FONT_SIZES.sm,
    },

    // Detail View
    detailHeader: {
        marginBottom: SPACING.xl,
    },
    detailTitle: {
        fontSize: FONT_SIZES.xl,
        color: COLORS.textPrimary,
        fontWeight: '600',
        letterSpacing: 1,
        marginBottom: SPACING.md,
    },
    actionRow: {
        flexDirection: 'row',
        gap: SPACING.md,
        marginBottom: SPACING.lg,
    },
    actionButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: RADIUS.md,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.cyan,
    },
    actionButtonText: {
        color: COLORS.cyan,
        fontSize: FONT_SIZES.sm,
        fontWeight: '600',
    },
    deleteButton: {
        borderColor: COLORS.error,
    },
    deleteButtonText: {
        color: COLORS.error,
    },

    // Empty State
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        color: COLORS.textMuted,
        fontSize: FONT_SIZES.md,
        textAlign: 'center',
    },
});
