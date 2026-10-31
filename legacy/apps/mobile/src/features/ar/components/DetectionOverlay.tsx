/**
 * DetectionOverlay
 * ----------------
 * Renders YOLO bounding boxes on top of the camera view with smooth
 * animated transitions between detections.
 *
 * Animation strategy
 * ------------------
 * React Native's *native driver* only animates `transform` and `opacity`.
 * It does NOT animate `width` / `height` / `left` / `top`. So:
 *
 *   • Position (left/top) is animated via `transform.translateX/Y` on the
 *     native driver — silky 60fps off the JS thread.
 *
 *   • Size (width/height) is animated via the JS driver. RN routes those
 *     properties correctly that way; the JS thread cost is negligible
 *     because we already memoize the boxes.
 *
 * That hybrid is why a previous attempt with `useNativeDriver: true` on
 * `width`/`height` produced these warnings and froze sizes:
 *
 *     ERROR  Style property 'height' is not supported by native animated module
 *     ERROR  Style property 'width' is not supported by native animated module
 */

import React, { memo, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';

import type { ScaledPrediction } from '../../../services/ai';
import { COLORS, FONT_SIZES, LETTER_SPACING } from '../../../constants/config';

interface DetectionOverlayProps {
    predictions: ScaledPrediction[];
    /** Source frame size returned by the engine. */
    frameSize: { width: number; height: number };
    /** On-screen size of the camera view. */
    viewSize: { width: number; height: number };
    /** Highlight the central target with a brighter color. */
    targetTrackId?: number | null;
    /** Hide labels with score below this threshold. */
    minScore?: number;
}

interface BoxLayout {
    key: string;
    left: number;
    top: number;
    width: number;
    height: number;
    label: string;
    score: number;
    isTarget: boolean;
}

const TWEEN_MS = 220;

function DetectionOverlayBase({
    predictions,
    frameSize,
    viewSize,
    targetTrackId,
    minScore = 0.25,
}: DetectionOverlayProps) {
    const boxes = useMemo<BoxLayout[]>(() => {
        if (
            !frameSize.width ||
            !frameSize.height ||
            !viewSize.width ||
            !viewSize.height
        ) {
            return [];
        }

        // Mirror "cover" behavior of expo-camera:
        //   scale = max(viewW/frameW, viewH/frameH)
        //   excess gets cropped equally on both sides
        const scale = Math.max(
            viewSize.width / frameSize.width,
            viewSize.height / frameSize.height
        );
        const renderedW = frameSize.width * scale;
        const renderedH = frameSize.height * scale;
        const offsetX = (viewSize.width - renderedW) / 2;
        const offsetY = (viewSize.height - renderedH) / 2;

        return predictions
            .filter((p) => p.score >= minScore)
            .map((p, i) => {
                const [x, y, w, h] = p.bbox;
                const key =
                    p.track_id != null
                        ? `t${p.track_id}`
                        : `${p.class}_${i}`;
                return {
                    key,
                    left: x * scale + offsetX,
                    top: y * scale + offsetY,
                    width: Math.max(w * scale, 4),
                    height: Math.max(h * scale, 4),
                    label: p.class,
                    score: p.score,
                    isTarget: targetTrackId != null && p.track_id === targetTrackId,
                };
            });
    }, [predictions, frameSize, viewSize, targetTrackId, minScore]);

    if (boxes.length === 0) return null;

    return (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {boxes.map((b) => (
                <AnimatedBoundingBox
                    key={b.key}
                    left={b.left}
                    top={b.top}
                    width={b.width}
                    height={b.height}
                    label={b.label}
                    score={b.score}
                    isTarget={b.isTarget}
                />
            ))}
        </View>
    );
}

export const DetectionOverlay = memo(DetectionOverlayBase);

// =============================================================================
// AnimatedBoundingBox
// =============================================================================

interface BoundingBoxProps {
    left: number;
    top: number;
    width: number;
    height: number;
    label: string;
    score: number;
    isTarget: boolean;
}

function AnimatedBoundingBoxBase({
    left,
    top,
    width,
    height,
    label,
    score,
    isTarget,
}: BoundingBoxProps) {
    // Position: native driver (transforms only)
    const tx = useRef(new Animated.Value(left)).current;
    const ty = useRef(new Animated.Value(top)).current;
    // Size: JS driver (RN doesn't support width/height on native driver)
    const w = useRef(new Animated.Value(width)).current;
    const h = useRef(new Animated.Value(height)).current;
    // Fade-in once
    const opacity = useRef(new Animated.Value(0)).current;

    // Animate on prop changes
    useEffect(() => {
        Animated.parallel([
            Animated.timing(tx, {
                toValue: left,
                duration: TWEEN_MS,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }),
            Animated.timing(ty, {
                toValue: top,
                duration: TWEEN_MS,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }),
            Animated.timing(w, {
                toValue: width,
                duration: TWEEN_MS,
                easing: Easing.out(Easing.quad),
                // width can NOT use native driver
                useNativeDriver: false,
            }),
            Animated.timing(h, {
                toValue: height,
                duration: TWEEN_MS,
                easing: Easing.out(Easing.quad),
                useNativeDriver: false,
            }),
        ]).start();
    }, [left, top, width, height, tx, ty, w, h]);

    useEffect(() => {
        Animated.timing(opacity, {
            toValue: 1,
            duration: 160,
            useNativeDriver: true,
        }).start();
    }, [opacity]);

    return (
        <Animated.View
            style={[
                styles.box,
                isTarget && styles.boxTarget,
                {
                    transform: [{ translateX: tx }, { translateY: ty }],
                    width: w,
                    height: h,
                    opacity,
                },
            ]}
        >
            <View style={[styles.labelWrap, isTarget && styles.labelWrapTarget]}>
                <Text style={styles.labelText} numberOfLines={1}>
                    {label.toUpperCase()} · {Math.round(score * 100)}%
                </Text>
            </View>
        </Animated.View>
    );
}

// Custom comparator: skip rerender if all fields are within tiny tolerance.
const AnimatedBoundingBox = memo(AnimatedBoundingBoxBase, (prev, next) => {
    return (
        Math.abs(prev.left - next.left) < 0.5 &&
        Math.abs(prev.top - next.top) < 0.5 &&
        Math.abs(prev.width - next.width) < 0.5 &&
        Math.abs(prev.height - next.height) < 0.5 &&
        prev.label === next.label &&
        prev.isTarget === next.isTarget &&
        Math.abs(prev.score - next.score) < 0.01
    );
});

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
    box: {
        position: 'absolute',
        top: 0,
        left: 0,
        borderWidth: 1.5,
        borderColor: COLORS.cyan,
        backgroundColor: 'transparent',
        // Glow on iOS (shadow*) and Android (elevation).
        shadowColor: COLORS.cyan,
        shadowOpacity: 0.6,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 0 },
    },
    boxTarget: {
        borderColor: COLORS.success,
        borderWidth: 2,
        shadowColor: COLORS.success,
        shadowOpacity: 0.9,
    },
    labelWrap: {
        position: 'absolute',
        top: -22,
        left: -1,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        borderColor: COLORS.cyan,
        borderWidth: 1,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        maxWidth: 160,
    },
    labelWrapTarget: {
        borderColor: COLORS.success,
        backgroundColor: 'rgba(0, 30, 15, 0.9)',
    },
    labelText: {
        color: '#fff',
        fontSize: FONT_SIZES.sm,
        letterSpacing: LETTER_SPACING.wide,
        fontWeight: '600',
    },
});
