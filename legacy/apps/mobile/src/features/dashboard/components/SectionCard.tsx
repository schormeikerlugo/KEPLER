/**
 * SectionCard Component
 * Generic section card with onPress support and "VER TODO" button
 */

import React, { ReactNode } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from '../styles';

interface SectionCardProps {
    icon: ReactNode;
    title: string;
    count: number;
    onPress?: () => void;
    children?: ReactNode;
}

export function SectionCard({ icon, title, count, onPress, children }: SectionCardProps) {
    return (
        <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                    {icon}
                    <Text style={styles.sectionTitle}>{title}</Text>
                </View>
                <View style={styles.countBadge}>
                    <Text style={styles.countText}>{count}</Text>
                </View>
            </View>
            <View style={styles.sectionDivider} />
            {children || <Text style={styles.noDataText}>Sin datos disponibles</Text>}
            {onPress && (
                <TouchableOpacity style={styles.viewAllButton} onPress={onPress}>
                    <Text style={styles.viewAllText}>VER TODO ›</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}
