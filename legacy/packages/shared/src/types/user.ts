/**
 * User Types
 * @module @kepler/shared/types/user
 */

/**
 * User profile from database
 */
export interface UserProfile {
    id: string;
    email: string;
    nombre?: string;
    avatar_url?: string;
    ai_avatar_url?: string;
    rango?: UserRank;
    xp?: number;
    created_at: string;
}

/**
 * User rank levels
 */
export type UserRank =
    | 'Novato'
    | 'Explorador'
    | 'Investigador'
    | 'Experto'
    | 'Maestro';

/**
 * Auth session info
 */
export interface AuthSession {
    user_id: string;
    email: string;
    access_token: string;
    refresh_token?: string;
    expires_at: number;
}

/**
 * Login credentials
 */
export interface LoginCredentials {
    email: string;
    password: string;
}
