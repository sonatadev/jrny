import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../js/auth'
import { safeRedirect, withRedirect } from '../js/redirect'
import { register } from '../js/api'
import ParticlesBg from '../components/ParticlesBg'
import Icon from '../components/Icon'

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login: authLogin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Art. 8 GDPR: in Italia il consenso digitale è valido dai 14 anni
  const [ageOk, setAgeOk] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) { setError('Le password non coincidono'); return }
    if (form.password.length < 10) { setError('La password deve essere di almeno 10 caratteri'); return }
    if (!ageOk) { setError('Devi avere almeno 14 anni per registrarti'); return }
    setLoading(true)
    try {
      const res = await register({ name: form.name, email: form.email, password: form.password })
      authLogin(res.data.token, res.data.user)
      navigate(safeRedirect(location.search))
    } catch (err) {
      setError(err.response?.data?.error || 'Errore durante la registrazione')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <ParticlesBg count={30} color="var(--primary)" />

      <div className="auth-card" style={{ maxWidth: 480 }}>
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <Icon name="globe" size={34} color="#fff" />
          </div>
          <div className="auth-logo-text">jrny</div>
          <div className="auth-logo-sub">Il tuo diario di viaggio digitale</div>
        </div>

        <div className="glass-card" style={{ padding: '2rem' }}>
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)' }}>
            Crea il tuo account
          </h2>

          {error && (
            <div className="alert alert-error">
              <Icon name="warning" size={16} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Nome completo</label>
              <input className="form-control" type="text" required placeholder="Mario Rossi"
                value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-control" type="email" required placeholder="tu@esempio.it"
                value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Password</label>
                <input className="form-control" type="password" required placeholder="Min. 10 caratteri"
                  value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Conferma</label>
                <input className="form-control" type="password" required placeholder="Ripeti"
                  value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} />
              </div>
            </div>
            <label style={{ display: 'flex', gap: '.55rem', alignItems: 'flex-start', margin: '.9rem 0 .2rem', fontSize: '.82rem', color: 'var(--text-muted)', lineHeight: 1.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={ageOk} onChange={e => setAgeOk(e.target.checked)}
                style={{ marginTop: '.15rem', flexShrink: 0 }} />
              <span>
                Ho almeno 14 anni e ho letto l'<Link to="/privacy" target="_blank">informativa privacy</Link>
                {' '}e le <Link to="/termini" target="_blank">condizioni d'uso</Link>.
              </span>
            </label>
            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading || !ageOk}
              style={{ marginTop: '.5rem' }}>
              {loading
                ? <><span className="spinner" style={{ width:18, height:18, margin:0, borderWidth:2 }} /> Registrazione...</>
                : <><Icon name="check" size={18} /> Crea account</>}
            </button>
          </form>
        </div>

        <div className="auth-footer">
          Hai già un account? <Link to={withRedirect('/login', location.search)}>Accedi</Link>
        </div>
      </div>
    </div>
  )
}
