/**
 * Profile Security Module
 * Handles security-related functionality
 */

import { auth, supabase } from '../../../js/auth.js';

/**
 * Setup security buttons (password change, logout all)
 */
export function setupSecurityButtons() {
    setupPasswordChange();
    setupLogoutAll();
}

/**
 * Password change button handler
 */
function setupPasswordChange() {
    const changePasswordBtn = document.getElementById('btn-change-password');
    if (!changePasswordBtn) return;

    changePasswordBtn.addEventListener('click', async () => {
        const user = await auth.getUser();
        if (!user?.email) {
            window.kepler?.notify?.warning('No se pudo obtener el email');
            return;
        }

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(user.email);
            if (error) throw error;
            window.kepler?.notify?.success('📧 Email enviado para cambiar contraseña');
        } catch (err) {
            console.error('Password reset error:', err);
            window.kepler?.notify?.warning('Error al enviar email');
        }
    });
}

/**
 * Logout all devices button handler
 */
function setupLogoutAll() {
    const logoutAllBtn = document.getElementById('btn-logout-all');
    if (!logoutAllBtn) return;

    logoutAllBtn.addEventListener('click', async () => {
        try {
            await supabase.auth.signOut({ scope: 'global' });
            window.location.href = '/login';
        } catch (err) {
            console.error('Logout error:', err);
            window.kepler?.notify?.warning('Error al cerrar sesión');
        }
    });
}
