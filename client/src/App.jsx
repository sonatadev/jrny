import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './js/auth'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import NewTripPage from './pages/NewTripPage'
import TripPage from './pages/TripPage'
import SharePage from './pages/SharePage'
import { useEffect, useState } from 'react'
import { joinViaLink } from './js/api'

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
          <Route path="/join/:token" element={<JoinPage />} />
          <Route path="/share/:token" element={<SharePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
