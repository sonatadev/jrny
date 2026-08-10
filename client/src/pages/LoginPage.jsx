import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../js/auth'
import { login } from '../js/api'
import { safeRedirect, withRedirect } from '../js/redirect'
import ParticlesBg from '../components/ParticlesBg'
import Icon from '../components/Icon'

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login: authLogin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await login(form)
      authLogin(res.data.token, res.data.user)
      navigate(safeRedirect(location.search))
    } catch (err) {
      setError(err.response?.data?.error || 'Credenziali non valide')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <ParticlesBg count={30} color="var(--primary)" />

      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <Icon name="plane" size={34} color="#fff" />
          </div>
          <div className="auth-logo-text">jrny</div>
          <div className="auth-logo-sub">Organizza i tuoi viaggi con stile</div>
        </div>

        <div className="glass-card" style={{ padding: '2rem' }}>
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)' }}>
            Bentornato
          </h2>

          {error && (
            <div className="alert alert-error">
              <Icon name="warning" size={16} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-control" type="email" required placeholder="tu@esempio.it"
                value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: '1.6rem' }}>
              <label className="form-label">Password</label>
              <input className="form-control" type="password" required placeholder="••••••••"
                value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            </div>
            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
              {loading
                ? <><span className="spinner" style={{ width:18, height:18, margin:0, borderWidth:2 }} /> Accesso...</>
                : <><Icon name="plane" size={18} /> Accedi</>}
            </button>
          </form>
        </div>

        <div className="auth-footer">
          Non hai un account? <Link to={withRedirect('/register', location.search)}>Registrati gratuitamente</Link>
        </div>
      </div>
    </div>
  )
}
