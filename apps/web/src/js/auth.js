import { createClient } from '@supabase/supabase-js';

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseUrl = envUrl.startsWith('/') ? window.location.origin + envUrl : envUrl;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn("Supabase credentials missing in .env");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export const auth = {
    async login(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        return { user: data.user, error };
    },

    async register(email, password) {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });
        return { user: data.user, error };
    },

    async logout() {
        const { error } = await supabase.auth.signOut();
        return { error };
    },

    async getUser() {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.user || null;
    },

    async getToken() {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token || null;
    }
};
