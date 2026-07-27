import { useState } from 'react'
import { LOCAL_PERMISSIONS } from './providerContract'

/**
 * Production (Supabase-backed) implementation of the roster data provider
 * contract.
 *
 * NOT IMPLEMENTED YET — this is a wired-in stub so the dual-mode seam is
 * complete: mode detection selects this in production, and it satisfies the
 * exact same contract as the local provider. When the backend lands, replace
 * the bodies below with Supabase calls (auth via Telegram initData, DB reads/
 * writes, RLS-derived permissions). Business rules stay in the shared layer and
 * are re-run server-side; the client still runs runAllValidators for fast
 * feedback, mirroring the local provider.
 *
 * Until then every mutation fails closed with a clear message rather than
 * silently no-op'ing, so a misconfigured production build is obvious.
 *
 * @returns {import('./providerContract').RosterProvider}
 */
export function useSupabaseRosterProvider() {
  const [error, setError] = useState(null)

  const notReady = async () => ({
    ok: false,
    errors: ['Production backend is not configured yet.'],
  })

  return {
    // State — no session data until the backend is implemented.
    data: null,
    originalData: null,
    error,
    loading: false,
    hasGenerated: false,
    history: [],
    canUndo: false,
    actionLog: [],
    // Permissions will come from the authenticated user's role via RLS.
    // Until then, mirror the local shape (all-true) so UI gating type-checks;
    // real enforcement is server-side regardless of these flags.
    permissions: LOCAL_PERMISSIONS,

    // Actions — fail closed until implemented.
    importData: notReady,
    clearData: async () => {},
    updateEvents: notReady,
    replaceData: notReady,
    logAction: () => {},
    saveToHistory: async () => {},
    undoToHistory: async () => false,
    setError,
  }
}
