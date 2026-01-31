/**
 * Mission Detail Screen
 * Detailed view of a mission with actions
 */
import React from 'react';
import { View, ScrollView, SafeAreaView, Text, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { styles } from './styles';
import { useMissionDetail } from './hooks';
import { MissionActions, ObjectGrid } from './components';
import { COLORS } from '../../constants/config';

export default function MissionDetailScreen() {
    const navigation = useNavigation();
    const route = useRoute();
    const insets = useSafeAreaInsets();
    // @ts-ignore
    const { missionId } = route.params || {};

    const { mission, loading, completeMission, deleteMission } = useMissionDetail(missionId);

    if (loading || !mission) {
        return (
            <SafeAreaView style={styles.container}>
                <Text style={{ color: '#fff', textAlign: 'center', marginTop: 50 }}>Cargando...</Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10 }}>
                <TouchableOpacity
                    style={{
                        borderWidth: 1,
                        borderColor: COLORS.cyan,
                        borderRadius: 8,
                        paddingVertical: 12,
                        alignItems: 'center'
                    }}
                    onPress={() => navigation.goBack()}
                >
                    <Text style={{ color: COLORS.cyan, fontWeight: '600', letterSpacing: 1 }}>
                        VOLVER AL DASHBOARD
                    </Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
            >
                <View style={[styles.card, { marginTop: 10 }]}>
                    <Text style={styles.detailTitle}>{mission.code}</Text>

                    <MissionActions
                        status={mission.status}
                        onComplete={completeMission}
                        onDelete={deleteMission}
                    />

                    <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 20 }} />

                    <ObjectGrid objects={mission.objects} />
                </View>

            </ScrollView>
        </SafeAreaView>
    );
}
