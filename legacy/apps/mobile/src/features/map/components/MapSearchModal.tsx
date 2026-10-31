/**
 * MapSearchModal Component
 * Modal for searching objects on the map
 */

import React from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    Modal,
} from 'react-native';
import { styles } from '../styles';

interface MapSearchModalProps {
    visible: boolean;
    topInset: number;
    searchQuery: string;
    onChangeQuery: (query: string) => void;
    onClose: () => void;
}

export function MapSearchModal({
    visible,
    topInset,
    searchQuery,
    onChangeQuery,
    onClose,
}: MapSearchModalProps) {
    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={styles.modalOverlay}
                activeOpacity={1}
                onPress={onClose}
            >
                <View style={[styles.searchModal, { marginTop: topInset + 60 }]}>
                    <View style={styles.searchInputContainer}>
                        <Text style={styles.searchIcon}>🔍</Text>
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Buscar objetos..."
                            placeholderTextColor="#446688"
                            value={searchQuery}
                            onChangeText={onChangeQuery}
                            autoFocus
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => onChangeQuery('')}>
                                <Text style={styles.searchClear}>×</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <Text style={styles.searchHint}>
                        Próximamente: búsqueda de objetos en el mapa
                    </Text>
                </View>
            </TouchableOpacity>
        </Modal>
    );
}
