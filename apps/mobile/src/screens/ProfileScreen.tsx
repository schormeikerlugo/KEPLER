/**
 * KEPLER Mobile - Profile Screen
 * With shared header
 */
import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    TouchableOpacity,
    ScrollView,
    Alert,
} from 'react-native';
import Header from '../components/Header';
import { colors } from '../theme';

export default function ProfileScreen() {
    const handleLogout = () => {
        Alert.alert('Cerrar Sesión', '¿Estás seguro?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Salir', style: 'destructive' },
        ]);
    };

    return (
        <SafeAreaView style={styles.container}>
            <Header showStatus={false} />

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Profile Card */}
                <View style={styles.profileCard}>
                    <View style={styles.avatarContainer}>
                        <Text style={styles.avatar}>🧑‍🚀</Text>
                    </View>
                    <Text style={styles.userName}>EXPLORADOR</Text>
                    <Text style={styles.userEmail}>usuario@kepler.local</Text>
                </View>

                {/* Stats */}
                <View style={styles.statsRow}>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>21</Text>
                        <Text style={styles.statLabel}>MISIONES</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>0</Text>
                        <Text style={styles.statLabel}>OBJETOS</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>0</Text>
                        <Text style={styles.statLabel}>POIs</Text>
                    </View>
                </View>

                {/* Settings */}
                <View style={styles.sectionCard}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionIcon}>⚙️</Text>
                        <Text style={styles.sectionTitle}>Settings</Text>
                    </View>
                    <View style={styles.sectionDivider} />

                    <TouchableOpacity style={styles.menuItem}>
                        <Text style={styles.menuIcon}>🔔</Text>
                        <Text style={styles.menuText}>Notificaciones</Text>
                        <Text style={styles.menuArrow}>›</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem}>
                        <Text style={styles.menuIcon}>🎨</Text>
                        <Text style={styles.menuText}>Apariencia</Text>
                        <Text style={styles.menuArrow}>›</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem}>
                        <Text style={styles.menuIcon}>📊</Text>
                        <Text style={styles.menuText}>Datos y Privacidad</Text>
                        <Text style={styles.menuArrow}>›</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem}>
                        <Text style={styles.menuIcon}>❓</Text>
                        <Text style={styles.menuText}>Ayuda</Text>
                        <Text style={styles.menuArrow}>›</Text>
                    </TouchableOpacity>
                </View>

                {/* Logout */}
                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                    <Text style={styles.logoutText}>🚪 Cerrar Sesión</Text>
                </TouchableOpacity>

                <Text style={styles.version}>KEPLER v0.5.0</Text>

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
    profileCard: {
        backgroundColor: '#1a1a1a',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        marginBottom: 16,
    },
    avatarContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#252525',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: colors.cyan,
        marginBottom: 12,
    },
    avatar: {
        fontSize: 40,
    },
    userName: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
        letterSpacing: 2,
    },
    userEmail: {
        fontSize: 12,
        color: '#666',
        marginTop: 4,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
        gap: 8,
    },
    statCard: {
        flex: 1,
        backgroundColor: '#1a1a1a',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#333',
    },
    statValue: {
        fontSize: 24,
        fontWeight: '600',
        color: colors.cyan,
    },
    statLabel: {
        fontSize: 8,
        color: '#666',
        letterSpacing: 1,
        marginTop: 4,
    },
    sectionCard: {
        backgroundColor: '#1a1a1a',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    sectionHeader: {
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
    sectionDivider: {
        height: 1,
        backgroundColor: '#333',
        marginVertical: 12,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#252525',
    },
    menuIcon: {
        fontSize: 18,
        marginRight: 12,
    },
    menuText: {
        flex: 1,
        fontSize: 14,
        color: '#fff',
    },
    menuArrow: {
        fontSize: 20,
        color: '#666',
    },
    logoutButton: {
        backgroundColor: 'transparent',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#ff4444',
    },
    logoutText: {
        color: '#ff4444',
        fontSize: 14,
        fontWeight: '600',
    },
    version: {
        textAlign: 'center',
        color: '#444',
        fontSize: 11,
        marginTop: 20,
    },
});
