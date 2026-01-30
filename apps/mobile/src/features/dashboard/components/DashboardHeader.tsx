/**
 * DashboardHeader Component
 * Header tile with logo, status indicator, and menu button
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from '../styles';

interface DashboardHeaderProps {
    isSystemOnline: boolean;
    onStatusPress: () => void;
    onMenuPress: () => void;
}

export function DashboardHeader({
    isSystemOnline,
    onStatusPress,
    onMenuPress,
}: DashboardHeaderProps) {
    return (
        <View style={styles.headerTile}>
            <Text style={styles.logo}>K E P L E R</Text>
            <View style={styles.headerRight}>
                {/* Status Dropdown */}
                <TouchableOpacity
                    style={styles.statusIndicator}
                    onPress={onStatusPress}
                >
                    <View style={[styles.statusDot, !isSystemOnline && styles.statusDotOffline]} />
                    <Text style={styles.statusArrow}>▼</Text>
                </TouchableOpacity>

                {/* Menu Button */}
                <TouchableOpacity
                    style={styles.menuButton}
                    onPress={onMenuPress}
                >
                    <View style={styles.menuLine} />
                    <View style={styles.menuLine} />
                    <View style={styles.menuLine} />
                </TouchableOpacity>
            </View>
        </View>
    );
}
