import React from 'react';
import { View, Text, Image, FlatList, Dimensions, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { styles } from '../styles';
import { MissionObject } from '../types';
import { COLORS } from '../../../constants/config';
import { RootStackParamList } from '../../../navigation/types';

interface ObjectGridProps {
    objects?: MissionObject[];
}

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 40 - 15) / 2; // (Screen - Padding - Gap) / 2

export const ObjectGrid = ({ objects }: ObjectGridProps) => {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

    if (!objects || objects.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                    No hay registros visuales en esta misión.
                </Text>
            </View>
        );
    }

    const handlePress = (item: MissionObject) => {
        navigation.navigate('ObjectDetail', { object: item });
    };

    const renderItem = ({ item }: { item: MissionObject }) => {
        // Handle potential different image formats or missing image
        const imageSource = item.metadata?.image_base64
            ? { uri: item.metadata.image_base64 }
            : null;

        const confidence = item.metadata?.confidence
            ? Math.round(item.metadata.confidence * 100) + '%'
            : 'N/A';

        return (
            <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handlePress(item)}
                style={{
                    width: CARD_WIDTH,
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    borderRadius: 8,
                    marginBottom: 15,
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: COLORS.border // Make sure COLORS.border exists or use hex
                }}
            >
                <View style={{ height: 120, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
                    {imageSource ? (
                        <Image
                            source={imageSource}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode="cover"
                        />
                    ) : (
                        <Text style={{ fontSize: 30 }}>📦</Text>
                    )}
                </View>

                <View style={{ padding: 10 }}>
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }} numberOfLines={1}>
                        {item.nombre || 'Objeto'}
                    </Text>
                    <Text style={{ color: COLORS.cyan, fontSize: 12, marginTop: 4 }}>
                        {item.tipo?.toUpperCase()}
                    </Text>
                    <Text style={{ color: '#888', fontSize: 10, marginTop: 4 }}>
                        Confianza: {confidence}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={{ flex: 1 }}>
            <Text style={{ color: '#888', marginBottom: 15, fontSize: 12, textTransform: 'uppercase' }}>
                EVIDENCIA VISUAL ({objects.length})
            </Text>

            <FlatList
                data={objects}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                numColumns={2}
                columnWrapperStyle={{ justifyContent: 'space-between' }}
                scrollEnabled={false} // Use parent scroll
            />
        </View>
    );
};
