/**
 * useDeviceTelemetry — Local-only sensors (battery + network)
 *
 * Updates every 2s. Does NOT touch the backend. The values returned here
 * are merged into the global TelemetryData by the dashboard.
 *
 * Battery uses `expo-battery` (real device level + charging state).
 * Network uses `expo-network` (built into Expo SDK) for connection type.
 */

import { useEffect, useState } from 'react';

export interface DeviceTelemetry {
    battery: number;             // 0-100
    battery_charging: boolean;
    link: number;                // % (rough heuristic from connection type)
    link_type: string;           // wifi | cellular | none
    available: boolean;          // false if expo-battery not installed
}

const DEFAULTS: DeviceTelemetry = {
    battery: 100,
    battery_charging: false,
    link: 0,
    link_type: 'unknown',
    available: false,
};

const LOCAL_INTERVAL_MS = 2000;

/** Map connection types to a rough quality % for the LINK indicator */
function linkPctFromType(type: string | undefined): number {
    if (!type) return 0;
    const t = type.toLowerCase();
    if (t.includes('wifi')) return 100;
    if (t.includes('5g')) return 95;
    if (t.includes('4g') || t.includes('lte')) return 80;
    if (t.includes('3g')) return 50;
    if (t.includes('2g')) return 25;
    if (t.includes('cellular')) return 70;
    if (t.includes('none')) return 0;
    return 50;
}

export function useDeviceTelemetry(): DeviceTelemetry {
    const [state, setState] = useState<DeviceTelemetry>(DEFAULTS);

    useEffect(() => {
        let cancelled = false;
        let intervalId: ReturnType<typeof setInterval> | null = null;
        let batterySub: { remove: () => void } | null = null;
        let chargingSub: { remove: () => void } | null = null;

        async function start() {
            // Lazy-import so the hook doesn't crash if expo-battery isn't yet
            // installed on a given build (graceful degrade to defaults).
            let Battery: any = null;
            let Network: any = null;
            try {
                // @ts-ignore — optional dependency, resolved at runtime
                Battery = await import('expo-battery');
            } catch (e) {
                console.warn('[useDeviceTelemetry] expo-battery missing:', e);
            }
            try {
                // @ts-ignore — optional dependency, resolved at runtime
                Network = await import('expo-network');
            } catch (e) {
                console.warn('[useDeviceTelemetry] expo-network missing:', e);
            }

            const sample = async () => {
                if (cancelled) return;

                let battery = DEFAULTS.battery;
                let charging = DEFAULTS.battery_charging;
                let link = 0;
                let linkType = 'unknown';
                let available = false;

                if (Battery) {
                    try {
                        const lvl = await Battery.getBatteryLevelAsync();
                        const stateNum = await Battery.getBatteryStateAsync();
                        battery = Math.round(lvl * 100);
                        charging = stateNum === Battery.BatteryState.CHARGING
                            || stateNum === Battery.BatteryState.FULL;
                        available = true;
                    } catch (e) {
                        // fall through with defaults
                    }
                }

                if (Network) {
                    try {
                        const ns = await Network.getNetworkStateAsync();
                        linkType = ns?.type || 'unknown';
                        link = ns?.isConnected ? linkPctFromType(linkType) : 0;
                    } catch (e) {
                        // ignore
                    }
                }

                if (!cancelled) {
                    setState({
                        battery,
                        battery_charging: charging,
                        link,
                        link_type: linkType,
                        available,
                    });
                }
            };

            // Reactive battery listeners (don't wait for the 2s tick)
            if (Battery) {
                try {
                    batterySub = Battery.addBatteryLevelListener(({ batteryLevel }: any) => {
                        if (cancelled) return;
                        setState(prev => ({ ...prev, battery: Math.round(batteryLevel * 100) }));
                    });
                    chargingSub = Battery.addBatteryStateListener(({ batteryState }: any) => {
                        if (cancelled) return;
                        const charging = batteryState === Battery.BatteryState.CHARGING
                            || batteryState === Battery.BatteryState.FULL;
                        setState(prev => ({ ...prev, battery_charging: charging }));
                    });
                } catch (e) {
                    // listeners optional
                }
            }

            // Initial + interval polling (network has no listener API)
            await sample();
            intervalId = setInterval(sample, LOCAL_INTERVAL_MS);
        }

        start();

        return () => {
            cancelled = true;
            if (intervalId) clearInterval(intervalId);
            if (batterySub) batterySub.remove();
            if (chargingSub) chargingSub.remove();
        };
    }, []);

    return state;
}
