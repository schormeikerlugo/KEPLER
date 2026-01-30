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
                            systemStatus.backend && styles.statusIndicatorOnline
                        ]} />
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>Supabase DB</Text>
                        <View style={[
                            styles.statusIndicatorDot,
                            systemStatus.supabase && styles.statusIndicatorOnline
                        ]} />
                    </View>

                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>Ollama AI</Text>
                        <View style={[
                            styles.statusIndicatorDot,
                            systemStatus.ollama && styles.statusIndicatorOnline
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
