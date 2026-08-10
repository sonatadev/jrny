import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { resetPassword } from '../js/api'
import ParticlesBg from '../components/ParticlesBg'
import Icon from '../components/Icon'

export default function ResetPasswordPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Le due password non coincidono'); return }
    setLoading(true)
    try {
      await resetPassword({ token, password })
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err.response?.data?.error || 'Link non valido o scaduto')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <ParticlesBg count={30} color="var(--primary)" />
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon"><Icon name="plane" size={34} color="#fff" /></div>
          <div className="auth-logo-text">jrny</div>
          <div className="auth-logo-sub">Nuova password</div>
        </div>

        <div className="glass-card" style={{ padding: '2rem' }}>
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)' }}>
            Scegli una nuova password
          </h2>

          {error && (
            <div className="alert alert-error">
              <Icon name="warning" size={16} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Nuova password</label>
              <input className="form-control" type="password" required minLength={10}
                placeholder="Almeno 10 caratteri"
                value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Conferma password</label>
              <input className="form-control" type="password" required minLength={10}
                value={confirm} onChange={e => setConfirm(e.target.value)} />
            </div>
            <button className="btn btn-primary w-full" type="submit" disabled={loading}>
              {loading ? 'Salvataggio...' : 'Salva e accedi'}
            </button>
          </form>

          <p style={{ marginTop: '1rem', fontSize: '.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Salvando la nuova password verranno chiuse tutte le sessioni aperte,
            su questo e su ogni altro dispositivo.
          </p>
        </div>

        <div className="auth-footer">
          <Link to="/login">Torna all'accesso</Link>
        </div>
      </div>
    </div>
  )
}
