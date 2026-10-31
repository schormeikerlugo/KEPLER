/**
 * Telemetry Types
 * @module @kepler/shared/types/telemetry
 */

/**
 * Network connection status
 */
export type NetworkStatus = 'online' | 'offline' | 'slow';

/**
 * System telemetry data point
 */
export interface TelemetryData {
    timestamp: string;
    cpu_usage: number;
    memory_usage: number;
    battery_level?: number;
    gps_accuracy?: number;
    network_status: NetworkStatus;
}

/**
 * GPS coordinates with accuracy
 */
export interface GeoLocation {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude?: number;
    heading?: number;
    speed?: number;
    timestamp: number;
}

/**
 * Device capabilities info
 */
export interface DeviceInfo {
    platform: Platform;
    os_version?: string;
    device_model?: string;
    has_camera: boolean;
    has_gps: boolean;
    memory_gb?: number;
}

/**
 * Platform identifier
 */
export type Platform = 'web' | 'desktop' | 'mobile';
