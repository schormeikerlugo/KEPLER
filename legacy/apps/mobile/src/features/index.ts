/**
 * Features Barrel Export
 * @module features
 * 
 * Central export for all feature modules
 * Mirrors the structure of apps/web/src/features/
 * 
 * Note: Export only main screens to avoid naming conflicts
 * For hooks/components/constants, import directly from feature module
 */

// Main Screens
export { DashboardScreen } from './dashboard';
export { MapScreen } from './map';

// Note: Import sub-modules directly when needed:
// import { useDashboardMenu } from '../features/dashboard/hooks';
// import { MapMenu } from '../features/map/components';
