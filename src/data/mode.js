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
 * Production is selected only when a backend URL is configured at build time
 * (VITE_BACKEND_URL). Absent that, we always run the in-memory local playground.
 * This keeps the default GitHub Pages deployment zero-config and login-free.
 *
 * @returns {RosterMode}
 */
export function detectMode() {
  const backendUrl = import.meta.env?.VITE_BACKEND_URL
  return backendUrl ? 'production' : 'local'
}
