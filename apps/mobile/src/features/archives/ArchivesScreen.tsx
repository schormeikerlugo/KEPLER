/**
 * Archives Screen (Feature)
 * Displays list of missions with filtering
 */
import React from 'react';
import { View, ScrollView, SafeAreaView, Text, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Header from '../../components/Header';
import { styles } from './styles';
import { useArchives } from './hooks';
import { MissionCard, MissionFilters } from './components';

export default function ArchivesScreen() {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const { missions, filter, setFilter, loading, refresh } = useArchives();

    const handleMissionPress = (id: string) => {
        // @ts-ignore - known type issue with dynamic stack
        navigation.navigate('MissionDetail', { missionId: id });
    };

    return (
        <SafeAreaView style={styles.container}>
            <Header currentScreen="Archives" />

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#fff" />
                }
            >
                <Text style={styles.sectionTitle}>MISIONES GENERALES</Text>

                <MissionFilters current={filter} onChange={setFilter} />

                {missions.length === 0 && !loading ? (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No hay misiones encontradas.</Text>
                    </View>
                ) : (
                    missions.map(mission => (
                        <MissionCard
                            key={mission.id}
                            mission={mission}
                            onPress={handleMissionPress}
                        />
                    ))
                )}
            </ScrollView>
        </SafeAreaView>
    );
}
