/**
 * Mission Detail Screen
 * Detailed view of a mission with actions
 */
import React from 'react';
import { View, ScrollView, SafeAreaView, Text, TouchableOpacity, TextInput } from 'react-native';
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

    const { mission, loading, completeMission, deleteMission, refresh } = useMissionDetail(missionId);

    // Edit State
    const [isEditing, setIsEditing] = React.useState(false);
    const [editTitle, setEditTitle] = React.useState('');
    const [editDesc, setEditDesc] = React.useState('');
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
        if (mission) {
            setEditTitle(mission.code);
            setEditDesc(mission.description || '');
        }
    }, [mission]);

    const handleSave = async () => {
        if (!mission) return;
        setSaving(true);
        try {
            const success = await import('../../services/api').then(m => m.api.updateMission(mission.id, {
                title: editTitle,
                description: editDesc,
                location: mission.location
            }));

            if (success) {
                await refresh();
                setIsEditing(false);
            } else {
                // Error handling via Alert if needed
            }
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    if (loading || !mission) {
        return (
            <SafeAreaView style={styles.container}>
                <Text style={{ color: '#fff', textAlign: 'center', marginTop: 50 }}>Cargando...</Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={{
                paddingHorizontal: 20,
                paddingVertical: 10,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={{ padding: 10 }}
                >
                    <Text style={{ color: COLORS.cyan, fontSize: 16 }}>← Volver</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => isEditing ? handleSave() : setIsEditing(true)}
                    disabled={saving}
                    style={{
                        backgroundColor: isEditing ? COLORS.cyan : 'transparent',
                        paddingHorizontal: 15,
                        paddingVertical: 8,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: COLORS.cyan
                    }}
                >
                    <Text style={{
                        color: isEditing ? '#000' : COLORS.cyan,
                        fontWeight: 'bold'
                    }}>
                        {saving ? 'GUARDANDO...' : (isEditing ? 'GUARDAR' : 'EDITAR')}
                    </Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
            >
                <View style={[styles.card, { marginTop: 10 }]}>
                    {isEditing ? (
                        <View style={{ marginBottom: 20 }}>
                            <Text style={{ color: '#888', fontSize: 12, marginBottom: 5 }}>TÍTULO DE MISIÓN</Text>
                            <TextInput
                                style={{
                                    backgroundColor: '#222',
                                    color: '#fff',
                                    padding: 15,
                                    borderRadius: 8,
                                    fontSize: 18,
                                    marginBottom: 15,
                                    borderWidth: 1,
                                    borderColor: '#444'
                                }}
                                value={editTitle}
                                onChangeText={setEditTitle}
                                placeholder="Nombre de misión"
                                placeholderTextColor="#666"
                            />

                            <Text style={{ color: '#888', fontSize: 12, marginBottom: 5 }}>DESCRIPCIÓN</Text>
                            <TextInput
                                style={{
                                    backgroundColor: '#222',
                                    color: '#fff',
                                    padding: 15,
                                    borderRadius: 8,
                                    fontSize: 14,
                                    minHeight: 100,
                                    textAlignVertical: 'top',
                                    borderWidth: 1,
                                    borderColor: '#444'
                                }}
                                value={editDesc}
                                onChangeText={setEditDesc}
                                multiline
                                placeholder="Descripción de la zona..."
                                placeholderTextColor="#666"
                            />
                        </View>
                    ) : (
                        <Text style={styles.detailTitle}>{mission.code}</Text>
                    )}

                    {!isEditing && (
                        <MissionActions
                            status={mission.status}
                            onComplete={completeMission}
                            onDelete={deleteMission}
                        />
                    )}

                    <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 20 }} />

                    <ObjectGrid objects={mission.objects} />
                </View>

            </ScrollView>
        </SafeAreaView>
    );
}
