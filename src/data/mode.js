/**
 * Runtime mode detection for the dual-mode data layer.
 *
 * The same GitHub Pages bundle can run in two modes:
 *  - 'local'      : YAML-in-memory, no auth, no persistence (default playground).
 *  - 'production' : backed by a remote backend (Supabase) with auth + DB + RBAC.
 *
 * Mode is decided once at runtime. Components MUST NOT branch on mode; they read
 * data and call mutations through the provider contract, which behaves uniformly
 * in both modes (see ./providerContract.js).
 */

/** @typedef {'local' | 'production'} RosterMode */

/**
 * Detect the active mode.
 *
 * Production is selected only when Supabase is configured at build time
 * (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY). Absent those, we always run the
 * in-memory local playground. This keeps the default GitHub Pages deployment
 * zero-config and login-free, and lets the same bundle target a local
 * `supabase start` or a hosted project purely via env vars.
 *
 * @returns {RosterMode}
 */
export function detectMode() {
  const url = import.meta.env?.VITE_SUPABASE_URL
  const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY
  return url && anonKey ? 'production' : 'local'
}
