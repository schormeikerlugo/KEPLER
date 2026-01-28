/**
 * KEPLER Mobile - AR Camera Screen
 * Camera view with object detection overlay
 */
import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import type { RootStackScreenProps } from '../navigation/types';

const { width, height } = Dimensions.get('window');

export default function ARCameraScreen({ navigation, route }: RootStackScreenProps<'ARCamera'>) {
    const [permission, requestPermission] = useCameraPermissions();
    const [isDetecting, setIsDetecting] = useState(false);
    const [detections, setDetections] = useState<any[]>([]);
    const cameraRef = useRef<CameraView>(null);
    const missionId = route.params?.missionId;

    useEffect(() => {
        if (!permission?.granted) {
            requestPermission();
        }
    }, [permission]);

    const captureAndAnalyze = async () => {
        if (!cameraRef.current) return;

        setIsDetecting(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        try {
            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.7,
                base64: true,
            });

            // TODO: Send to backend for YOLO detection
            // const result = await api.detectObjects(photo.base64);
            // setDetections(result.detections);

            // Placeholder detection
            setTimeout(() => {
                setDetections([
                    { class: 'rock', confidence: 0.92, bbox: [100, 150, 200, 200] },
                ]);
                setIsDetecting(false);
            }, 500);
        } catch (error) {
            console.error('Capture error:', error);
            setIsDetecting(false);
        }
    };

    const closeMission = () => {
        navigation.goBack();
    };

    if (!permission?.granted) {
        return (
            <View style={styles.container}>
                <Text style={styles.permissionText}>
                    KEPLER necesita acceso a la cámara
                </Text>
                <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                    <Text style={styles.permissionButtonText}>Permitir Cámara</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="back"
            >
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
                        <Text style={styles.detectionLabel}>
                            {det.class} ({Math.round(det.confidence * 100)}%)
                        </Text>
                    </View>
                ))}

                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={closeMission} style={styles.closeButton}>
                        <Text style={styles.closeText}>✕</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>🔭 Modo AR</Text>
                    <View style={styles.statusBadge}>
                        <Text style={styles.statusText}>
                            {isDetecting ? '⏳ Analizando...' : '🟢 Listo'}
                        </Text>
                    </View>
                </View>

                {/* Bottom Controls */}
                <View style={styles.controls}>
                    <TouchableOpacity
                        style={[styles.captureButton, isDetecting && styles.captureButtonActive]}
                        onPress={captureAndAnalyze}
                        disabled={isDetecting}
                    >
                        <View style={styles.captureButtonInner}>
                            <Text style={styles.captureIcon}>📷</Text>
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
        backgroundColor: '#000',
    },
    camera: {
        flex: 1,
    },
    header: {
        position: 'absolute',
        top: 50,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    closeButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeText: {
        color: '#fff',
        fontSize: 20,
    },
    headerTitle: {
        color: '#00d4ff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    statusBadge: {
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    statusText: {
        color: '#fff',
        fontSize: 12,
    },
    controls: {
        position: 'absolute',
        bottom: 50,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    captureButton: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    captureButtonActive: {
        backgroundColor: 'rgba(0,212,255,0.5)',
    },
    captureButtonInner: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
    },
    captureIcon: {
        fontSize: 28,
    },
    detectionBox: {
        position: 'absolute',
        borderWidth: 2,
        borderColor: '#00d4ff',
        backgroundColor: 'rgba(0,212,255,0.1)',
        borderRadius: 4,
    },
    detectionLabel: {
        position: 'absolute',
        top: -24,
        left: 0,
        backgroundColor: '#00d4ff',
        color: '#000',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 'bold',
    },
    permissionText: {
        color: '#fff',
        fontSize: 18,
        textAlign: 'center',
        marginBottom: 20,
    },
    permissionButton: {
        backgroundColor: '#00d4ff',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    permissionButtonText: {
        color: '#000',
        fontWeight: 'bold',
    },
});
