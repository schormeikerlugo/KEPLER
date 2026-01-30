/**
 * KEPLER Mobile - Login Screen
 */
import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    KeyboardAvoidingView,
    Platform,
    Alert,
} from 'react-native';

export default function LoginScreen({ navigation }: any) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);

    const handleAuth = async () => {
        if (!email || !password) {
            Alert.alert('Error', 'Por favor ingresa email y contraseña');
            return;
        }

        setLoading(true);

        // Simulate login
        setTimeout(() => {
            setLoading(false);
            // Navigation would happen here after auth
            Alert.alert('Login', 'Funcionalidad en desarrollo');
        }, 1000);
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.content}
            >
                {/* Logo */}
                <View style={styles.header}>
                    <Text style={styles.logo}>🔭</Text>
                    <Text style={styles.title}>KEPLER</Text>
                    <Text style={styles.subtitle}>Sistema de Exploración con IA</Text>
                </View>

                {/* Form */}
                <View style={styles.form}>
                    <TextInput
                        style={styles.input}
                        placeholder="Email"
                        placeholderTextColor="#666"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />
                    <TextInput
                        style={styles.input}
                        placeholder="Contraseña"
                        placeholderTextColor="#666"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                    />

                    <TouchableOpacity
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handleAuth}
                        disabled={loading}
                    >
                        <Text style={styles.buttonText}>
                            {loading ? 'Cargando...' : isSignUp ? 'Registrarse' : 'Iniciar Sesión'}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.switchButton}
                        onPress={() => setIsSignUp(!isSignUp)}
                    >
                        <Text style={styles.switchText}>
                            {isSignUp ? '¿Ya tienes cuenta? Inicia Sesión' : '¿No tienes cuenta? Regístrate'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a1a',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 30,
    },
    header: {
        alignItems: 'center',
        marginBottom: 50,
    },
    logo: {
        fontSize: 64,
        marginBottom: 10,
    },
    title: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#00d4ff',
    },
    subtitle: {
        fontSize: 14,
        color: '#888',
        marginTop: 8,
    },
    form: {
        width: '100%',
    },
    input: {
        backgroundColor: '#1a1a3a',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: '#fff',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#2a2a5a',
    },
    button: {
        backgroundColor: '#00d4ff',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 8,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonText: {
        color: '#0a0a1a',
        fontSize: 16,
        fontWeight: 'bold',
    },
    switchButton: {
        marginTop: 20,
        alignItems: 'center',
    },
    switchText: {
        color: '#00d4ff',
        fontSize: 14,
    },
});
