/**
 * StatusModal Component
 * System status modal
 */

import React from 'react';
import { View, Text, Modal, Pressable } from 'react-native';
import { SystemStatus } from '../../../services/api';
import { styles } from '../styles';

interface StatusModalProps {
    visible: boolean;
    systemStatus: SystemStatus;
    isSystemOnline: boolean;
    onClose: () => void;
}

export function StatusModal({
    visible,
    systemStatus,
    isSystemOnline,
    onClose,
}: StatusModalProps) {
    const safeStatus = systemStatus || { backend: false, supabase: false, ollama: false };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <Pressable style={styles.modalOverlay} onPress={onClose}>
                <View style={styles.statusModal}>
                    <Text style={styles.statusModalTitle}>SYSTEM STATUS</Text>
                    <View style={styles.menuDivider} />

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>Backend API</Text>
                        <View style={[
                            styles.statusIndicatorDot,
                            { backgroundColor: safeStatus.backend ? '#00ff88' : '#ff4444' }
                        ]} />
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>Supabase DB</Text>
                        <View style={[
                            styles.statusIndicatorDot,
                            { backgroundColor: safeStatus.supabase ? '#00ff88' : '#ff4444' }
                        ]} />
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>Ollama AI</Text>
                        <View style={[
                            styles.statusIndicatorDot,
                            { backgroundColor: safeStatus.ollama ? '#00ff88' : '#ff4444' }
                        ]} />
                    </View>

                    <View style={styles.menuDivider} />

                    <Text style={styles.statusNote}>
                        {isSystemOnline ? '✅ Sistema operativo' : '⚠️ Backend desconectado'}
                    </Text>
                </View>
            </Pressable>
        </Modal>
    );
}
