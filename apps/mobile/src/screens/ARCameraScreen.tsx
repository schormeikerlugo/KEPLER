/**
 * KEPLER Mobile - AR Camera Screen
 * Camera view with holographic UI overlay
 */
import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    Animated,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '../theme';

export default function ARCameraScreen({ navigation, route }: any) {
    const [permission, requestPermission] = useCameraPermissions();
    const [isDetecting, setIsDetecting] = useState(false);
    const [detections, setDetections] = useState<any[]>([]);
    const [scanAnim] = useState(new Animated.Value(0));
    const cameraRef = useRef<CameraView>(null);

    const startScanAnimation = () => {
        scanAnim.setValue(0);
        Animated.loop(
            Animated.timing(scanAnim, {
                toValue: 1,
                duration: 2000,
                useNativeDriver: true,
            })
        ).start();
    };

    const captureAndAnalyze = async () => {
        if (!cameraRef.current) return;

        setIsDetecting(true);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        startScanAnimation();

        try {
            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.7,
                base64: true,
            });

            // Simulate detection
            setTimeout(() => {
                setDetections([
                    { class: 'OBJETO', confidence: 0.94, bbox: [80, 200, 180, 180] },
                ]);
                setIsDetecting(false);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert('✅ ANÁLISIS COMPLETO', 'Objeto detectado y catalogado');
            }, 1500);
        } catch (error) {
            setIsDetecting(false);
            Alert.alert('ERROR', 'No se pudo capturar');
        }
    };

    const closeMission = () => {
        navigation.goBack();
    };

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
                    KEPLER necesita acceso a la cámara para detección AR
                </Text>
                <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                    <Text style={styles.permissionButtonText}>PERMITIR</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const scanTranslateY = scanAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-100, 600],
    });

    return (
        <View style={styles.container}>
            <CameraView ref={cameraRef} style={styles.camera} facing="back">
                {/* Corner brackets */}
                <View style={[styles.corner, styles.cornerTopLeft]} />
                <View style={[styles.corner, styles.cornerTopRight]} />
                <View style={[styles.corner, styles.cornerBottomLeft]} />
                <View style={[styles.corner, styles.cornerBottomRight]} />

                {/* Scan line animation */}
                {isDetecting && (
                    <Animated.View
                        style={[
                            styles.scanLine,
                            { transform: [{ translateY: scanTranslateY }] },
                        ]}
                    />
                )}

                {/* Detection Overlays */}
                {detections.map((det, index) => (
                    <View
                        key={index}
                        style={[
                            styles.detectionBox,
                            {
                                left: det.bbox[0],
                                top: det.bbox[1],
                                width: det.bbox[2],
                                height: det.bbox[3],
                            },
                        ]}
                    >
                        <View style={styles.detectionLabelContainer}>
                            <Text style={styles.detectionLabel}>
                                {det.class} • {Math.round(det.confidence * 100)}%
                            </Text>
                        </View>
                    </View>
                ))}

                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={closeMission} style={styles.closeButton}>
                        <Text style={styles.closeText}>✕</Text>
                    </TouchableOpacity>
                    <View style={styles.titleContainer}>
                        <Text style={styles.headerTitle}>MODO AR</Text>
                        <Text style={styles.headerSubtitle}>DETECCIÓN EN TIEMPO REAL</Text>
                    </View>
                    <View style={styles.statusBadge}>
                        <View style={[styles.statusDot, isDetecting && styles.statusDotActive]} />
                        <Text style={styles.statusText}>
                            {isDetecting ? 'ANALIZANDO' : 'LISTO'}
                        </Text>
                    </View>
                </View>

                {/* Bottom Controls */}
                <View style={styles.controls}>
                    <View style={styles.infoPanel}>
                        <Text style={styles.infoText}>
                            {isDetecting ? '⏳ Procesando imagen...' : '📷 Toca para analizar'}
                        </Text>
                    </View>

                    <TouchableOpacity
                        style={[styles.captureButton, isDetecting && styles.captureButtonActive]}
                        onPress={captureAndAnalyze}
                        disabled={isDetecting}
                        activeOpacity={0.8}
                    >
                        <View style={[styles.captureButtonInner, isDetecting && styles.captureButtonInnerActive]}>
                            <Text style={styles.captureIcon}>{isDetecting ? '⏳' : '📷'}</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </CameraView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bgPrimary,
    },
    camera: {
        flex: 1,
    },
    permissionContainer: {
        flex: 1,
        backgroundColor: colors.bgPrimary,
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.xl,
    },
    permissionIcon: {
        fontSize: 60,
        marginBottom: spacing.lg,
    },
    permissionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.textPrimary,
        letterSpacing: 2,
        marginBottom: spacing.sm,
    },
    permissionText: {
        color: colors.textSecondary,
        fontSize: 14,
        textAlign: 'center',
        marginBottom: spacing.lg,
    },
    permissionButton: {
        backgroundColor: colors.cyan,
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.md,
        borderRadius: radius.lg,
    },
    permissionButtonText: {
        color: colors.bgPrimary,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    // Corner brackets
    corner: {
        position: 'absolute',
        width: 40,
        height: 40,
        borderColor: colors.cyan,
    },
    cornerTopLeft: {
        top: 100,
        left: 30,
        borderTopWidth: 2,
        borderLeftWidth: 2,
    },
    cornerTopRight: {
        top: 100,
        right: 30,
        borderTopWidth: 2,
        borderRightWidth: 2,
    },
    cornerBottomLeft: {
        bottom: 200,
        left: 30,
        borderBottomWidth: 2,
        borderLeftWidth: 2,
    },
    cornerBottomRight: {
        bottom: 200,
        right: 30,
        borderBottomWidth: 2,
        borderRightWidth: 2,
    },
    // Scan line
    scanLine: {
        position: 'absolute',
        left: 30,
        right: 30,
        height: 2,
        backgroundColor: colors.cyan,
        shadowColor: colors.cyan,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 10,
    },
    // Header
    header: {
        position: 'absolute',
        top: 60,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
    },
    closeButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    closeText: {
        color: colors.textPrimary,
        fontSize: 20,
        fontWeight: 'bold',
    },
    titleContainer: {
        alignItems: 'center',
    },
    headerTitle: {
        color: colors.cyan,
        fontSize: 14,
        fontWeight: 'bold',
        letterSpacing: 3,
    },
    headerSubtitle: {
        color: colors.textMuted,
        fontSize: 8,
        letterSpacing: 1,
        marginTop: 2,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: colors.border,
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.success,
        marginRight: spacing.xs,
    },
    statusDotActive: {
        backgroundColor: colors.warning,
    },
    statusText: {
        color: colors.textPrimary,
        fontSize: 9,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    // Controls
    controls: {
        position: 'absolute',
        bottom: 50,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    infoPanel: {
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: radius.full,
        marginBottom: spacing.lg,
        borderWidth: 1,
        borderColor: colors.border,
    },
    infoText: {
        color: colors.textSecondary,
        fontSize: 12,
    },
    captureButton: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(63, 168, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: colors.cyan,
    },
    captureButtonActive: {
        borderColor: colors.warning,
    },
    captureButtonInner: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: colors.cyan,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: colors.cyan,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 15,
        elevation: 10,
    },
    captureButtonInnerActive: {
        backgroundColor: colors.warning,
    },
    captureIcon: {
        fontSize: 28,
    },
    // Detection box
    detectionBox: {
        position: 'absolute',
        borderWidth: 2,
        borderColor: colors.cyan,
        backgroundColor: 'rgba(63, 168, 255, 0.1)',
        borderRadius: radius.sm,
    },
    detectionLabelContainer: {
        position: 'absolute',
        top: -28,
        left: 0,
        backgroundColor: colors.cyan,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: radius.sm,
    },
    detectionLabel: {
        color: colors.bgPrimary,
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
});
