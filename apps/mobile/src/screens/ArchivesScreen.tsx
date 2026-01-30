/**
 * KEPLER Mobile - Archives Screen
 * With shared header
 */
import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    SafeAreaView,
    TouchableOpacity,
} from 'react-native';
import Header from '../components/Header';
import { colors } from '../theme';

interface ArchiveObject {
    id: string;
    nombre: string;
    tipo: string;
    fecha: string;
}

const mockObjects: ArchiveObject[] = [
    { id: '1', nombre: 'Roca Volcánica', tipo: 'MINERAL', fecha: '2026-01-28' },
    { id: '2', nombre: 'Cristal de Cuarzo', tipo: 'CRISTAL', fecha: '2026-01-27' },
    { id: '3', nombre: 'Fósil Marino', tipo: 'FOSIL', fecha: '2026-01-26' },
];

export default function ArchivesScreen() {
    const [objects] = useState<ArchiveObject[]>(mockObjects);
    const [pois] = useState(0);

    return (
        <SafeAreaView style={styles.container}>
            <Header />

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Minerals Section */}
                <View style={styles.sectionCard}>
                    <View style={styles.sectionHeader}>
                        <View style={styles.sectionTitleRow}>
                            <Text style={styles.sectionIcon}>💎</Text>
                            <Text style={styles.sectionTitle}>Minerals</Text>
                        </View>
                        <View style={styles.countBadge}>
                            <Text style={styles.countText}>{objects.length}</Text>
                        </View>
                    </View>
                    <View style={styles.sectionDivider} />

                    {objects.length === 0 ? (
                        <Text style={styles.noDataText}>No data available</Text>
                    ) : (
                        objects.map((obj) => (
                            <TouchableOpacity key={obj.id} style={styles.itemCard}>
                                <Text style={styles.itemIcon}>🪨</Text>
                                <View style={styles.itemContent}>
                                    <Text style={styles.itemName}>{obj.nombre}</Text>
                                    <Text style={styles.itemMeta}>{obj.tipo} • {obj.fecha}</Text>
                                </View>
                            </TouchableOpacity>
                        ))
                    )}
                </View>

                {/* POIs Section */}
                <View style={styles.sectionCard}>
                    <View style={styles.sectionHeader}>
                        <View style={styles.sectionTitleRow}>
                            <Text style={styles.sectionIcon}>🚩</Text>
                            <Text style={styles.sectionTitle}>POIs</Text>
                        </View>
                        <View style={styles.countBadge}>
                            <Text style={styles.countText}>{pois}</Text>
                        </View>
                    </View>
                    <View style={styles.sectionDivider} />
                    <Text style={styles.noDataText}>No data available</Text>
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
    },
    sectionCard: {
        backgroundColor: '#1a1a1a',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sectionIcon: {
        fontSize: 16,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '500',
        color: '#fff',
    },
    countBadge: {
        backgroundColor: '#2a2a2a',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: colors.cyan,
    },
    countText: {
        fontSize: 14,
        color: colors.cyan,
        fontWeight: '600',
    },
    sectionDivider: {
        height: 1,
        backgroundColor: '#333',
        marginVertical: 12,
    },
    noDataText: {
        color: '#666',
        fontSize: 14,
    },
    itemCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#252525',
        padding: 14,
        borderRadius: 12,
        marginTop: 8,
        gap: 12,
    },
    itemIcon: {
        fontSize: 24,
    },
    itemContent: {
        flex: 1,
    },
    itemName: {
        fontSize: 14,
        color: '#fff',
        fontWeight: '500',
    },
    itemMeta: {
        fontSize: 11,
        color: '#666',
        marginTop: 2,
    },
});
