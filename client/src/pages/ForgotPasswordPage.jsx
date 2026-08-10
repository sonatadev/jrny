import { useState } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../js/api'
import ParticlesBg from '../components/ParticlesBg'
import Icon from '../components/Icon'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    // La risposta del server è volutamente identica in ogni caso: non deve
    // rivelare se l'indirizzo è registrato. Anche qui mostriamo lo stesso
    // messaggio, altrimenti l'informazione trapelerebbe dall'interfaccia.
    try { await forgotPassword({ email }) } catch { /* stesso esito */ }
    setSent(true)
    setLoading(false)
  }

  return (
    <div className="auth-page">
      <ParticlesBg count={30} color="var(--primary)" />
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon"><Icon name="plane" size={34} color="#fff" /></div>
          <div className="auth-logo-text">jrny</div>
          <div className="auth-logo-sub">Recupero password</div>
        </div>

        <div className="glass-card" style={{ padding: '2rem' }}>
          {sent ? (
            <>
              <h2 style={{ marginBottom: '1rem', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)' }}>
                Controlla la posta
              </h2>
              <p style={{ fontSize: '.9rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Se l'indirizzo è registrato, riceverai un'email con il link per
                reimpostare la password. Il link vale un'ora e una volta sola.
              </p>
            </>
          ) : (
            <>
              <h2 style={{ marginBottom: '1.5rem', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)' }}>
                Password dimenticata
              </h2>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-control" type="email" required placeholder="tu@esempio.it"
                    value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <button className="btn btn-primary w-full" type="submit" disabled={loading}>
                  {loading ? 'Invio...' : 'Invia il link di recupero'}
                </button>
              </form>
            </>
          )}
        </div>

        <div className="auth-footer">
          <Link to="/login">Torna all'accesso</Link>
        </div>
      </div>
    </div>
  )
}
