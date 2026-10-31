/**
 * MapLayerModal Component
 * Modal for selecting map tile layers
 */

import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Modal,
} from 'react-native';
import { LAYERS, MapLayer } from '../constants';
import { styles } from '../styles';

interface MapLayerModalProps {
    visible: boolean;
    currentLayerId: string;
    onSelectLayer: (layer: MapLayer) => void;
    onClose: () => void;
}

export function MapLayerModal({
    visible,
    currentLayerId,
    onSelectLayer,
    onClose,
}: MapLayerModalProps) {
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
                <View style={styles.layerModal}>
                    <Text style={styles.layerModalTitle}>🗺️ Seleccionar Mapa</Text>
                    <View style={styles.layerGrid}>
                        {LAYERS.map((layer) => (
                            <TouchableOpacity
                                key={layer.id}
                                style={[
                                    styles.layerCard,
                                    currentLayerId === layer.id && styles.layerCardActive,
                                ]}
                                onPress={() => onSelectLayer(layer)}
                            >
                                <Text style={styles.layerIcon}>{layer.icon}</Text>
                                <Text style={styles.layerName}>{layer.name}</Text>
                                <Text style={styles.layerDesc}>{layer.desc}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </TouchableOpacity>
        </Modal>
    );
}
