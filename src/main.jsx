import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { initTelegram } from './telegram'
import { useAuth } from './hooks/useAuth'
import AuthGate from './components/AuthGate'

initTelegram()

/**
 * Root wrapper: resolves auth once, gates the app behind sign-in in production
 * mode, and passes the auth handle to App (for the sign-out control). In local
 * mode AuthGate is a pass-through, so the playground renders unchanged.
 */
function Root() {
  const auth = useAuth()
  return (
    <AuthGate auth={auth}>
      <App auth={auth} />
    </AuthGate>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
