import { createClient } from '@supabase/supabase-js'

/**
 * Shared Supabase browser client.
 *
 * Configured entirely from build-time env vars so the same source can target a
 * local Supabase (`supabase start`) or a hosted project by swapping the values:
 *
 *   VITE_SUPABASE_URL       e.g. http://localhost:54321 or https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY  the project's public anon key (safe to ship)
 *
 * When both are absent the app runs in the login-free local YAML playground
 * (see ./mode.js) and this client is never created.
 */

const url = import.meta.env?.VITE_SUPABASE_URL
const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY

/**
 * The singleton client, or null when Supabase is not configured (local mode).
 * @type {import('@supabase/supabase-js').SupabaseClient | null}
 */
export const supabase = url && anonKey
  ? createClient(url, anonKey, {
      auth: {
        // Persist the session in localStorage and recover it from the OAuth
        // redirect hash on load — required for a static SPA on GitHub Pages
        // that has no server-side session handling.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
