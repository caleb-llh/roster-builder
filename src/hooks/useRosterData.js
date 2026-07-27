import { detectMode } from '../data/mode'
import { useLocalRosterProvider } from '../data/useLocalRosterProvider'
import { useSupabaseRosterProvider } from '../data/useSupabaseRosterProvider'

/**
 * Dual-mode roster data hook.
 *
 * This is a thin dispatcher: it picks a provider based on the runtime mode and
 * returns it unchanged. Both providers satisfy the same contract
 * (see ../data/providerContract.js), so components consuming this hook never
 * branch on mode — they read `data`, gate UI on `permissions`, and call the
 * async mutations uniformly.
 *
 *  - local      : in-memory YAML playground (useLocalRosterProvider)
 *  - production : backend + auth + DB (useSupabaseRosterProvider — stub for now)
 *
 * Note: mode is fixed for the life of the app, so calling exactly one provider
 * hook per render keeps the Rules of Hooks satisfied.
 *
 * @returns {import('../data/providerContract').RosterProvider}
 */
export function useRosterData() {
  const mode = detectMode()

  // One provider hook is invoked unconditionally per render. `mode` is constant
  // for the app lifetime, so this does not violate the Rules of Hooks.
  const local = mode === 'local' ? useLocalRosterProvider() : null
  const production = mode === 'production' ? useSupabaseRosterProvider() : null

  return local ?? production
}
