/**
 * KEPLER Mobile - Navigation Types
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

// Root Stack
export type RootStackParamList = {
    Login: undefined;
    Main: undefined;
    ARCamera: { missionId?: string };
    ObjectDetail: { objectId: string };
    MissionDetail: { missionId: string };
};

// Tab Navigator
export type MainTabParamList = {
    Dashboard: undefined;
    Map: undefined;
    Archives: undefined;
    Profile: undefined;
};

// Screen Props
export type RootStackScreenProps<T extends keyof RootStackParamList> =
    NativeStackScreenProps<RootStackParamList, T>;

export type MainTabScreenProps<T extends keyof MainTabParamList> =
    BottomTabScreenProps<MainTabParamList, T>;
