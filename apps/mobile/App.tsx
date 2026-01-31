/**
 * KEPLER Mobile - Main App
 * Stack navigation with hamburger menu (no bottom tabs)
 */
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

// Screens
import DashboardScreen from './src/screens/DashboardScreen';
import MapScreen from './src/screens/MapScreen';
import ArchivesScreen from './src/screens/ArchivesScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import LoginScreen from './src/screens/LoginScreen';
import ARCameraScreen from './src/screens/ARCameraScreen';
import MissionDetailScreen from './src/screens/MissionDetailScreen';

// Types
export type RootStackParamList = {
  Login: undefined;
  Dashboard: undefined;
  Map: undefined;
  Archives: undefined;
  Profile: undefined;
  MissionDetail: { missionId: string };
  ARCamera: { missionId?: string };
};

import { supabase } from './src/services/supabase';
import { Session } from '@supabase/supabase-js';

// ... Screens ...

// ... Types ...

const Stack = createNativeStackNavigator<RootStackParamList>();

// Main App
export default function App() {
  const [session, setSession] = useState<Session | null>(null);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
  }, []);

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#000' },
          animation: 'fade',
        }}
      >
        {!session ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Dashboard" component={DashboardScreen} />
            <Stack.Screen name="Map" component={MapScreen} />
            <Stack.Screen name="Archives" component={ArchivesScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="MissionDetail" component={MissionDetailScreen} />
            <Stack.Screen
              name="ARCamera"
              component={ARCameraScreen}
              options={{
                presentation: 'fullScreenModal',
                animation: 'slide_from_bottom',
              }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
