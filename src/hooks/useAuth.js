import { useState, useEffect } from 'react'
import { supabase } from '../data/supabaseClient'
import { detectMode } from '../data/mode'

/**
 * Authentication state for production mode.
 *
 * In local mode there is no auth: the hook reports a ready, session-less state
 * with sign-in disabled, so the app can render its login-free playground.
 *
 * In production mode it tracks the Supabase session (Google OAuth) and exposes
 * sign-in / sign-out. `loading` is true until the initial session lookup
 * resolves — including recovering a session from the OAuth redirect hash on a
 * fresh page load (GitHub Pages has no server, so this happens client-side).
 *
 * @returns {{
 *   mode: 'local' | 'production',
 *   loading: boolean,
 *   session: import('@supabase/supabase-js').Session | null,
 *   user: import('@supabase/supabase-js').User | null,
 *   signInWithGoogle: () => Promise<void>,
 *   signOut: () => Promise<void>,
 * }}
 */
export function useAuth() {
  const mode = detectMode()
  const [session, setSession] = useState(null)
  // Local mode is never "loading" — there is nothing to await.
  const [loading, setLoading] = useState(mode === 'production')

  useEffect(() => {
    if (mode !== 'production' || !supabase) return

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null)
      setLoading(false)
    })

    return () => sub.subscription.unsubscribe()
  }, [mode])

  const signInWithGoogle = async () => {
    if (!supabase) return
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      // Return to the app's own origin+path. On GitHub Pages this is the
      // project subpath (BASE_URL); Supabase parses the session from the hash.
      options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
    })
  }

  const signOut = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  return {
    mode,
    loading,
    session,
    user: session?.user ?? null,
    signInWithGoogle,
    signOut,
  }
}
