import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './js/auth'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import NewTripPage from './pages/NewTripPage'
import TripPage from './pages/TripPage'
import SharePage from './pages/SharePage'
import SettingsPage from './pages/SettingsPage'
import { useEffect, useState, lazy, Suspense } from 'react'

// L'editor note (TipTap) è pesante: caricato solo quando serve
const NotePage = lazy(() => import('./pages/NotePage'))
import { joinViaLink, claimInvitation } from './js/api'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="page-loading"><div className="spinner" /></div>
  return user ? children : <Navigate to="/login" replace />
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="page-loading"><div className="spinner" /></div>
  return user ? <Navigate to="/" replace /> : children
}

function JoinPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const [msg, setMsg] = useState('Elaborazione invito...')

  useEffect(() => {
    if (loading) return
    if (!user) { navigate(`/login?redirect=/join/${token}`, { replace: true }); return }
    joinViaLink(token)
      .then(r => navigate(`/trips/${r.data.tripId}`, { replace: true }))
      .catch(() => { setMsg('Link non valido o già utilizzato.') })
  }, [token, user, loading, navigate])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 1rem' }} />
        <p>{msg}</p>
      </div>
    </div>
  )
}

// Riscatto dell'invito ricevuto via email. Se non sei loggato ti manda al
// login (o alla registrazione) e ti riporta qui: il token viaggia solo
// nell'email, quindi aprire questo link è la prova di avere quella casella.
function InvitePage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const [msg, setMsg] = useState('Verifica invito...')

  useEffect(() => {
    if (loading) return
    if (!user) { navigate(`/login?redirect=/invito/${token}`, { replace: true }); return }
    claimInvitation(token)
      .then(r => navigate(`/trips/${r.data.tripId}`, { replace: true }))
      .catch(() => { setMsg('Invito non valido, già usato o scaduto.') })
  }, [token, user, loading, navigate])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 1rem' }} />
        <p>{msg}</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
          <Route path="/trips/new" element={<PrivateRoute><NewTripPage /></PrivateRoute>} />
          <Route path="/trips/:id" element={<PrivateRoute><TripPage /></PrivateRoute>} />
          <Route path="/trips/:id/note/:noteId" element={<PrivateRoute><Suspense fallback={<div className="page-loading"><div className="spinner" /></div>}><NotePage /></Suspense></PrivateRoute>} />
          <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
          <Route path="/join/:token" element={<JoinPage />} />
          <Route path="/invito/:token" element={<InvitePage />} />
          <Route path="/share/:token" element={<SharePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
