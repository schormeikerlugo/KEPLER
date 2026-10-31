import React from 'react';
import { View, ScrollView, SafeAreaView, Text, Image, TouchableOpacity, Dimensions, TextInput, Alert, Modal, FlatList } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { styles } from './styles';
import { COLORS, FONT_SIZES, SPACING } from '../../constants/config';
import { RootStackParamList } from '../../navigation/types';
import { api, Category, Subcategory, Tag } from '../../services/api';

type ObjectDetailRouteProp = RouteProp<RootStackParamList, 'ObjectDetail'>;

const { width, height } = Dimensions.get('window');

// Icon Mapping (Synced with Web)
const ICON_MAP: Record<string, string> = {
    'folder': '📁',
    'user': '👤',
    'paw': '🐾',
    'car': '🚗',
    'map-pin': '📍',
    'home': '🏠',
    'smartphone': '📱',
    'coffee': '☕',
    'alert-triangle': '⚠️',
    'briefcase': '💼',
    'leaf': '🌿',
    'building': '🏗️',
    'help-circle': '❓'
};

// Components
const SelectionModal = ({
    visible,
    onClose,
    title,
    items,
    onSelect
}: {
    visible: boolean;
    onClose: () => void;
    title: string;
    items: { id: string; nombre: string; color?: string; icono?: string; descripcion?: string }[];
    onSelect: (item: any) => void;
}) => (
    <Modal visible={visible} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' }}>
            <View style={{ height: height * 0.6, backgroundColor: '#1a1a1a', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>{title}</Text>
                    <TouchableOpacity onPress={onClose}>
                        <Text style={{ color: COLORS.cyan }}>Cerrar</Text>
                    </TouchableOpacity>
                </View>
                <FlatList
                    data={items}
                    keyExtractor={item => item.id}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={{
                                padding: 15,
                                borderBottomWidth: 1,
                                borderBottomColor: '#333',
                                flexDirection: 'row',
                                alignItems: 'center',
                                borderLeftWidth: 4,
                                borderLeftColor: item.color || '#333'
                            }}
                            onPress={() => { onSelect(item); onClose(); }}
                        >
                            <Text style={{ fontSize: 24, marginRight: 15 }}>
                                {ICON_MAP[item.icono || ''] || '📁'}
                            </Text>
                            <View>
                                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{item.nombre}</Text>
                                {item.descripcion && (
                                    <Text style={{ color: '#888', fontSize: 12 }}>{item.descripcion}</Text>
                                )}
                            </View>
                        </TouchableOpacity>
                    )}
                />
            </View>
        </View>
    </Modal>
);

export default function ObjectDetailScreen() {
    const navigation = useNavigation();
    const route = useRoute<ObjectDetailRouteProp>();
    const insets = useSafeAreaInsets();
    const { object: initialObject } = route.params;

    const [object, setObject] = React.useState(initialObject);
    const [isEditing, setIsEditing] = React.useState(false);
    const [saving, setSaving] = React.useState(false);

    // Taxonomy State
    const [categories, setCategories] = React.useState<Category[]>([]);
    const [subcategories, setSubcategories] = React.useState<Subcategory[]>([]);
    const [tags, setTags] = React.useState<Tag[]>([]);

    // Selection State
    const [selectedCat, setSelectedCat] = React.useState<Category | null>(null);
    const [selectedSub, setSelectedSub] = React.useState<Subcategory | null>(null);
    const [selectedTagIds, setSelectedTagIds] = React.useState<string[]>([]); // Strings only

    // Modals
    const [showCatModal, setShowCatModal] = React.useState(false);
    const [showSubModal, setShowSubModal] = React.useState(false);

    // Edit Form State (Text Fields)
    const [formData, setFormData] = React.useState({
        nombre: initialObject.nombre,
        description: initialObject.metadata?.description || initialObject.metadata?.descripcion || '',
    });

    // Load Taxonomy Data
    React.useEffect(() => {
        const loadTaxonomy = async () => {
            const [cats, allTags, objTax] = await Promise.all([
                api.getCategories(),
                api.getTags(),
                api.getObjectTaxonomy(object.id)
            ]);
            setCategories(cats);
            setTags(allTags);

            // Set initial selection logic
            if (objTax.categoria_id) {
                const cat = cats.find(c => c.id === objTax.categoria_id);
                if (cat) {
                    setSelectedCat(cat);
                    const subs = await api.getSubcategories(cat.id);
                    setSubcategories(subs);
                    if (objTax.subcategoria_id) {
                        setSelectedSub(subs.find(s => s.id === objTax.subcategoria_id) || null);
                    }
                }
            } else if (object.tipo) {
                // Fallback by name matching if no ID
                const cat = cats.find(c => c.nombre === object.tipo);
                if (cat) {
                    setSelectedCat(cat);
                    const subs = await api.getSubcategories(cat.id);
                    setSubcategories(subs);
                }
            }
            if (objTax.etiquetas) {
                setSelectedTagIds(objTax.etiquetas.map(t => t.id));
            }
        };
        loadTaxonomy();
    }, [object.id]);

    // Update Subcategories when Category changes
    const handleCategorySelect = async (cat: Category) => {
        setSelectedCat(cat);
        setSelectedSub(null); // Reset sub
        const subs = await api.getSubcategories(cat.id);
        setSubcategories(subs);
    };

    const toggleTag = (tagId: string) => {
        if (selectedTagIds.includes(tagId)) {
            setSelectedTagIds(prev => prev.filter(id => id !== tagId));
        } else {
            setSelectedTagIds(prev => [...prev, tagId]);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // 1. Update text metadata
            const textSuccess = await api.updateObject(object.id, {
                nombre: formData.nombre,
                description: formData.description,
            });

            // 2. Update taxonomy assignment
            const taxAssignment = {
                categoria_id: selectedCat?.id,
                subcategoria_id: selectedSub?.id,
                etiqueta_ids: selectedTagIds
            };
            const taxSuccess = await api.assignTaxonomy(object.id, taxAssignment);

            if (textSuccess && taxSuccess) {
                // Update local visual state
                setObject(prev => ({
                    ...prev,
                    nombre: formData.nombre,
                    tipo: selectedCat?.nombre || prev.tipo,
                    subcategoria: selectedSub?.nombre || prev.subcategoria,
                    metadata: {
                        ...prev.metadata,
                        description: formData.description
                    }
                }));
                setIsEditing(false);
                Alert.alert('Éxito', 'Objeto actualizado correctamente');
            } else {
                Alert.alert('Error', 'Hubo un problema al guardar algunos datos');
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
                    minHeight: multiline ? 100 : undefined,
                    textAlignVertical: multiline ? 'top' : 'center',
                    fontSize: 14
                }}
                value={formData[field]}
                onChangeText={(text) => setFormData(prev => ({ ...prev, [field]: text }))}
                multiline={multiline}
            />
        </View>
    );

    const renderSelector = (label: string, value: string | undefined, onPress: () => void, disabled = false, icon?: string, color?: string) => (
        <View style={{ marginBottom: 15 }}>
            <Text style={{ color: '#666', fontSize: 10, textTransform: 'uppercase', marginBottom: 5 }}>{label}</Text>
            <TouchableOpacity
                onPress={onPress}
                disabled={disabled}
                style={{
                    backgroundColor: '#1a1a1a',
                    padding: 12,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: color || '#333', // Use category color for border if selected
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    opacity: disabled ? 0.5 : 1
                }}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {icon && <Text style={{ fontSize: 18, marginRight: 10 }}>{icon}</Text>}
                    <Text style={{ color: value ? '#fff' : '#666', fontWeight: value ? '600' : 'normal' }}>
                        {value || `-- Seleccionar ${label} --`}
                    </Text>
                </View>
                <Text style={{ color: '#666' }}>▼</Text>
            </TouchableOpacity>
        </View>
    );

    const renderLabelValue = (label: string, value?: string, icon?: string, color?: string) => {
        if (!value && !isEditing) return null;
        return (
            <View style={{ marginBottom: 16 }}>
                <Text style={{ color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, marginTop: 4 }}>
                    {label.toUpperCase()}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                    {icon && <Text style={{ fontSize: 18, marginRight: 8 }}>{icon}</Text>}
                    <Text style={{
                        color: color || COLORS.textPrimary,
                        fontSize: FONT_SIZES.md,
                        fontWeight: color ? 'bold' : 'normal'
                    }}>
                        {value}
                    </Text>
                </View>
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
                        {isEditing ? 'EDITAR REGISTRO' : 'DETALLE'}
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

                {/* Image (Only in View Mode or Small in Edit Mode? Keep Full for now) */}
                <View style={{
                    width: width,
                    height: isEditing ? 200 : width,
                    backgroundColor: '#111',
                    borderBottomWidth: 1,
                    borderBottomColor: selectedCat?.color || COLORS.border, // Dynamic border
                    alignSelf: 'center'
                }}>
                    {object.metadata?.image_base64 ? (
                        <Image
                            source={{ uri: object.metadata.image_base64 }}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode="contain"
                        />
                    ) : (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 40 }}>📦</Text>
                        </View>
                    )}
                </View>

                {/* Main Info */}
                <View style={{ padding: 20 }}>
                    {isEditing ? (
                        <View>
                            {renderInput('Identificador / Nombre', 'nombre')}

                            {renderSelector(
                                'Categoría',
                                selectedCat?.nombre,
                                () => setShowCatModal(true),
                                false,
                                selectedCat ? (ICON_MAP[selectedCat.icono || ''] || '📁') : undefined,
                                selectedCat?.color
                            )}

                            {renderSelector(
                                'Subcategoría',
                                selectedSub?.nombre,
                                () => setShowSubModal(true),
                                !selectedCat
                            )}

                            {/* Tags Section */}
                            <Text style={{ color: '#666', fontSize: 10, textTransform: 'uppercase', marginBottom: 10 }}>ETIQUETAS</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 }}>
                                {tags.map(tag => {
                                    const isSelected = selectedTagIds.includes(tag.id);
                                    // Use tag color if available, else cyan
                                    const tagColor = tag.color || COLORS.cyan;

                                    return (
                                        <TouchableOpacity
                                            key={tag.id}
                                            onPress={() => toggleTag(tag.id)}
                                            style={{
                                                backgroundColor: isSelected ? `${tagColor}33` : '#1a1a1a', // 33 = 20% opacity
                                                borderColor: isSelected ? tagColor : '#333',
                                                borderWidth: 1,
                                                borderRadius: 20,
                                                paddingHorizontal: 12,
                                                paddingVertical: 6,
                                                marginRight: 8,
                                                marginBottom: 8
                                            }}
                                        >
                                            <Text style={{
                                                color: isSelected ? tagColor : '#888',
                                                fontSize: 12,
                                                fontWeight: isSelected ? 'bold' : 'normal'
                                            }}>
                                                {tag.nombre.toUpperCase()}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            {renderInput('Notas de Campo', 'description', true)}

                            <TouchableOpacity
                                style={{
                                    marginTop: 10,
                                    borderColor: '#ff4444',
                                    borderWidth: 1,
                                    padding: 15,
                                    borderRadius: 8,
                                    alignItems: 'center'
                                }}
                                onPress={() => Alert.alert('Eliminar', 'Función no implementada en demo')}
                            >
                                <Text style={{ color: '#ff4444', fontWeight: 'bold' }}>ELIMINAR</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            <Text style={{
                                color: selectedCat?.color || COLORS.cyan, // Use category color for title!
                                fontSize: FONT_SIZES.title,
                                fontWeight: 'bold',
                                marginBottom: 10
                            }}>
                                {object.nombre}
                            </Text>

                            <Text style={{ color: '#ccc', fontSize: FONT_SIZES.md, lineHeight: 22, marginBottom: 20 }}>
                                {object.metadata?.description || object.metadata?.descripcion || "Sin descripción disponible."}
                            </Text>

                            {/* Taxonomy Display */}
                            <View style={{
                                backgroundColor: selectedCat?.color ? `${selectedCat.color}10` : 'rgba(255,255,255,0.05)',
                                borderRadius: 12,
                                padding: 15,
                                marginBottom: 20,
                                borderWidth: 1,
                                borderColor: selectedCat?.color || COLORS.border
                            }}>
                                <Text style={{ color: '#888', fontSize: 10, textTransform: 'uppercase', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 5 }}>
                                    CLASIFICACIÓN
                                </Text>

                                {renderLabelValue(
                                    'Categoría',
                                    selectedCat?.nombre || object.tipo,
                                    selectedCat ? (ICON_MAP[selectedCat.icono || ''] || '📁') : undefined,
                                    selectedCat?.color
                                )}

                                {renderLabelValue('Subcategoría', selectedSub?.nombre || object.subcategoria)}
                            </View>

                            {/* Tags Display */}
                            {selectedTagIds.length > 0 && (
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 }}>
                                    {tags.filter(t => selectedTagIds.includes(t.id)).map(tag => (
                                        <View key={tag.id} style={{
                                            backgroundColor: `${tag.color || '#444'}20`,
                                            borderRadius: 4,
                                            paddingHorizontal: 8,
                                            paddingVertical: 4,
                                            marginRight: 6,
                                            borderWidth: 1,
                                            borderColor: tag.color || '#444'
                                        }}>
                                            <Text style={{ color: tag.color || '#ccc', fontSize: 10, fontWeight: 'bold' }}>
                                                {tag.nombre.toUpperCase()}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            )}

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


            {/* Selection Modals */}
            <SelectionModal
                visible={showCatModal}
                onClose={() => setShowCatModal(false)}
                title="Seleccionar Categoría"
                items={categories}
                onSelect={handleCategorySelect}
            />
            <SelectionModal
                visible={showSubModal}
                onClose={() => setShowSubModal(false)}
                title="Seleccionar Subcategoría"
                items={subcategories}
                onSelect={setSelectedSub}
            />
        </SafeAreaView>
    );
}
