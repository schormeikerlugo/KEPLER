/**
 * SectionCard Component
 * Generic section card for POIs, Minerals, Objects
 */

import React, { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { styles } from '../styles';

interface SectionCardProps {
    icon: ReactNode;
    title: string;
    count: number;
    children?: ReactNode;
}

export function SectionCard({
    icon,
    title,
    count,
    children,
}: SectionCardProps) {
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
            {children || <Text style={styles.noDataText}>No data available</Text>}
        </View>
    );
}
