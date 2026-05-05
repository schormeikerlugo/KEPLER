/**
 * ServerSettingsScreen
 * --------------------
 * Lets the user override the backend URL at runtime, plus a few AR-related
 * preferences. Persists to AsyncStorage via `configService` so changes
 * survive app restarts.
 *
 * Why: the LAN IP of the dev backend can change with DHCP and a deployed
 * APK on a teammate's phone needs a way to point elsewhere without
 * recompiling.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Switch,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { configService, ConfigSnapshot } from '../../services/configService';
import {
    COLORS,
    SPACING,
    RADIUS,
    FONT_SIZES,
    LETTER_SPACING,
} from '../../constants/config';

type TestState =
    | { kind: 'idle' }
    | { kind: 'testing' }
    | { kind: 'ok'; status?: number }
    | { kind: 'error'; message: string };

export default function ServerSettingsScreen() {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();

    const [config, setConfig] = useState<ConfigSnapshot>(configService.getSnapshot());
    const [urlDraft, setUrlDraft] = useState(config.backendUrl);
    const [sentinelDraft, setSentinelDraft] = useState(String(config.sentinelDuration));
    const [test, setTest] = useState<TestState>({ kind: 'idle' });
    const [saving, setSaving] = useState(false);

    // Hydrate once and subscribe to changes from elsewhere
    useEffect(() => {
        let mounted = true;
        configService.ready().then(() => {
            if (!mounted) return;
            const snap = configService.getSnapshot();
            setConfig(snap);
            setUrlDraft(snap.backendUrl);
            setSentinelDraft(String(snap.sentinelDuration));
        });
        const unsub = configService.onChange((next) => {
            if (!mounted) return;
            setConfig(next);
        });
        return () => { mounted = false; unsub(); };
    }, []);

    const dirty = urlDraft.trim() !== config.backendUrl
        || sentinelDraft !== String(config.sentinelDuration);

    const handleTest = useCallback(async () => {
        Haptics.selectionAsync();
        setTest({ kind: 'testing' });
        // Use the draft URL if it's valid syntactically, otherwise the saved one
        let probeUrl = config.backendUrl;
        const draft = urlDraft.trim();
        if (draft && /^https?:\/\//.test(draft)) {
            probeUrl = draft.replace(/\/+$/, '');
        }

        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 5000);
        try {
            const res = await fetch(`${probeUrl}/health`, { signal: controller.signal });
            clearTimeout(tid);
            if (res.ok) {
                setTest({ kind: 'ok', status: res.status });
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else {
                setTest({ kind: 'error', message: `HTTP ${res.status}` });
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            }
        } catch (e: any) {
            clearTimeout(tid);
            setTest({ kind: 'error', message: e?.message || 'sin conexión' });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    }, [urlDraft, config.backendUrl]);

    const handleSave = useCallback(async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSaving(true);
        try {
            await configService.setBackendUrl(urlDraft.trim());
            const sentinelN = parseInt(sentinelDraft, 10);
            if (!isNaN(sentinelN)) {
                await configService.setSentinelDuration(sentinelN);
            }
            Alert.alert('Configuración guardada', 'Los cambios se aplicarán de inmediato.');
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'No se pudo guardar');
        } finally {
            setSaving(false);
        }
    }, [urlDraft, sentinelDraft]);

    const handleReset = useCallback(() => {
        Alert.alert(
            'Restablecer valores',
            '¿Volver a la configuración por defecto?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Restablecer',
                    style: 'destructive',
                    onPress: async () => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                        await configService.resetToDefaults();
                        const snap = configService.getSnapshot();
                        setUrlDraft(snap.backendUrl);
                        setSentinelDraft(String(snap.sentinelDuration));
                        setTest({ kind: 'idle' });
                    },
                },
            ]
        );
    }, []);

    const toggleAutoPause = useCallback(async (value: boolean) => {
        Haptics.selectionAsync();
        await configService.setLowBatteryAutoPause(value);
    }, []);

    return (
        <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View style={[styles.header, { paddingTop: insets.top + SPACING.md }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Text style={styles.backText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.title}>SERVIDOR</Text>
                <View style={styles.backButton} />
            </View>

            <ScrollView
                style={styles.flex}
                contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
                keyboardShouldPersistTaps="handled"
            >
                {/* ── Backend URL ── */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>URL DEL BACKEND</Text>
                    <Text style={styles.sectionHint}>
                        Dirección donde corre la API de KEPLER. Usa el formato
                        {' '}<Text style={styles.code}>http://IP:PUERTO</Text>.
                    </Text>

                    <TextInput
                        value={urlDraft}
                        onChangeText={(t) => { setUrlDraft(t); setTest({ kind: 'idle' }); }}
                        placeholder="http://192.168.1.100:8000"
                        placeholderTextColor={COLORS.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                        style={styles.input}
                    />

                    {/* Test connection */}
                    <TouchableOpacity
                        style={styles.testButton}
                        onPress={handleTest}
                        disabled={test.kind === 'testing'}
                    >
                        {test.kind === 'testing' ? (
                            <ActivityIndicator color={COLORS.cyan} size="small" />
                        ) : (
                            <Text style={styles.testButtonText}>PROBAR CONEXIÓN</Text>
                        )}
                    </TouchableOpacity>

                    {test.kind === 'ok' && (
                        <View style={[styles.testResult, styles.testResultOk]}>
                            <Text style={styles.testResultIcon}>✓</Text>
                            <Text style={styles.testResultText}>
                                Conexión exitosa{test.status ? ` (HTTP ${test.status})` : ''}
                            </Text>
                        </View>
                    )}
                    {test.kind === 'error' && (
                        <View style={[styles.testResult, styles.testResultErr]}>
                            <Text style={styles.testResultIcon}>✕</Text>
                            <Text style={styles.testResultText}>
                                Falló: {test.message}
                            </Text>
                        </View>
                    )}

                    {/* WS preview */}
                    <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>WebSocket derivado:</Text>
                        <Text style={styles.metaValue}>{config.wsUrl}</Text>
                    </View>
                </View>

                {/* ── AR Preferences ── */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>AR — PREFERENCIAS</Text>

                    <View style={styles.toggleRow}>
                        <View style={styles.toggleTextWrap}>
                            <Text style={styles.toggleLabel}>Auto-pausa con batería &lt; 20%</Text>
                            <Text style={styles.toggleHint}>
                                Detiene streaming YOLO y Sentinel para evitar gastar batería.
                            </Text>
                        </View>
                        <Switch
                            value={config.lowBatteryAutoPause}
                            onValueChange={toggleAutoPause}
                            trackColor={{ false: '#333', true: COLORS.cyanDim }}
                            thumbColor={config.lowBatteryAutoPause ? COLORS.cyan : '#888'}
                        />
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.fieldRow}>
                        <View style={styles.toggleTextWrap}>
                            <Text style={styles.toggleLabel}>Duración Sentinel (s)</Text>
                            <Text style={styles.toggleHint}>
                                Tiempo que dura el modo ráfaga al activarlo.
                            </Text>
                        </View>
                        <TextInput
                            value={sentinelDraft}
                            onChangeText={setSentinelDraft}
                            keyboardType="number-pad"
                            maxLength={3}
                            style={styles.numberInput}
                        />
                    </View>
                </View>

                {/* Actions */}
                <View style={styles.actionsRow}>
                    <TouchableOpacity
                        style={[styles.actionBtn, styles.resetBtn]}
                        onPress={handleReset}
                    >
                        <Text style={styles.resetBtnText}>RESTABLECER</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.actionBtn,
                            styles.saveBtn,
                            (!dirty || saving) && styles.actionDisabled,
                        ]}
                        onPress={handleSave}
                        disabled={!dirty || saving}
                    >
                        {saving ? (
                            <ActivityIndicator color="#000" size="small" />
                        ) : (
                            <Text style={styles.saveBtnText}>GUARDAR</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
    flex: { flex: 1, backgroundColor: COLORS.background },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACING.lg,
        paddingBottom: SPACING.md,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backText: {
        color: COLORS.cyan,
        fontSize: 32,
        marginTop: -4,
    },
    title: {
        flex: 1,
        textAlign: 'center',
        color: COLORS.textPrimary,
        fontSize: FONT_SIZES.xl,
        letterSpacing: LETTER_SPACING.wider,
        fontWeight: '300',
    },
    content: {
        padding: SPACING.lg,
    },

    // Sections
    section: {
        backgroundColor: COLORS.backgroundSecondary,
        borderRadius: RADIUS.xl,
        padding: SPACING.lg,
        marginBottom: SPACING.lg,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    sectionTitle: {
        color: COLORS.cyan,
        fontSize: FONT_SIZES.md,
        letterSpacing: LETTER_SPACING.wider,
        marginBottom: SPACING.sm,
        fontWeight: '500',
    },
    sectionHint: {
        color: COLORS.textSecondary,
        fontSize: FONT_SIZES.md,
        marginBottom: SPACING.md,
        lineHeight: 18,
    },
    code: {
        color: COLORS.cyan,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },

    // Inputs
    input: {
        backgroundColor: COLORS.background,
        borderColor: COLORS.border,
        borderWidth: 1,
        borderRadius: RADIUS.md,
        color: COLORS.textPrimary,
        fontSize: FONT_SIZES.lg,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.md,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    numberInput: {
        backgroundColor: COLORS.background,
        borderColor: COLORS.border,
        borderWidth: 1,
        borderRadius: RADIUS.md,
        color: COLORS.textPrimary,
        fontSize: FONT_SIZES.lg,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        width: 80,
        textAlign: 'center',
    },

    // Test connection
    testButton: {
        backgroundColor: COLORS.cyanDim,
        borderColor: COLORS.cyan,
        borderWidth: 1,
        borderRadius: RADIUS.md,
        paddingVertical: SPACING.md,
        alignItems: 'center',
        marginTop: SPACING.md,
    },
    testButtonText: {
        color: COLORS.cyan,
        fontSize: FONT_SIZES.md,
        letterSpacing: LETTER_SPACING.wide,
        fontWeight: '600',
    },
    testResult: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
        marginTop: SPACING.md,
        paddingVertical: SPACING.sm,
        paddingHorizontal: SPACING.md,
        borderRadius: RADIUS.md,
    },
    testResultOk: {
        backgroundColor: 'rgba(0, 255, 136, 0.1)',
        borderWidth: 1,
        borderColor: COLORS.success,
    },
    testResultErr: {
        backgroundColor: 'rgba(255, 68, 68, 0.1)',
        borderWidth: 1,
        borderColor: COLORS.error,
    },
    testResultIcon: {
        color: COLORS.textPrimary,
        fontSize: FONT_SIZES.lg,
        fontWeight: 'bold',
    },
    testResultText: {
        color: COLORS.textPrimary,
        fontSize: FONT_SIZES.md,
        flex: 1,
    },

    // Meta
    metaRow: {
        marginTop: SPACING.md,
        paddingTop: SPACING.md,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
    },
    metaLabel: {
        color: COLORS.textMuted,
        fontSize: FONT_SIZES.sm,
        letterSpacing: LETTER_SPACING.wide,
        marginBottom: 4,
    },
    metaValue: {
        color: COLORS.textSecondary,
        fontSize: FONT_SIZES.md,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },

    // Toggle / field rows
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.md,
    },
    fieldRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.md,
    },
    toggleTextWrap: {
        flex: 1,
    },
    toggleLabel: {
        color: COLORS.textPrimary,
        fontSize: FONT_SIZES.lg,
        marginBottom: 2,
    },
    toggleHint: {
        color: COLORS.textMuted,
        fontSize: FONT_SIZES.sm,
        lineHeight: 16,
    },
    divider: {
        height: 1,
        backgroundColor: COLORS.border,
        marginVertical: SPACING.md,
    },

    // Actions
    actionsRow: {
        flexDirection: 'row',
        gap: SPACING.md,
    },
    actionBtn: {
        flex: 1,
        paddingVertical: SPACING.md,
        borderRadius: RADIUS.lg,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 50,
    },
    actionDisabled: { opacity: 0.4 },
    resetBtn: {
        backgroundColor: 'rgba(255, 68, 68, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255, 68, 68, 0.3)',
    },
    resetBtnText: {
        color: '#ff8888',
        fontSize: FONT_SIZES.md,
        letterSpacing: LETTER_SPACING.wide,
        fontWeight: '600',
    },
    saveBtn: {
        backgroundColor: COLORS.cyan,
    },
    saveBtnText: {
        color: '#000',
        fontSize: FONT_SIZES.md,
        letterSpacing: LETTER_SPACING.wide,
        fontWeight: '700',
    },
});
