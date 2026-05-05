/**
 * StatusBadge — Tiny pill that shows the YOLO engine connection state.
 *
 * Reads the `EngineStatus` from `useYoloDetection` and translates it to
 * a colored dot + label.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { EngineStatus } from '../../../services/ai';
import { COLORS, FONT_SIZES, LETTER_SPACING } from '../../../constants/config';

interface StatusBadgeProps {
    status: EngineStatus;
    /** Optional sub-text, e.g. URL or error detail. */
    info?: string;
}

const STATUS_TEXT: Record<EngineStatus, string> = {
    idle: 'INACTIVO',
    connecting: 'CONECTANDO',
    ready: 'IA ACTIVA',
    error: 'ERROR',
    closed: 'DESCONECTADO',
};

const STATUS_COLOR: Record<EngineStatus, string> = {
    idle: COLORS.textMuted,
    connecting: COLORS.warning,
    ready: COLORS.success,
    error: COLORS.error,
    closed: COLORS.textMuted,
};

export function StatusBadge({ status, info }: StatusBadgeProps) {
    const color = STATUS_COLOR[status];
    return (
        <View style={styles.wrap}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={[styles.text, { color }]}>{STATUS_TEXT[status]}</Text>
            {info ? <Text style={styles.info}>{info}</Text> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 14,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        gap: 6,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    text: {
        fontSize: FONT_SIZES.sm,
        letterSpacing: LETTER_SPACING.wide,
        fontWeight: '600',
    },
    info: {
        color: COLORS.textMuted,
        fontSize: FONT_SIZES.xs,
        marginLeft: 4,
    },
});
