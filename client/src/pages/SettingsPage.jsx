import { useState, useEffect, useRef } from 'react'
import Layout from '../components/Layout'
import Icon from '../components/Icon'
import { useAuth } from '../js/auth'
import { getMe, updateProfile, uploadImage, updateAppearance, updatePassword, exportMyData, deleteMyAccount } from '../js/api'
import { THEMES, MODES, getTheme, getMode, setTheme, setMode, syncFromAccount } from '../js/theme'

const EMPTY = { first_name: '', last_name: '', email: '', phone: '', age: '', avatar_url: '' }

export default function SettingsPage() {
  const { updateUser, setSessionToken, logout } = useAuth()
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState(null) // { type, text }
  const fileRef = useRef()

  // Tema/modalità: l'account è la fonte di verità, con cache locale per il boot senza flash
  const [theme, setThemeState] = useState(getTheme())
  const [mode, setModeState] = useState(getMode())

  // Cambio password
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [savingPw, setSavingPw] = useState(false)

  // Diritti GDPR: esportazione e cancellazione
  const [exporting, setExporting] = useState(false)
  const [deletePw, setDeletePw] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function downloadData() {
    setExporting(true)
    try {
      const r = await exportMyData()
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'jrny-i-miei-dati.json'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch {
      setMsg({ type: 'error', text: 'Esportazione non riuscita, riprova più tardi' })
    } finally { setExporting(false) }
  }

  async function removeAccount() {
    // Conferma esplicita: l'operazione non è annullabile
    if (!window.confirm('Eliminare definitivamente il tuo account? I dati non saranno recuperabili.')) return
    setDeleting(true)
    try {
      await deleteMyAccount({ password: deletePw })
      logout()
      window.location.href = '/login'
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Cancellazione non riuscita' })
    } finally { setDeleting(false) }
  }

  useEffect(() => {
    getMe()
      .then(r => {
        const d = r.data
        setForm({
          first_name: d.first_name || '',
          last_name: d.last_name || '',
          email: d.email || '',
          phone: d.phone || '',
          age: d.age ?? '',
          avatar_url: d.avatar_url || '',
        })
        if (d.theme || d.mode) {
          setThemeState(d.theme || theme)
          setModeState(d.mode || mode)
          syncFromAccount(d.theme, d.mode)
        }
      })
      .catch(() => setMsg({ type: 'error', text: 'Errore nel caricamento del profilo' }))
      .finally(() => setLoading(false))
  }, [])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function pickTheme(t) {
    setTheme(t); setThemeState(t)
    updateUser({ theme: t })
    updateAppearance({ theme: t }).catch(() => {})
  }
  function pickMode(m) {
    setMode(m); setModeState(m)
    updateUser({ mode: m })
    updateAppearance({ mode: m }).catch(() => {})
  }

  async function savePassword() {
    if (!pw.current || !pw.next) return setMsg({ type: 'error', text: 'Compila password attuale e nuova' })
    if (pw.next.length < 10) return setMsg({ type: 'error', text: 'La nuova password deve avere almeno 10 caratteri' })
    if (pw.next !== pw.confirm) return setMsg({ type: 'error', text: 'Le due nuove password non coincidono' })
    setSavingPw(true)
    setMsg(null)
    try {
      const r = await updatePassword({ current_password: pw.current, new_password: pw.next })
      // Il server ruota il token: salva quello nuovo per non perdere la sessione corrente
      if (r.data?.token) setSessionToken(r.data.token)
      setPw({ current: '', next: '', confirm: '' })
      setMsg({ type: 'success', text: 'Password aggiornata. Le altre sessioni sono state disconnesse.' })
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Errore nel cambio password' })
    } finally { setSavingPw(false) }
  }

  async function handleAvatar(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const r = await uploadImage(file)
      set('avatar_url', r.data.url)
    } catch {
      setMsg({ type: 'error', text: 'Errore caricamento immagine' })
    } finally { setUploading(false) }
  }

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      const r = await updateProfile(form)
      updateUser({ name: r.data.name, avatar_url: r.data.avatar_url, email: r.data.email })
      setMsg({ type: 'success', text: 'Profilo salvato' })
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Errore nel salvataggio' })
    } finally { setSaving(false) }
  }

  if (loading) return <Layout title="Impostazioni" backTo="/"><div className="page-loading"><div className="spinner" /></div></Layout>

  const initial = (form.first_name || form.email || '?')[0]?.toUpperCase()

  return (
    <Layout title="Impostazioni" backTo="/">
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        {msg && (
          <div className={`alert ${msg.type === 'success' ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: '1rem' }}>
            <Icon name={msg.type === 'success' ? 'check' : 'warning'} size={16} />{msg.text}
          </div>
        )}

        {/* ── Profilo ── */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header"><span className="card-title">Profilo</span></div>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
              <div className="avatar" style={{ width: 64, height: 64, fontSize: '1.5rem', overflow: 'hidden' }}>
                {form.avatar_url
                  ? <img src={form.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initial}
              </div>
              <div>
                <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  <Icon name="upload" size={14} /> {uploading ? 'Carico...' : 'Cambia foto'}
                </button>
                {form.avatar_url && (
                  <button className="btn btn-ghost btn-sm" style={{ marginLeft: '.4rem' }} onClick={() => set('avatar_url', '')}>
                    Rimuovi
                  </button>
                )}
                <input type="file" ref={fileRef} accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,image/avif" style={{ display: 'none' }} onChange={handleAvatar} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group"><label className="form-label">Nome</label>
                <input className="form-control" value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="Mario" />
              </div>
              <div className="form-group"><label className="form-label">Cognome</label>
                <input className="form-control" value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Rossi" />
              </div>
            </div>

            <div className="form-group"><label className="form-label">Email</label>
              <input className="form-control" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="mario@example.com" />
            </div>

            <div className="form-row">
              <div className="form-group"><label className="form-label">Telefono</label>
                <input className="form-control" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+39 333 1234567" />
              </div>
              <div className="form-group"><label className="form-label">Età</label>
                <input className="form-control" type="number" min="0" max="120" value={form.age} onChange={e => set('age', e.target.value)} placeholder="30" />
              </div>
            </div>

            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Salvo...' : 'Salva profilo'}
            </button>
          </div>
        </div>

        {/* ── Aspetto ── */}
        <div className="card">
          <div className="card-header"><span className="card-title">Aspetto</span></div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Tema colori</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '.6rem' }}>
                {THEMES.map(t => (
                  <button key={t.key} type="button" onClick={() => pickTheme(t.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.6rem .75rem',
                      borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left',
                      background: theme === t.key ? 'var(--primary-xlight)' : 'var(--surface)',
                      border: `2px solid ${theme === t.key ? 'var(--primary)' : 'var(--border)'}`,
                    }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: t.color, flexShrink: 0, boxShadow: '0 0 0 1px var(--border)' }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: '.85rem' }}>{t.label}</span>
                      <span style={{ display: 'block', fontSize: '.72rem', color: 'var(--text-muted)' }}>{t.desc}</span>
                    </span>
                    {theme === t.key && <Icon name="check" size={14} color="var(--primary)" style={{ marginLeft: 'auto' }} />}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Modalità</label>
              <div style={{ display: 'flex', gap: '.5rem' }}>
                {MODES.map(m => (
                  <button key={m.key} type="button" onClick={() => pickMode(m.key)}
                    className={`btn btn-sm ${mode === m.key ? 'btn-primary' : 'btn-secondary'}`}>
                    <Icon name={m.key === 'dark' ? 'moon' : 'sun'} size={14} /> {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Sicurezza ── */}
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="card-header"><span className="card-title">Sicurezza</span></div>
          <div className="card-body">
            <div className="form-group"><label className="form-label">Password attuale</label>
              <input className="form-control" type="password" autoComplete="current-password"
                value={pw.current} onChange={e => setPw(p => ({ ...p, current: e.target.value }))} />
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Nuova password</label>
                <input className="form-control" type="password" autoComplete="new-password"
                  value={pw.next} onChange={e => setPw(p => ({ ...p, next: e.target.value }))} placeholder="Min. 10 caratteri" />
              </div>
              <div className="form-group"><label className="form-label">Conferma nuova password</label>
                <input className="form-control" type="password" autoComplete="new-password"
                  value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} />
              </div>
            </div>
            <button className="btn btn-primary" onClick={savePassword} disabled={savingPw}>
              {savingPw ? 'Salvo...' : 'Cambia password'}
            </button>
          </div>
        </div>

        {/* ── I tuoi dati (diritti GDPR) ── */}
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="card-header"><span className="card-title">I tuoi dati</span></div>
          <div className="card-body">
            <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 0 }}>
              Puoi scaricare in ogni momento una copia dei tuoi dati, oppure
              eliminare l'account. I file (foto e allegati) non sono nel file
              JSON: scaricali dall'app prima di cancellare l'account.
              Cosa trattiamo e perché è spiegato nell'
              <a href="/privacy" target="_blank" rel="noopener">informativa privacy</a>.
            </p>

            <button className="btn btn-secondary" onClick={downloadData} disabled={exporting}>
              <Icon name="download" size={15} /> {exporting ? 'Preparo il file...' : 'Scarica i miei dati'}
            </button>

            <div style={{ borderTop: '1px solid var(--border)', margin: '1.25rem 0 1rem' }} />

            <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: '.4rem', color: 'var(--danger)' }}>
              Elimina account
            </div>
            <p style={{ fontSize: '.82rem', color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 0 }}>
              L'operazione è definitiva. I viaggi in cui sei l'unico
              partecipante vengono eliminati con i loro file; negli altri il
              ruolo di admin passa a un altro partecipante.
            </p>
            <div className="form-group" style={{ maxWidth: 320 }}>
              <label className="form-label">Conferma con la tua password</label>
              <input className="form-control" type="password" autoComplete="current-password"
                value={deletePw} onChange={e => setDeletePw(e.target.value)} />
            </div>
            <button className="btn btn-danger" onClick={removeAccount} disabled={deleting || !deletePw}>
              {deleting ? 'Elimino...' : 'Elimina definitivamente il mio account'}
            </button>
          </div>
        </div>

      </div>
    </Layout>
  )
}
