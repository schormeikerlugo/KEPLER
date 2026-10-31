/**
 * KEPLER Mobile - SVG Icons
 * 
 * Dashboard icons converted from web SVG files.
 * Uses react-native-svg for rendering.
 * 
 * @module components/icons
 */

import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

// =============================================================================
// TYPES
// =============================================================================

interface IconProps {
    /** Icon size (width and height) */
    size?: number;
    /** Stroke color */
    color?: string;
    /** Stroke width */
    strokeWidth?: number;
}

const DEFAULT_SIZE = 20;
const DEFAULT_COLOR = '#fff';
const DEFAULT_STROKE = 1.5;

// =============================================================================
// POIs Icon (Flag)
// =============================================================================

/**
 * POIs icon - wavy flag
 */
export function POIsIcon({
    size = DEFAULT_SIZE,
    color = DEFAULT_COLOR,
    strokeWidth = DEFAULT_STROKE
}: IconProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Path
                d="M4 21V15.6871M4 15.6871C9.81818 11.1377 14.1818 20.2363 20 15.6869V4.31347C14.1818 8.86284 9.81818 -0.236103 4 4.31327V15.6871Z"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

// =============================================================================
// Minerals Icon (Puzzle piece)
// =============================================================================

/**
 * Minerals icon - puzzle piece shape
 */
export function MineralsIcon({
    size = DEFAULT_SIZE,
    color = DEFAULT_COLOR,
    strokeWidth = DEFAULT_STROKE
}: IconProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Path
                d="M20 7H17.8486C17.3511 7 17 6.49751 17 6C17 4.34315 15.6569 3 14 3C12.3431 3 11 4.34315 11 6C11 6.49751 10.6488 7 10.1513 7H8C7.44771 7 7 7.44772 7 8V10.1513C7 10.6488 6.49751 11 6 11C4.34315 11 3 12.3431 3 14C3 15.6569 4.34315 17 6 17C6.49751 17 7 17.3511 7 17.8486V20C7 20.5523 7.44771 21 8 21L20 21C20.5523 21 21 20.5523 21 20V17.8486C21 17.3511 20.4975 17 20 17C18.3431 17 17 15.6569 17 14C17 12.3431 18.3431 11 20 11C20.4975 11 21 10.6488 21 10.1513L21 8C21 7.44772 20.5523 7 20 7Z"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

// =============================================================================
// Objects Icon (Nested squares)
// =============================================================================

/**
 * Objects icon - nested squares
 */
export function ObjectsIcon({
    size = DEFAULT_SIZE,
    color = DEFAULT_COLOR,
    strokeWidth = DEFAULT_STROKE
}: IconProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Path
                d="M4 7.2002V16.8002C4 17.9203 4 18.4801 4.21799 18.9079C4.40973 19.2842 4.71547 19.5905 5.0918 19.7822C5.5192 20 6.07899 20 7.19691 20H16.8031C17.921 20 18.48 20 18.9074 19.7822C19.2837 19.5905 19.5905 19.2842 19.7822 18.9079C20 18.4805 20 17.9215 20 16.8036V7.19691C20 6.07899 20 5.5192 19.7822 5.0918C19.5905 4.71547 19.2837 4.40973 18.9074 4.21799C18.4796 4 17.9203 4 16.8002 4H7.2002C6.08009 4 5.51962 4 5.0918 4.21799C4.71547 4.40973 4.40973 4.71547 4.21799 5.0918C4 5.51962 4 6.08009 4 7.2002Z"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <Path
                d="M15 13.4001V10.6001C15 10.04 14.9996 9.75981 14.8906 9.5459C14.7948 9.35774 14.6423 9.20487 14.4542 9.10899C14.2403 9 13.9597 9 13.3996 9H10.5996C10.0396 9 9.75981 9 9.5459 9.10899C9.35774 9.20487 9.20487 9.35774 9.10899 9.5459C9 9.75981 9 10.04 9 10.6001V13.4001C9 13.9601 9 14.2398 9.10899 14.4537C9.20487 14.6419 9.35774 14.7952 9.5459 14.8911C9.7596 15 10.039 15 10.598 15H13.4011C13.96 15 14.2405 15 14.4542 14.8911C14.6423 14.7952 14.7948 14.6419 14.8906 14.4537C14.9996 14.2398 15 13.9601 15 13.4001Z"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

// =============================================================================
// Missions Icon (Rocket)
// =============================================================================

/**
 * Missions icon - rocket
 */
export function MissionsIcon({
    size = DEFAULT_SIZE,
    color = DEFAULT_COLOR,
    strokeWidth = DEFAULT_STROKE
}: IconProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Path
                d="M12 15L9 18M12 15L15 18M12 15V21M19.4 14.6C20.4 12.8 21 10.6 21 8C21 6 18 2 12 2C6 2 3 6 3 8C3 10.6 3.6 12.8 4.6 14.6M8 10C8 11.1046 8.89543 12 10 12C11.1046 12 12 11.1046 12 10C12 8.89543 12.8954 8 14 8C15.1046 8 16 8.89543 16 10"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

// =============================================================================
// Menu Icon (Hamburger)
// =============================================================================

/**
 * Menu hamburger icon
 */
export function MenuIcon({
    size = DEFAULT_SIZE,
    color = '#000',
    strokeWidth = 2
}: IconProps) {
    const lineY = [6, 12, 18];
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            {lineY.map((y) => (
                <Path
                    key={y}
                    d={`M4 ${y}H20`}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                />
            ))}
        </Svg>
    );
}
