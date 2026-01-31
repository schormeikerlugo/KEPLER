import React from 'react';
import { View, ScrollView, SafeAreaView, Text, Image, TouchableOpacity, Dimensions, TextInput, Alert } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { styles } from './styles';
import { COLORS, FONT_SIZES, SPACING } from '../../constants/config';
import { RootStackParamList } from '../../navigation/types';
import { api } from '../../services/api';

type ObjectDetailRouteProp = RouteProp<RootStackParamList, 'ObjectDetail'>;

const { width } = Dimensions.get('window');

export default function ObjectDetailScreen() {
    const navigation = useNavigation();
    const route = useRoute<ObjectDetailRouteProp>();
    const insets = useSafeAreaInsets();
    const { object: initialObject } = route.params;

    const [object, setObject] = React.useState(initialObject);
    const [isEditing, setIsEditing] = React.useState(false);
    const [saving, setSaving] = React.useState(false);

    // Edit Form State
    const [formData, setFormData] = React.useState({
        nombre: initialObject.nombre,
        description: initialObject.metadata?.description || initialObject.metadata?.descripcion || '',
        tipo: initialObject.tipo,
        subcategoria: initialObject.subcategoria || '',
        genero: initialObject.genero || ''
    });

    const handleSave = async () => {
        setSaving(true);
        try {
            const success = await api.updateObject(object.id, {
                nombre: formData.nombre,
                description: formData.description,
                tipo: formData.tipo,
                subcategoria: formData.subcategoria,
                genero: formData.genero
            });

            if (success) {
                setObject(prev => ({
                    ...prev,
                    nombre: formData.nombre,
                    tipo: formData.tipo,
                    subcategoria: formData.subcategoria,
                    genero: formData.genero,
                    metadata: {
                        ...prev.metadata,
                        description: formData.description,
                        descripcion: formData.description
                    }
                }));
                setIsEditing(false);
                Alert.alert('Éxito', 'Objeto actualizado correctamente');
            } else {
                Alert.alert('Error', 'No se pudieron guardar los cambios');
            }
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'Ocurrió un error al guardar');
        } finally {
            setSaving(false);
        }
    };

    const renderInput = (label: string, field: keyof typeof formData, multiline = false) => (
        <View style={{ marginBottom: 15 }}>
            <Text style={{ color: '#666', fontSize: 10, textTransform: 'uppercase', marginBottom: 5 }}>{label}</Text>
            <TextInput
                style={{
                    backgroundColor: '#1a1a1a',
                    color: '#fff',
                    padding: 12,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: '#333',
                    minHeight: multiline ? 80 : undefined,
                    textAlignVertical: multiline ? 'top' : 'center'
                }}
                value={formData[field]}
                onChangeText={(text) => setFormData(prev => ({ ...prev, [field]: text }))}
                multiline={multiline}
            />
        </View>
    );

    const renderLabelValue = (label: string, value?: string | number, isTag = false) => {
        if (!value && !isEditing) return null;
        return (
            <View style={{ marginBottom: 16 }}>
                <Text style={{
                    color: COLORS.textSecondary,
                    fontSize: FONT_SIZES.sm,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    marginBottom: 4
                }}>
                    {label}
                </Text>
                {isTag ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                        <View style={{
                            backgroundColor: 'rgba(63, 168, 255, 0.15)',
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 4,
                            borderWidth: 1,
                            borderColor: 'rgba(63, 168, 255, 0.3)'
                        }}>
                            <Text style={{ color: COLORS.cyan, fontSize: FONT_SIZES.md, fontWeight: '600' }}>
                                {value}
                            </Text>
                        </View>
                    </View>
                ) : (
                    <Text style={{ color: COLORS.textPrimary, fontSize: FONT_SIZES.md }}>
                        {value}
                    </Text>
                )}
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: '#000' }]}>
            {/* Header */}
            <View style={{
                paddingHorizontal: 20,
                paddingVertical: 15,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottomWidth: 1,
                borderBottomColor: COLORS.border
            }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 5 }}>
                        <Text style={{ color: COLORS.cyan, fontSize: 24 }}>←</Text>
                    </TouchableOpacity>
                    <Text style={{
                        color: '#fff',
                        fontSize: FONT_SIZES.lg,
                        fontWeight: 'bold',
                        marginLeft: 15,
                        letterSpacing: 1
                    }}>
                        {isEditing ? 'EDITAR OBJETO' : 'DETALLE'}
                    </Text>
                </View>

                <TouchableOpacity
                    onPress={() => isEditing ? handleSave() : setIsEditing(true)}
                    disabled={saving}
                    style={{
                        backgroundColor: isEditing ? COLORS.cyan : 'transparent',
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: COLORS.cyan
                    }}
                >
                    <Text style={{ color: isEditing ? '#000' : COLORS.cyan, fontWeight: 'bold', fontSize: 12 }}>
                        {saving ? '...' : (isEditing ? 'GUARDAR' : 'EDITAR')}
                    </Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
                {/* Image Section */}
                <View style={{
                    width: width,
                    height: width, // Square aspect ratio
                    backgroundColor: '#111',
                    borderBottomWidth: 1,
                    borderBottomColor: COLORS.border
                }}>
                    {object.metadata?.image_base64 ? (
                        <Image
                            source={{ uri: object.metadata.image_base64 }}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode="contain"
                        />
                    ) : (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 60 }}>📦</Text>
                            <Text style={{ color: '#666', marginTop: 10 }}>Sin Imagen</Text>
                        </View>
                    )}
                </View>

                {/* Main Info */}
                <View style={{ padding: 20 }}>
                    {isEditing ? (
                        <View>
                            {renderInput('Nombre', 'nombre')}
                            {renderInput('Descripción', 'description', true)}

                            <View style={{ height: 1, backgroundColor: '#333', marginVertical: 15 }} />
                            <Text style={{ color: '#888', marginBottom: 10, fontWeight: 'bold' }}>TAXONOMÍA</Text>

                            {renderInput('Categoría (Clase)', 'tipo')}
                            {renderInput('Subcategoría', 'subcategoria')}
                            {renderInput('Género', 'genero')}
                        </View>
                    ) : (
                        <>
                            <Text style={{
                                color: COLORS.cyan,
                                fontSize: FONT_SIZES.title,
                                fontWeight: 'bold',
                                marginBottom: 10
                            }}>
                                {object.nombre}
                            </Text>

                            <Text style={{ color: '#ccc', fontSize: FONT_SIZES.md, lineHeight: 22, marginBottom: 20 }}>
                                {object.metadata?.description || object.metadata?.descripcion || "Sin descripción disponible."}
                            </Text>

                            {/* Taxonomy Grid */}
                            <View style={{
                                backgroundColor: 'rgba(255,255,255,0.05)',
                                borderRadius: 12,
                                padding: 15,
                                marginBottom: 20,
                                borderWidth: 1,
                                borderColor: COLORS.border
                            }}>
                                <Text style={{
                                    color: '#888',
                                    fontSize: 10,
                                    textTransform: 'uppercase',
                                    marginBottom: 15,
                                    borderBottomWidth: 1,
                                    borderBottomColor: '#333',
                                    paddingBottom: 5
                                }}>
                                    CLASIFICACIÓN TAXONÓMICA
                                </Text>

                                {renderLabelValue('Categoría', object.tipo, true)}
                                {renderLabelValue('Subcategoría', object.subcategoria)}
                                {renderLabelValue('Género', object.genero)}
                            </View>

                            {/* Metadata Grid */}
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                <View style={{ width: '50%' }}>
                                    {renderLabelValue('Confianza IA',
                                        object.metadata?.confidence
                                            ? `${Math.round(object.metadata.confidence * 100)}%`
                                            : 'N/A'
                                    )}
                                </View>
                                <View style={{ width: '50%' }}>
                                    {renderLabelValue('Fecha', new Date(object.created_at).toLocaleDateString())}
                                </View>
                                <View style={{ width: '100%' }}>
                                    {renderLabelValue('ID Registro', object.id)}
                                </View>
                                <View style={{ width: '100%' }}>
                                    {renderLabelValue('Origen', object.metadata?.source || 'Desconocido')}
                                </View>
                            </View>
                        </>
                    )}

                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
