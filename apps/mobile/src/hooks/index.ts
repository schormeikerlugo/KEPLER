/**
 * KEPLER Mobile - Hooks Index
 * 
 * Barrel file for easy hook imports.
 * 
 * @module hooks
 * 
 * @example
 * import { useTelemetry, useSystemStatus, useMissions } from '@/hooks';
 */

// API hooks
export {
    useTelemetry,
    useSystemStatus,
    useMissions
} from './useApi';

// Animation hooks
export {
    useScanAnimation,
    useGlowAnimation
} from './useApi';

// Shared menu hook
export { useSharedMenu } from './useSharedMenu';
