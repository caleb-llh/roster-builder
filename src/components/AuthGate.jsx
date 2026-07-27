/**
 * Auth gate for production mode.
 *
 * - Local mode: renders children immediately (no auth, login-free playground).
 * - Production, still resolving session: a lightweight loading state.
 * - Production, no session: a centered "Sign in with Google" screen.
 * - Production, signed in: renders children.
 *
 * The gate lives outside <App/> so the whole app is only mounted once the user
 * is known, keeping the data provider's assumptions simple.
 */
export default function AuthGate({ auth, children }) {
  const { mode, loading, session, signInWithGoogle } = auth

  if (mode === 'local' || session) {
    return children
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        Loading…
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-lg">
        <h1 className="text-xl font-bold text-gray-900">Roster Builder</h1>
        <p className="mt-2 text-sm text-gray-500">Sign in to view and edit your rosters.</p>
        <button
          onClick={signInWithGoogle}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 active:scale-[0.99] touch-manipulation"
        >
          <img
            src="https://www.google.com/favicon.ico"
            alt=""
            className="h-4 w-4"
          />
          Continue with Google
        </button>
      </div>
    </div>
  )
}
