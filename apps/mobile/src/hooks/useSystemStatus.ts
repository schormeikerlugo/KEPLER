import { useState, useEffect, useCallback } from 'react';
import { api, SystemStatus } from '../services/api';

export interface UseSystemStatusReturn {
    systemStatus: SystemStatus;
    isOnline: boolean;
    checkStatus: () => Promise<void>;
    isChecking: boolean;
}

export function useSystemStatus(): UseSystemStatusReturn {
    const [systemStatus, setSystemStatus] = useState<SystemStatus>({
        backend: false,
        supabase: false,
        ollama: false,
    });
    const [isChecking, setIsChecking] = useState(false);

    const checkStatus = useCallback(async () => {
        setIsChecking(true);
        try {
            const status = await api.getSystemStatus();
            setSystemStatus(status || { backend: false, supabase: false, ollama: false });
        } catch (e) {
            console.error('Status check failed', e);
            setSystemStatus({ backend: false, supabase: false, ollama: false });
        } finally {
            setIsChecking(false);
        }
    }, []);

    // Initial check and periodic polling (every 30s instead of 5s to save battery on non-dashboard screens)
    useEffect(() => {
        checkStatus();
        const interval = setInterval(checkStatus, 30000);
        return () => clearInterval(interval);
    }, [checkStatus]);

    return {
        systemStatus,
        isOnline: systemStatus.backend,
        checkStatus,
        isChecking
    };
}
