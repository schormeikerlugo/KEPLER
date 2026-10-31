/**
 * CaptureCounter — small HUD pill with queue stats.
 *   "✓ N · ⏳ M · ✕ K"
 *
 * Stays visible at all times so the user knows captures are flowing
 * even when the rest of the HUD auto-hides.
 *
 * Tap on the ERR section to retry failed items.
 */

import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';

import type { QueueSummary } from '../../../services/captures';
import { COLORS, FONT_SIZES, LETTER_SPACING } from '../../../constants/config';

interface CaptureCounterProps {
    summary: QueueSummary;
    onRetryFailed?: () => void;
}

export function CaptureCounter({ summary, onRetryFailed }: CaptureCounterProps) {
    const processing = summary.pending + summary.processing;
    const reIds = summary.lastBatch?.reIds ?? 0;

    return (
        <View style={styles.wrap}>
            <View style={styles.row}>
                <Text style={[styles.value, styles.ok]}>{summary.done}</Text>
                <Text style={styles.label}>OK</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
                <Text style={[styles.value, styles.pending]}>{processing}</Text>
                <Text style={styles.label}>COLA</Text>
            </View>
            {summary.failed > 0 && (
                <>
                    <View style={styles.divider} />
                    <TouchableOpacity
                        style={styles.row}
                        onPress={() => {
                            if (onRetryFailed) {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                                onRetryFailed();
                            }
                        }}
                        activeOpacity={onRetryFailed ? 0.6 : 1}
                    >
                        <Text style={[styles.value, styles.fail]}>{summary.failed}</Text>
                        <Text style={styles.label}>{onRetryFailed ? '↻ ERR' : 'ERR'}</Text>
                    </TouchableOpacity>
                </>
            )}
            {reIds > 0 && (
                <>
                    <View style={styles.divider} />
                    <View style={styles.row}>
                        <Text style={[styles.value, styles.reid]}>{reIds}</Text>
                        <Text style={styles.label}>RE-ID</Text>
                    </View>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        borderRadius: 14,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        gap: 8,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 4,
    },
    value: {
        fontSize: FONT_SIZES.lg,
        fontWeight: '700',
    },
    label: {
        fontSize: FONT_SIZES.xs,
        color: COLORS.textMuted,
        letterSpacing: LETTER_SPACING.wide,
    },
    divider: {
        width: 1,
        height: 14,
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    ok: { color: COLORS.success },
    pending: { color: COLORS.cyan },
    fail: { color: COLORS.error },
    reid: { color: COLORS.warning },
});
