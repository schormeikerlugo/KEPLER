/**
 * Types Barrel Export
 * @module @kepler/shared/types
 * 
 * Re-exports all type definitions from individual modules
 */

// Mission types
export type {
    Mission,
    MissionStatus,
    MissionStartRequest,
    MissionSummary,
    ClimateSnapshot,
} from './mission';

// Detection types
export type {
    YOLODetection,
    TrackedDetection,
    DetectedObject,
    SaveObjectRequest,
    BoundingBox,
} from './detection';

// User types
export type {
    UserProfile,
    UserRank,
    AuthSession,
    LoginCredentials,
} from './user';

// Telemetry types
export type {
    TelemetryData,
    NetworkStatus,
    GeoLocation,
    DeviceInfo,
    Platform,
} from './telemetry';
