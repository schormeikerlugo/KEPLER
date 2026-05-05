/**
 * ARCameraScreen — Real-time YOLO detection + Quick Capture + Sentinel.
 *
 * This is the wiring layer:
 *   • <CameraView> from expo-camera (full-screen, back camera)
 *   • <DetectionOverlay> draws bboxes on top
 *   • Top bar: close button, mission badge, engine status
 *   • Bottom bar: AI toggle · Quick Capture (⊕) · Sentinel toggle
 *
 * All business logic lives in `useARCamera`. This component only renders
 * state and dispatches user intents.
 */

import React, { useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    LayoutChangeEvent,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useARCamera } from '../features/ar/hooks';
import {
    DetectionOverlay,
    CaptureButton,
    SentinelButton,
    StatusBadge,
    CaptureCounter,
} from '../features/ar/components';

interface Props {
    navigation: any;
    route: { params?: { missionId?: string } };
}

export default function ARCameraScreen({ navigation, route }: Props) {
    const insets = useSafeAreaInsets();
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);
    const [viewSize, setViewSize] = useState({ width: 0, height: 0 });

    const missionId = route.params?.missionId ?? null;

    const ar = useARCamera({
        cameraRef,
        missionId,
        enabled: permission?.granted === true,
    });

    const onCameraLayout = (e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        setViewSize({ width, height });
    };

    // ─── Permission gates ──────────────────────────────────────
    if (!permission) {
        return (
            <View style={styles.permissionContainer}>
                <Text style={styles.permissionText}>Inicializando cámara...</Text>
            </View>
        );
    }

    if (!permission.granted) {
        return (
            <View style={styles.permissionContainer}>
                <Text style={styles.permissionIcon}>📷</Text>
                <Text style={styles.permissionTitle}>ACCESO A CÁMARA</Text>
                <Text style={styles.permissionText}>
                    KEPLER necesita acceso a la cámara para detección en AR.
                </Text>
                <TouchableOpacity
                    style={styles.permissionButton}
                    onPress={requestPermission}
                >
                    <Text style={styles.permissionButtonText}>PERMITIR</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
                    <Text style={styles.permissionLink}>Cancelar</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ─── Render ────────────────────────────────────────────────
    return (
        <View style={styles.container}>
            <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="back"
                onLayout={onCameraLayout}
            >
                {/* Bounding boxes from YOLO */}
                <DetectionOverlay
                    predictions={ar.predictions}
                    frameSize={ar.frameSize}
                    viewSize={viewSize}
                    targetTrackId={ar.target?.track_id ?? null}
                />

                {/* Corner brackets (decorative) */}
                <View style={[styles.corner, styles.cornerTopLeft]} />
                <View style={[styles.corner, styles.cornerTopRight]} />
                <View style={[styles.corner, styles.cornerBottomLeft]} />
                <View style={[styles.corner, styles.cornerBottomRight]} />

                {/* ─── Top bar ─── */}
                <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
                    <TouchableOpacity
                        onPress={() => navigation.goBack()}
                        style={styles.closeButton}
                    >
                        <Text style={styles.closeButtonText}>✕</Text>
                    </TouchableOpacity>

                    <View style={styles.titleBlock}>
                        <Text style={styles.title}>MODO AR</Text>
                        {missionId ? (
                            <Text style={styles.subtitle}>
                                MISIÓN · {missionId.slice(0, 8).toUpperCase()}
                            </Text>
                        ) : (
                            <Text style={styles.subtitle}>SIN MISIÓN ACTIVA</Text>
                        )}
                    </View>

                    <StatusBadge
                        status={ar.engineStatus}
                        info={ar.autoPaused ? 'BAT BAJA' : undefined}
                    />
                </View>

                {/* ─── Counter (always visible, just below top bar) ─── */}
                <View style={[styles.counterRow, { top: insets.top + 76 }]}>
                    <CaptureCounter
                        summary={ar.queueSummary}
                        onRetryFailed={ar.retryFailed}
                    />
                </View>

                {/* ─── Bottom controls ─── */}
                <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 24 }]}>
                    {/* Left: AI toggle */}
                    <TouchableOpacity
                        style={[
                            styles.smallButton,
                            ar.aiOn && !ar.autoPaused && styles.smallButtonActive,
                        ]}
                        onPress={() => ar.setAiOn(!ar.aiOn)}
                    >
                        <Text style={styles.smallButtonIcon}>🤖</Text>
                        <Text style={styles.smallButtonLabel}>IA</Text>
                    </TouchableOpacity>

                    {/* Center: Quick Capture */}
                    <CaptureButton
                        onPress={ar.quickCapture}
                        disabled={ar.autoPaused}
                    />

                    {/* Right: Sentinel */}
                    <SentinelButton
                        active={ar.sentinelActive}
                        secondsRemaining={ar.sentinelSecondsLeft}
                        onPress={ar.toggleSentinel}
                        disabled={ar.autoPaused || ar.engineStatus !== 'ready'}
                    />
                </View>

                {/* ─── Diagnostics strip (small, only when AI on) ─── */}
                {ar.aiOn && !ar.autoPaused && (
                    <View
                        style={[
                            styles.diagStrip,
                            { bottom: insets.bottom + 130 },
                        ]}
                    >
                        <Text style={styles.diagText}>
                            FPS · {ar.frameCount} frames
                            {ar.droppedCount > 0 ? ` · ${ar.droppedCount} drops` : ''}
                            {' · '}DET {ar.predictions.length}
                            {ar.target ? ` · LOCK ${Math.round(ar.target.score * 100)}%` : ''}
                        </Text>
                    </View>
                )}

                {/* ─── Empty hint: YOLO is running but sees nothing ─── */}
                {ar.aiOn &&
                    !ar.autoPaused &&
                    ar.engineStatus === 'ready' &&
                    ar.predictions.length === 0 &&
                    ar.frameCount > 10 && (
                        <View
                            style={[
                                styles.emptyHint,
                                { bottom: insets.bottom + 165 },
                            ]}
                        >
                            <Text style={styles.emptyHintText}>
                                YOLO sin detecciones · apunta a personas, sillas,
                                botellas, libros, monitores, tazas u otros objetos
                                cotidianos (clases COCO)
                            </Text>
                        </View>
                    )}

                {/* ─── Auto-paused banner ─── */}
                {ar.autoPaused && (
                    <View style={styles.pausedBanner}>
                        <Text style={styles.pausedText}>
                            ⚠ IA EN PAUSA · BATERÍA &lt; 20%
                        </Text>
                    </View>
                )}
            </CameraView>
        </View>
    );
}

// =============================================================================
// STYLES
// =============================================================================

const CYAN = '#3fa8ff';
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    camera: { flex: 1 },

    // Permission gate
    permissionContainer: {
        flex: 1,
        backgroundColor: '#000',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
    },
    permissionIcon: { fontSize: 64, marginBottom: 24 },
    permissionTitle: {
        color: '#fff',
        fontSize: 18,
        letterSpacing: 4,
        marginBottom: 12,
        fontWeight: '300',
    },
    permissionText: {
        color: '#888',
        textAlign: 'center',
        fontSize: 14,
        lineHeight: 20,
    },
    permissionButton: {
        marginTop: 32,
        backgroundColor: CYAN,
        paddingHorizontal: 40,
        paddingVertical: 14,
        borderRadius: 12,
    },
    permissionButtonText: {
        color: '#000',
        fontWeight: '700',
        letterSpacing: 2,
    },
    permissionLink: {
        color: '#888',
        textDecorationLine: 'underline',
    },

    // Corner brackets
    corner: {
        position: 'absolute',
        width: 30,
        height: 30,
        borderColor: CYAN,
    },
    cornerTopLeft: {
        top: 100,
        left: 16,
        borderTopWidth: 2,
        borderLeftWidth: 2,
    },
    cornerTopRight: {
        top: 100,
        right: 16,
        borderTopWidth: 2,
        borderRightWidth: 2,
    },
    cornerBottomLeft: {
        bottom: 180,
        left: 16,
        borderBottomWidth: 2,
        borderLeftWidth: 2,
    },
    cornerBottomRight: {
        bottom: 180,
        right: 16,
        borderBottomWidth: 2,
        borderRightWidth: 2,
    },

    // Top bar
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 8,
        gap: 10,
    },
    closeButton: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '300',
        lineHeight: 20,
    },
    titleBlock: { flex: 1 },
    title: {
        color: '#fff',
        fontSize: 13,
        letterSpacing: 4,
        fontWeight: '600',
    },
    subtitle: {
        color: '#888',
        fontSize: 9,
        letterSpacing: 2,
        marginTop: 2,
    },

    // Counter row
    counterRow: {
        position: 'absolute',
        right: 16,
    },

    // Bottom bar
    bottomBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 32,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    smallButton: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    smallButtonActive: {
        borderColor: CYAN,
        backgroundColor: 'rgba(63, 168, 255, 0.18)',
    },
    smallButtonIcon: { fontSize: 18 },
    smallButtonLabel: {
        color: '#fff',
        fontSize: 8,
        letterSpacing: 1.2,
        marginTop: 2,
        fontWeight: '600',
    },

    // Diagnostics
    diagStrip: {
        position: 'absolute',
        alignSelf: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    diagText: {
        color: '#888',
        fontSize: 10,
        letterSpacing: 1.5,
    },

    // Empty-detections hint
    emptyHint: {
        position: 'absolute',
        alignSelf: 'center',
        maxWidth: '85%',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        borderColor: 'rgba(63, 168, 255, 0.35)',
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 10,
    },
    emptyHintText: {
        color: '#9bd6ff',
        fontSize: 11,
        textAlign: 'center',
        lineHeight: 14,
    },

    // Paused banner
    pausedBanner: {
        position: 'absolute',
        top: '40%',
        alignSelf: 'center',
        backgroundColor: 'rgba(255, 68, 68, 0.85)',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 10,
    },
    pausedText: {
        color: '#fff',
        fontWeight: '700',
        letterSpacing: 2,
    },
});
