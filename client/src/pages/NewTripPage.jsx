import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import ParticlesBg from '../components/ParticlesBg'
import Icon from '../components/Icon'
import CustomSelect from '../components/CustomSelect'
import DatePicker from '../components/DatePicker'
import CountrySelect from '../components/CountrySelect'
import { createTrip, uploadImage } from '../js/api'
import { format, parseISO, differenceInDays } from 'date-fns'
import { it } from 'date-fns/locale'

const STATUS_OPTS = [
  { value: 'pianificazione', label: 'Pianificazione', color: 'rgba(194,107,74,.9)' },
  { value: 'confermato',     label: 'Confermato',     color: 'rgba(107,158,122,.9)' },
  { value: 'concluso',       label: 'Concluso',       color: 'rgba(80,70,60,.85)'  },
]

function TripPreviewCard({ form }) {
  const hasImage   = form.cover_image && (form.cover_image.startsWith('http') || form.cover_image.startsWith('/'))
  const hasDates   = form.start_date && form.end_date && form.start_date <= form.end_date
  const days       = hasDates ? differenceInDays(parseISO(form.end_date), parseISO(form.start_date)) + 1 : null
  const statusInfo = STATUS_OPTS.find(s => s.value === form.status) || STATUS_OPTS[0]

  return (
    <div style={{ borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-light)', background: 'var(--surface)' }}>
      <div style={{
        height: 155,
        background: hasImage
          ? `url(${form.cover_image}) center/cover no-repeat`
          : 'linear-gradient(135deg, var(--primary) 0%, #a85637 55%, var(--accent) 100%)',
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!hasImage && <Icon name="globe" size={52} color="rgba(255,255,255,.25)" />}
        <span style={{
          position: 'absolute', top: '.75rem', right: '.75rem',
          background: statusInfo.color, color: '#fff',
          backdropFilter: 'blur(8px)', borderRadius: 99,
          padding: '.22rem .7rem', fontSize: '.68rem', fontWeight: 800,
          letterSpacing: '.03em', textTransform: 'uppercase',
        }}>
          {statusInfo.label}
        </span>
      </div>
      <div style={{ padding: '1rem 1.1rem .75rem' }}>
        <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)', marginBottom: '.22rem' }}>
          {form.title || <em style={{ color: 'var(--text-light)', fontWeight: 400 }}>Nome del viaggio…</em>}
        </div>
        <div style={{ fontSize: '.85rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '.4rem', display: 'flex', alignItems: 'center', gap: '.3rem' }}>
          <Icon name="pin" size={13} color="var(--text-muted)" />
          {form.destination
            ? form.destination
            : <em style={{ color: 'var(--text-light)', fontWeight: 400 }}>Destinazione…</em>}
        </div>
        {hasDates && (
          <div style={{ fontSize: '.8rem', color: 'var(--text-light)', fontWeight: 500 }}>
            {format(parseISO(form.start_date), 'd MMM yyyy', { locale: it })} —{' '}
            {format(parseISO(form.end_date),   'd MMM yyyy', { locale: it })} · {days} {days === 1 ? 'giorno' : 'giorni'}
          </div>
        )}
      </div>
      <div style={{
        padding: '.7rem 1.1rem', borderTop: '1.5px solid var(--border-light)',
        background: 'var(--surface-warm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex' }}>
          {[0,1,2].map(i => (
            <div key={i} className="avatar" style={{ background: `hsl(${i*60+20},55%,60%)`, marginLeft: i ? -7 : 0 }}>?</div>
          ))}
        </div>
        <span style={{ fontSize: '.8rem', color: 'var(--text-muted)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '.3rem' }}>
          <Icon name="euro" size={13} color="var(--text-muted)" />
          {form.total_budget
            ? parseFloat(form.total_budget).toLocaleString('it-IT')
            : <em style={{ color: 'var(--text-light)', fontWeight: 400 }}>Budget...</em>}
        </span>
      </div>
    </div>
  )
}

export default function NewTripPage() {
  const navigate  = useNavigate()
  const fileRef   = useRef(null)
  const [form, setForm] = useState({
    title: '', description: '', destination: '',
    start_date: '', end_date: '', cover_image: '',
    status: 'pianificazione', total_budget: '', invited_emails: '',
  })
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [imgError,   setImgError]   = useState(false)
  const [imgMode,    setImgMode]    = useState('url') // 'url' | 'upload'
  const [uploading,  setUploading]  = useState(false)
  const [previewSrc, setPreviewSrc] = useState('')

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  const days = form.start_date && form.end_date && form.start_date <= form.end_date
    ? differenceInDays(parseISO(form.end_date), parseISO(form.start_date)) + 1
    : null

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const localUrl = URL.createObjectURL(file)
    setPreviewSrc(localUrl)
    setImgError(false)
    setUploading(true)
    try {
      const res = await uploadImage(file)
      set('cover_image', res.data.url)
    } catch {
      setError('Errore nel caricamento immagine')
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.start_date || !form.end_date) {
      setError('Seleziona le date di partenza e rientro')
      return
    }
    if (form.start_date > form.end_date) {
      setError('La data di rientro deve essere uguale o successiva alla partenza')
      return
    }
    const emails = form.invited_emails
      .split(/[\n,;]+/).map(s => s.trim()).filter(s => s.includes('@'))

    setLoading(true)
    try {
      const res = await createTrip({
        ...form,
        total_budget: form.total_budget ? parseFloat(form.total_budget) : 0,
        invited_emails: emails,
      })
      navigate(`/trips/${res.data.id}`)
    } catch (err) {
      setError(err.response?.data?.error || 'Errore nella creazione del viaggio')
      setLoading(false)
    }
  }

  const currentPreview = imgMode === 'upload' ? previewSrc : form.cover_image

  return (
    <Layout title="Nuovo viaggio" backTo="/">

      <div className="new-trip-hero">
        <ParticlesBg count={16} color="rgba(255,255,255,.55)" />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="new-trip-hero-title">Pianifica il tuo viaggio</div>
          <div className="new-trip-hero-sub">
            Compila i dettagli — i giorni dell'itinerario verranno generati automaticamente
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <Icon name="warning" size={16} />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="new-trip-layout">
          <div className="new-trip-fields">

            {/* 1. Dove */}
            <div className="form-section">
              <div className="form-section-header">
                <div className="form-section-icon"><Icon name="pin" size={19} /></div>
                <div>
                  <div className="form-section-title">Dove andiamo?</div>
                  <div className="form-section-sub">Nome del viaggio e destinazione principale</div>
                </div>
              </div>
              <div className="form-section-body">
                <div className="form-group">
                  <label className="form-label">Titolo del viaggio *</label>
                  <input className="form-control" required
                    placeholder="Es. Giappone Primavera 2025"
                    value={form.title} onChange={e => set('title', e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Destinazione principale *</label>
                  <CountrySelect required
                    value={form.destination} onChange={v => set('destination', v)} />
                  <div className="form-hint">Scegli il paese dall'elenco o scrivilo. Le singole città si aggiungono giorno per giorno nell'itinerario</div>
                </div>
              </div>
            </div>

            {/* 2. Quando */}
            <div className="form-section">
              <div className="form-section-header">
                <div className="form-section-icon"><Icon name="calendar" size={19} /></div>
                <div>
                  <div className="form-section-title">Quando partiamo?</div>
                  <div className="form-section-sub">I giorni dell'itinerario vengono creati automaticamente</div>
                </div>
              </div>
              <div className="form-section-body">
                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Data di partenza *</label>
                    <DatePicker
                      value={form.start_date}
                      onChange={v => set('start_date', v)}
                      placeholder="Seleziona partenza"
                      max={form.end_date || undefined}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Data di rientro *</label>
                    <DatePicker
                      value={form.end_date}
                      onChange={v => set('end_date', v)}
                      placeholder="Seleziona rientro"
                      min={form.start_date || undefined}
                    />
                  </div>
                </div>
                {days && (
                  <div style={{ marginTop: '.9rem', display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
                    <span className="date-pill">{days} {days === 1 ? 'giorno' : 'giorni'}</span>
                    <span style={{ fontSize: '.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                      verranno creati {days} slot per l'itinerario
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Copertina */}
            <div className="form-section">
              <div className="form-section-header">
                <div className="form-section-icon"><Icon name="image" size={19} /></div>
                <div>
                  <div className="form-section-title">Immagine di copertina</div>
                  <div className="form-section-sub">Carica un file o incolla un URL</div>
                </div>
              </div>
              <div className="form-section-body">
                <div className="image-mode-toggle">
                  <button type="button" className={`image-mode-btn ${imgMode === 'url' ? 'active' : ''}`} onClick={() => setImgMode('url')}>
                    <Icon name="link" size={15} /> URL
                  </button>
                  <button type="button" className={`image-mode-btn ${imgMode === 'upload' ? 'active' : ''}`} onClick={() => setImgMode('upload')}>
                    <Icon name="upload" size={15} /> Carica file
                  </button>
                </div>

                {imgMode === 'url' ? (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <input className="form-control" type="url"
                      placeholder="https://images.unsplash.com/..."
                      value={form.cover_image}
                      onChange={e => { set('cover_image', e.target.value); setImgError(false) }} />
                    <div className="form-hint">Qualsiasi URL di immagine pubblica</div>
                  </div>
                ) : (
                  <div>
                    <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
                    <div className="image-upload-area" onClick={() => fileRef.current?.click()}>
                      <div className="image-upload-icon">
                        <Icon name="upload" size={28} color="var(--primary)" />
                      </div>
                      <div className="image-upload-label">
                        {uploading ? 'Caricamento in corso...' : 'Clicca per selezionare'}
                      </div>
                      <div className="image-upload-sub">JPG, PNG, WebP · max 8MB</div>
                    </div>
                  </div>
                )}

                {currentPreview && !imgError && (
                  <div className="cover-preview">
                    <img src={currentPreview} alt="" onError={() => setImgError(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}
                {imgError && (
                  <div className="cover-preview">
                    <div className="cover-preview-label">Immagine non caricabile</div>
                  </div>
                )}
              </div>
            </div>

            {/* 4. Dettagli */}
            <div className="form-section">
              <div className="form-section-header">
                <div className="form-section-icon"><Icon name="edit" size={19} /></div>
                <div>
                  <div className="form-section-title">Dettagli e budget</div>
                  <div className="form-section-sub">Stato, note e budget di partenza</div>
                </div>
              </div>
              <div className="form-section-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Stato</label>
                    <CustomSelect
                      value={form.status}
                      onChange={v => set('status', v)}
                      options={STATUS_OPTS.map(s => ({ value: s.value, label: s.label }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Budget totale (€)</label>
                    <input className="form-control" type="number" min="0" step="0.01"
                      placeholder="0.00"
                      value={form.total_budget} onChange={e => set('total_budget', e.target.value)} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Descrizione</label>
                  <textarea className="form-control" rows={3}
                    placeholder="Note, idee, sogni per questo viaggio..."
                    value={form.description} onChange={e => set('description', e.target.value)} />
                </div>
              </div>
            </div>

            {/* 5. Partecipanti */}
            <div className="form-section">
              <div className="form-section-header">
                <div className="form-section-icon"><Icon name="people" size={19} /></div>
                <div>
                  <div className="form-section-title">Compagni di viaggio</div>
                  <div className="form-section-sub">Puoi invitare altre persone anche dopo</div>
                </div>
              </div>
              <div className="form-section-body">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Email dei partecipanti</label>
                  <textarea className="form-control" rows={2}
                    placeholder="mario@esempio.it, lucia@esempio.it"
                    value={form.invited_emails} onChange={e => set('invited_emails', e.target.value)} />
                  <div className="form-hint">
                    Separati da virgola, punto e virgola o a capo · Diventeranno editor
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="new-trip-actions">
              <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
                Annulla
              </button>
              <button type="submit" className="btn btn-primary btn-lg" disabled={loading || uploading}>
                {loading
                  ? <><span className="spinner" style={{ width:18, height:18, margin:0, borderWidth:2 }} /> Creazione...</>
                  : <><Icon name="plane" size={18} /> Crea il viaggio</>}
              </button>
            </div>
          </div>

          {/* Preview column (desktop only) */}
          <div className="new-trip-preview">
            <div style={{ fontSize: '.76rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '.75rem' }}>
              Anteprima dal vivo
            </div>
            <TripPreviewCard form={{ ...form, cover_image: currentPreview || form.cover_image }} />
            <div style={{
              marginTop: '1rem', padding: '.9rem 1rem',
              background: 'var(--accent-light)', borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(212,168,83,.3)',
              fontSize: '.8rem', color: '#8c6010', fontWeight: 600, lineHeight: 1.5,
              display: 'flex', gap: '.5rem', alignItems: 'flex-start',
            }}>
              <Icon name="info" size={16} color="#8c6010" style={{ flexShrink: 0, marginTop: 1 }} />
              La card si aggiorna in tempo reale mentre compili il modulo
            </div>
          </div>
        </div>
      </form>
    </Layout>
  )
}
