/**
 * KEPLER Mobile - Profile Screen
 */
import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    TouchableOpacity,
} from 'react-native';
import { supabase } from '../services/supabase';

export default function ProfileScreen() {
    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>👤 Perfil</Text>
            </View>

            <View style={styles.content}>
                <View style={styles.avatarContainer}>
                    <Text style={styles.avatar}>🧑‍🚀</Text>
                </View>
                <Text style={styles.name}>Explorador KEPLER</Text>
                <Text style={styles.email}>usuario@kepler.com</Text>

                <View style={styles.statsContainer}>
                    <View style={styles.stat}>
                        <Text style={styles.statValue}>0</Text>
                        <Text style={styles.statLabel}>Misiones</Text>
                    </View>
                    <View style={styles.stat}>
                        <Text style={styles.statValue}>0</Text>
                        <Text style={styles.statLabel}>Objetos</Text>
                    </View>
                    <View style={styles.stat}>
                        <Text style={styles.statValue}>0 km</Text>
                        <Text style={styles.statLabel}>Explorado</Text>
                    </View>
                </View>

                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                    <Text style={styles.logoutText}>🚪 Cerrar Sesión</Text>
                </TouchableOpacity>
            </View>
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
    content: {
        flex: 1,
        alignItems: 'center',
        paddingTop: 40,
    },
    avatarContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#1a1a3a',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#00d4ff',
        marginBottom: 16,
    },
    avatar: {
        fontSize: 48,
    },
    name: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#fff',
    },
    email: {
        fontSize: 14,
        color: '#888',
        marginTop: 4,
    },
    statsContainer: {
        flexDirection: 'row',
        marginTop: 40,
        paddingHorizontal: 20,
    },
    stat: {
        flex: 1,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#00d4ff',
    },
    statLabel: {
        fontSize: 12,
        color: '#888',
        marginTop: 4,
    },
    logoutButton: {
        marginTop: 60,
        backgroundColor: '#1a1a3a',
        paddingHorizontal: 32,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#ff4444',
    },
    logoutText: {
        color: '#ff4444',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
