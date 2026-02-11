/**
 * KEPLER Mobile - Profile Screen
 * With advanced editing, AI avatars, and security settings
 */
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    TouchableOpacity,
    ScrollView,
    Alert,
    Image,
    ActivityIndicator,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    Modal
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Header from '../components/Header';
import { COLORS, RADIUS, SPACING, FONT_SIZES } from '../constants/config';
import { useUserProfile } from '../hooks/useUserProfile';
import { supabase } from '../services/supabase';

// Helper for glassmorphism styles matching dashboard tiles
const glassStyle = {
    backgroundColor: COLORS.backgroundSecondary,
    borderColor: 'rgba(63, 168, 255, 0.15)', // Cyan border like dashboard
    borderWidth: 1,
    borderRadius: RADIUS.xl,
};

// AI Avatar Options (Web parity)
const AVATAR_OPTIONS = [
    { id: 'astronaut', emoji: '👨‍🚀', label: 'Astronauta' },
    { id: 'alien', emoji: '👽', label: 'Explorador' },
    { id: 'robot', emoji: '🤖', label: 'Android' },
    { id: 'rocket', emoji: '🚀', label: 'Piloto' },
    { id: 'satellite', emoji: '🛰️', label: 'Operador' },
    { id: 'star', emoji: '⭐', label: 'Comandante' },
    { id: 'moon', emoji: '🌙', label: 'Lunar' },
    { id: 'planet', emoji: '🪐', label: 'Planetario' },
];

export default function ProfileScreen({ navigation }: any) {
    const { profile, loading, uploadAvatar, updateProfile } = useUserProfile();

    // Form State
    const [displayName, setDisplayName] = useState('');
    const [biography, setBiography] = useState('');
    const [location, setLocation] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Sync state with profile data
    useEffect(() => {
        if (profile) {
            setDisplayName(profile.display_name || profile.username || '');
            setBiography(profile.biography || '');
            setLocation(profile.location || '');
        }
    }, [profile]);

    const handleSaveProfile = async () => {
        setSaving(true);
        try {
            await updateProfile({
                display_name: displayName,
                biography,
                location
            });
            Alert.alert('Éxito', 'Perfil actualizado correctamente');
            setIsEditing(false);
        } catch (e: any) {
            Alert.alert('Error', 'No se pudieron guardar los cambios');
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = () => {
        Alert.alert('Cerrar Sesión', '¿Estás seguro?', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Salir',
                style: 'destructive',
                onPress: async () => {
                    await supabase.auth.signOut();
                }
            },
        ]);
    };

    const handleResetPassword = async () => {
        if (!profile?.email) return;
        Alert.alert('Cambiar Contraseña', `¿Enviar correo de restablecimiento a ${profile.email}?`, [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Enviar',
                onPress: async () => {
                    const { error } = await supabase.auth.resetPasswordForEmail(profile.email!);
                    if (error) Alert.alert('Error', error.message);
                    else Alert.alert('Enviado', 'Revisa tu bandeja de entrada.');
                }
            }
        ]);
    };

    const handleGlobalSignOut = async () => {
        Alert.alert('Cerrar Sesión Global', 'Esto cerrará tu sesión en TODOS los dispositivos.', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Confirmar',
                style: 'destructive',
                onPress: async () => {
                    const { error } = await supabase.auth.signOut({ scope: 'global' });
                    if (error) Alert.alert('Error', error.message);
                }
            }
        ]);
    };

    const handlePickImage = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.5,
            });

            if (!result.canceled && result.assets[0].uri) {
                setUploading(true);
                await uploadAvatar(result.assets[0].uri);
                Alert.alert('Éxito', 'Avatar actualizado');
            }
        } catch (e: any) {
            Alert.alert('Error', e.message);
        } finally {
            setUploading(false);
        }
    };

    const handleEmojiSelect = async (emoji: string) => {
        setUploading(true);
        try {
            await updateProfile({ avatar_url: `emoji:${emoji}` });
            Alert.alert('Avatar Actualizado', `Tu avatar ahora es ${emoji}`);
        } catch (e) {
            Alert.alert('Error', 'No se pudo cambiar el avatar');
        } finally {
            setUploading(false);
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <Header showStatus={false} />
                <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                    <ActivityIndicator size="large" color={COLORS.cyan} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <Header showStatus={false} />

            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.keyboardView}
            >
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header Card */}
                    <View style={[styles.card, { alignItems: 'center' }]}>
                        <View style={styles.avatarLarge}>
                            {uploading ? (
                                <ActivityIndicator color={COLORS.cyan} />
                            ) : profile?.avatar_url ? (
                                profile.is_emoji ? (
                                    <Text style={{ fontSize: 40 }}>
                                        {profile.avatar_url.replace('emoji:', '')}
                                    </Text>
                                ) : (
                                    <Image
                                        source={{ uri: profile.avatar_url }}
                                        style={{ width: '100%', height: '100%' }}
                                    />
                                )
                            ) : (
                                <Text style={{ fontSize: 40 }}>
                                    {profile?.username ? profile.username.charAt(0).toUpperCase() : '👤'}
                                </Text>
                            )}
                        </View>
                        <Text style={styles.headerName}>
                            {profile?.display_name || profile?.username || 'Explorador'}
                        </Text>
                        <Text style={styles.headerEmail}>{profile?.email}</Text>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>🚀 Explorador</Text>
                        </View>
                        <Text style={styles.memberSince}>Miembro desde 2026</Text>

                        <TouchableOpacity style={styles.btnOutline} onPress={handlePickImage} disabled={uploading}>
                            <Text style={styles.btnOutlineText}>Cambiar Avatar</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Stats Row */}
                    <View style={styles.statsRow}>
                        <View style={[styles.statCard]}>
                            <Text style={styles.statValue}>21</Text>
                            <Text style={styles.statLabel}>MISIONES</Text>
                        </View>
                        <View style={[styles.statCard]}>
                            <Text style={styles.statValue}>0</Text>
                            <Text style={styles.statLabel}>OBJETOS</Text>
                        </View>
                        <View style={[styles.statCard]}>
                            <Text style={styles.statValue}>0</Text>
                            <Text style={styles.statLabel}>POIs</Text>
                        </View>
                        <View style={[styles.statCard]}>
                            <Text style={styles.statValue}>26.8</Text>
                            <Text style={styles.statLabel}>HORAS</Text>
                        </View>
                    </View>

                    {/* Personal Info Section */}
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>INFORMACIÓN PERSONAL</Text>
                    </View>
                    <View style={styles.card}>
                        <Text style={styles.label}>NOMBRE DE USUARIO</Text>
                        <TextInput
                            style={styles.input}
                            value={displayName}
                            onChangeText={setDisplayName}
                            placeholder="Tu nombre visible"
                            placeholderTextColor="#666"
                        />

                        <Text style={styles.label}>BIOGRAFÍA</Text>
                        <TextInput
                            style={[styles.input, styles.textArea]}
                            value={biography}
                            onChangeText={setBiography}
                            placeholder="Cuéntanos sobre ti..."
                            placeholderTextColor="#666"
                            multiline
                            numberOfLines={4}
                        />

                        <Text style={styles.label}>UBICACIÓN / BASE</Text>
                        <TextInput
                            style={styles.input}
                            value={location}
                            onChangeText={setLocation}
                            placeholder="Ej: Base Lunar Alpha"
                            placeholderTextColor="#666"
                        />

                        <TouchableOpacity
                            style={styles.btnPrimary}
                            onPress={handleSaveProfile}
                            disabled={saving}
                        >
                            {saving ? (
                                <ActivityIndicator color="#000" />
                            ) : (
                                <Text style={styles.btnPrimaryText}>💾 Guardar Cambios</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* AI Avatar Selection */}
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>🤖 AVATAR DEL ASISTENTE IA</Text>
                    </View>
                    <View style={styles.card}>
                        <Text style={styles.subtext}>Personaliza la imagen del asistente de chat.</Text>

                        <View style={styles.currentAvatarContainer}>
                            <View style={styles.currentAvatarCircle}>
                                <Text style={{ fontSize: 40 }}>
                                    {profile?.is_emoji && profile.avatar_url ? profile.avatar_url.replace('emoji:', '') : '⌘'}
                                </Text>
                            </View>
                            <Text style={styles.avatarLabel}>AVATAR ACTUAL</Text>
                        </View>

                        <Text style={[styles.label, { marginTop: 20 }]}>SELECCIONAR ICONO</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiRow}>
                            {AVATAR_OPTIONS.map((opt) => (
                                <TouchableOpacity
                                    key={opt.id}
                                    style={styles.emojiBtn}
                                    onPress={() => handleEmojiSelect(opt.emoji)}
                                >
                                    <Text style={{ fontSize: 24 }}>{opt.emoji}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <Text style={styles.label}>URL PERSONALIZADA</Text>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TextInput
                                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                                placeholder="https://example.com/avatar.png"
                                placeholderTextColor="#666"
                                autoCapitalize="none"
                            />
                            <TouchableOpacity style={styles.btnSmall}>
                                <Text style={styles.btnSmallText}>Guardar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Security Section */}
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>SEGURIDAD</Text>
                    </View>
                    <View style={styles.card}>
                        <TouchableOpacity style={styles.actionRow} onPress={handleResetPassword}>
                            <Text style={styles.actionIcon}>🔐</Text>
                            <Text style={styles.actionText}>Cambiar Contraseña</Text>
                        </TouchableOpacity>

                        <View style={styles.divider} />

                        <TouchableOpacity style={styles.actionRow} onPress={handleGlobalSignOut}>
                            <Text style={styles.actionIcon}>🚪</Text>
                            <Text style={[styles.actionText, { color: '#ff6666' }]}>Cerrar Sesión en Todos los Dispositivos</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.version}>KEPLER v0.5.0</Text>
                    <View style={{ height: 40 }} />
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000', // Black background base
    },
    keyboardView: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
    },

    // Cards using glassmorphism
    card: {
        ...glassStyle,
        padding: 24,
        marginBottom: 24,
    },

    // Header Profile Styling
    avatarLarge: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 2,
        borderColor: COLORS.cyan,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        backgroundColor: 'rgba(0,0,0,0.3)',
        overflow: 'hidden',
    },
    headerName: {
        fontSize: 24,
        color: '#fff',
        fontWeight: '300',
        letterSpacing: 1,
        marginBottom: 4,
    },
    headerEmail: {
        fontSize: 14,
        color: '#888',
        marginBottom: 12,
    },
    badge: {
        backgroundColor: 'rgba(63, 168, 255, 0.2)',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(63, 168, 255, 0.4)',
    },
    badgeText: {
        color: COLORS.cyan,
        fontSize: 12,
        fontWeight: 'bold',
    },
    memberSince: {
        fontSize: 12,
        color: '#555',
        marginBottom: 16,
    },
    btnOutline: {
        borderWidth: 1,
        borderColor: 'rgba(63, 168, 255, 0.5)',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
    },
    btnOutlineText: {
        color: COLORS.cyan,
        fontSize: 13,
    },

    // Stats
    statsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 24,
    },
    statCard: {
        flex: 1,
        ...glassStyle,
        padding: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(26, 26, 26, 0.6)', // Slightly darker
    },
    statValue: {
        fontSize: 20,
        fontWeight: 'bold',
        color: COLORS.cyan,
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 9,
        color: '#888',
        letterSpacing: 1,
    },

    // Section Headers
    sectionHeader: {
        marginBottom: 12,
    },
    sectionTitle: {
        color: COLORS.cyan,
        fontSize: 14,
        letterSpacing: 2,
        fontWeight: '600',
    },

    // Form Inputs
    label: {
        fontSize: 11,
        color: '#666',
        marginBottom: 8,
        letterSpacing: 1,
        marginTop: 4,
    },
    input: {
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderWidth: 1,
        borderColor: '#333',
        borderRadius: 8,
        padding: 12,
        color: '#fff',
        marginBottom: 20,
        fontSize: 15,
    },
    textArea: {
        height: 100,
        textAlignVertical: 'top',
    },
    subtext: {
        color: '#888',
        fontSize: 13,
        marginBottom: 20,
    },

    // AI Avatar
    currentAvatarContainer: {
        alignItems: 'center',
        marginBottom: 10,
    },
    currentAvatarCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 2,
        borderColor: '#333',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    avatarLabel: {
        color: '#666',
        fontSize: 10,
        letterSpacing: 1,
    },
    emojiRow: {
        flexDirection: 'row',
        marginBottom: 20,
    },
    emojiBtn: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#1a1a1a',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
        borderWidth: 1,
        borderColor: '#333',
    },

    // Buttons
    btnPrimary: {
        backgroundColor: COLORS.cyan,
        paddingVertical: 14,
        borderRadius: 25,
        alignItems: 'center',
        marginTop: 10,
        shadowColor: COLORS.cyan,
        shadowOpacity: 0.3,
        shadowRadius: 10,
    },
    btnPrimaryText: {
        color: '#000',
        fontWeight: 'bold',
        fontSize: 15,
    },
    btnSmall: {
        backgroundColor: COLORS.cyan,
        paddingHorizontal: 20,
        borderRadius: 8,
        justifyContent: 'center',
    },
    btnSmallText: {
        color: '#000',
        fontWeight: 'bold',
        fontSize: 13,
    },

    // Security
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
    },
    actionIcon: {
        fontSize: 20,
        marginRight: 12,
    },
    actionText: {
        color: '#ddd',
        fontSize: 15,
    },
    divider: {
        height: 1,
        backgroundColor: '#333',
        marginVertical: 4,
    },

    version: {
        textAlign: 'center',
        color: '#444',
        fontSize: 11,
        marginTop: 8,
    },
});
