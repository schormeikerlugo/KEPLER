import React from 'react';
import { View, Text } from 'react-native';
import { styles } from '../styles';

interface ObjectGridProps {
    objects?: any[];
}

export const ObjectGrid = ({ objects }: ObjectGridProps) => {
    if (!objects || objects.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                    No hay registros visuales en esta misión.
                </Text>
            </View>
        );
    }

    return (
        <View>
            <Text style={{ color: '#fff' }}>{objects.length} objetos encontrados</Text>
            {/* Grid implementation for later */}
        </View>
    );
};
