/**
 * KEPLER Mobile - Root Navigator
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';

import type { RootStackParamList, MainTabParamList } from './types';

// Screens (to be implemented)
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import MapScreen from '../screens/MapScreen';
import ArchivesScreen from '../screens/ArchivesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ARCameraScreen from '../screens/ARCameraScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Tab Navigator
function MainTabs() {
    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: '#0a0a1a',
                    borderTopColor: '#1a1a3a',
                    height: 60,
                },
                tabBarActiveTintColor: '#00d4ff',
                tabBarInactiveTintColor: '#666',
            }}
        >
            <Tab.Screen
                name="Dashboard"
                component={DashboardScreen}
                options={{
                    tabBarLabel: 'Dashboard',
                    tabBarIcon: ({ color }) => <TabIcon name="dashboard" color={color} />,
                }}
            />
            <Tab.Screen
                name="Map"
                component={MapScreen}
                options={{
                    tabBarLabel: 'Mapa',
                    tabBarIcon: ({ color }) => <TabIcon name="map" color={color} />,
                }}
            />
            <Tab.Screen
                name="Archives"
                component={ArchivesScreen}
                options={{
                    tabBarLabel: 'Archivos',
                    tabBarIcon: ({ color }) => <TabIcon name="archive" color={color} />,
                }}
            />
            <Tab.Screen
                name="Profile"
                component={ProfileScreen}
                options={{
                    tabBarLabel: 'Perfil',
                    tabBarIcon: ({ color }) => <TabIcon name="profile" color={color} />,
                }}
            />
        </Tab.Navigator>
    );
}

// Simple icon component (placeholder)
function TabIcon({ name, color }: { name: string; color: string }) {
    const icons: Record<string, string> = {
        dashboard: '📊',
        map: '🗺️',
        archive: '📁',
        profile: '👤',
    };
    return (
        <React.Fragment>
            {/* Use Text for emoji icons for now */}
            <StatusBar style="light" />
        </React.Fragment>
    );
}

// Root Navigator
export default function RootNavigator() {
    const [isLoggedIn, setIsLoggedIn] = React.useState(false);

    // TODO: Check auth state from Supabase

    return (
        <NavigationContainer>
            <StatusBar style="light" />
            <Stack.Navigator
                screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: '#0a0a1a' },
                }}
            >
                {!isLoggedIn ? (
                    <Stack.Screen name="Login" component={LoginScreen} />
                ) : (
                    <>
                        <Stack.Screen name="Main" component={MainTabs} />
                        <Stack.Screen
                            name="ARCamera"
                            component={ARCameraScreen}
                            options={{
                                presentation: 'fullScreenModal',
                                animation: 'fade',
                            }}
                        />
                    </>
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
}
