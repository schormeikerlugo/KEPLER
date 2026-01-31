import React from 'react';
import { View, TouchableOpacity, Text, Alert } from 'react-native';
import { styles } from '../styles';

interface MissionActionsProps {
    status: string;
    onComplete: () => void;
    onDelete: () => void;
}

export const MissionActions = ({ status, onComplete, onDelete }: MissionActionsProps) => {
    const isCompleted = status === 'COMPLETADA';

    const handleDelete = () => {
        Alert.alert(
            'Eliminar Misión',
            '¿Estás seguro? Esta acción no se puede deshacer.',
            [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Eliminar', style: 'destructive', onPress: onDelete }
            ]
        );
    };

    return (
        <View style={styles.actionRow}>
            {!isCompleted && (
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={onComplete}
                >
                    <Text style={styles.actionButtonText}>FINALIZAR</Text>
                </TouchableOpacity>
            )}

            <TouchableOpacity
                style={[styles.actionButton, styles.deleteButton]}
                onPress={handleDelete}
            >
                <Text style={styles.deleteButtonText}>ELIMINAR</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton}>
                <Text style={styles.actionButtonText}>CATEGORÍAS ▼</Text>
            </TouchableOpacity>
        </View>
    );
};
