/**
 * KEPLER Mobile - Archives Screen
 * View and manage discovered objects
 */
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    SafeAreaView,
    TouchableOpacity,
    Image,
} from 'react-native';
import { api } from '../services/api';

interface ArchiveObject {
    id: string;
    nombre: string;
    descripcion?: string;
    imagen_url?: string;
    created_at: string;
}

export default function ArchivesScreen() {
    const [objects, setObjects] = useState<ArchiveObject[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadObjects();
    }, []);

    const loadObjects = async () => {
        try {
            setLoading(true);
            const data = await api.getObjects();
            setObjects(data.objects || []);
        } catch (error) {
            console.error('Error loading objects:', error);
        } finally {
            setLoading(false);
        }
    };

    const renderItem = ({ item }: { item: ArchiveObject }) => (
        <TouchableOpacity style={styles.card}>
            <View style={styles.cardImage}>
                {item.imagen_url ? (
                    <Image source={{ uri: item.imagen_url }} style={styles.image} />
                ) : (
                    <Text style={styles.placeholderIcon}>🪨</Text>
                )}
            </View>
            <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{item.nombre}</Text>
                <Text style={styles.cardDescription} numberOfLines={2}>
                    {item.descripcion || 'Sin descripción'}
                </Text>
                <Text style={styles.cardDate}>
                    {new Date(item.created_at).toLocaleDateString()}
                </Text>
            </View>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>📁 Archivos</Text>
                <Text style={styles.subtitle}>{objects.length} objetos descubiertos</Text>
            </View>

            {objects.length === 0 && !loading ? (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyIcon}>🔍</Text>
                    <Text style={styles.emptyText}>
                        No hay objetos registrados aún
                    </Text>
                    <Text style={styles.emptySubtext}>
                        Inicia una misión para comenzar a explorar
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={objects}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.list}
                    refreshing={loading}
                    onRefresh={loadObjects}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a1a',
    },
    header: {
        padding: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#00d4ff',
    },
    subtitle: {
        fontSize: 14,
        color: '#888',
        marginTop: 4,
    },
    list: {
        padding: 16,
    },
    card: {
        flexDirection: 'row',
        backgroundColor: '#1a1a3a',
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#2a2a5a',
        overflow: 'hidden',
    },
    cardImage: {
        width: 80,
        height: 80,
        backgroundColor: '#2a2a5a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    placeholderIcon: {
        fontSize: 32,
    },
    cardContent: {
        flex: 1,
        padding: 12,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fff',
    },
    cardDescription: {
        fontSize: 12,
        color: '#aaa',
        marginTop: 4,
    },
    cardDate: {
        fontSize: 10,
        color: '#666',
        marginTop: 8,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    emptyIcon: {
        fontSize: 64,
        marginBottom: 16,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
        textAlign: 'center',
    },
    emptySubtext: {
        fontSize: 14,
        color: '#888',
        textAlign: 'center',
        marginTop: 8,
    },
});
