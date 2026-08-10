import { useState, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import Modal from './Modal'
import Icon from './Icon'
import CustomSelect from './CustomSelect'
import { useConfirm } from './ConfirmModal'
import { addTransport, updateTransport, deleteTransport, uploadTransportTicket, deleteTransportTicket, openAttachment } from '../js/api'
import { cityLabel } from '../js/cityLabel'
import { directionsUrl, modeTravel, providersFor } from '../js/directions'

// Endpoint per un link indicazioni: il nome città mostra "Tokyo" invece di un
// indirizzo specifico (Google geocodifica le coordinate al punto più vicino).
const cityEndpoint = (c) => cityLabel(c)

export const MODES = [
  { key: 'volo',      label: 'Volo',      emoji: '✈️' },
  { key: 'treno',     label: 'Treno',     emoji: '🚆' },
  { key: 'bus',       label: 'Bus',       emoji: '🚌' },
  { key: 'auto',      label: 'Auto',      emoji: '🚗' },
  { key: 'traghetto', label: 'Traghetto', emoji: '⛴' },
  { key: 'metro',     label: 'Metro',     emoji: '🚇' },
  { key: 'apiedi',    label: 'A piedi',   emoji: '🚶' },
  { key: 'altro',     label: 'Altro',     emoji: '📍' },
]
const MODE_EMOJI = Object.fromEntries(MODES.map(m => [m.key, m.emoji]))
const MODE_LABEL = Object.fromEntries(MODES.map(m => [m.key, m.label]))

export function modeEmoji(mode) { return MODE_EMOJI[mode] || '📍' }
export function modeLabel(mode) { return MODE_LABEL[mode] || mode }

function fmtDateTime(date, time) {
  if (!date && !time) return ''
  let out = ''
  if (date) { try { out = format(parseISO(date), 'd MMM', { locale: it }) } catch { out = date } }
  if (time) out += (out ? ' ' : '') + time.slice(0, 5)
  return out
}

/* ─── TransportModal (add + edit), riusabile dall'itinerario ─────────────────── */
export function TransportModal({ tripId, cities = [], days = [], transport, defaultDayId, defaults = {}, onSaved, onClose }) {
  const isEdit = !!transport
  const [form, setForm] = useState(
    isEdit
      ? {
          mode: transport.mode || 'treno',
          from_place: transport.from_place || '',
          to_place: transport.to_place || '',
          from_city_id: transport.from_city_id || '',
          to_city_id: transport.to_city_id || '',
          depart_date: transport.depart_date ? transport.depart_date.slice(0, 10) : '',
          depart_time: transport.depart_time ? transport.depart_time.slice(0, 5) : '',
          arrive_date: transport.arrive_date ? transport.arrive_date.slice(0, 10) : '',
          arrive_time: transport.arrive_time ? transport.arrive_time.slice(0, 5) : '',
          cost: transport.cost ?? '',
          carrier: transport.carrier || '',
          booking_ref: transport.booking_ref || '',
          seat: transport.seat || '',
          link: transport.link || '',
          notes: transport.notes || '',
          day_id: transport.day_id || defaultDayId || '',
        }
      : {
          mode: 'treno', from_place: '', to_place: '', from_city_id: '', to_city_id: '',
          depart_date: '', depart_time: '', arrive_date: '', arrive_time: '',
          cost: '', carrier: '', booking_ref: '', seat: '', link: '', notes: '',
          day_id: defaultDayId || '',
          ...defaults,
        }
  )
  const [saving, setSaving] = useState(false)
  // Biglietto: file in attesa di upload, e stato del biglietto già presente
  const [stagedFile, setStagedFile] = useState(null)
  const [ticketName, setTicketName] = useState(isEdit ? (transport.ticket_name || '') : '')
  const [ticketPath, setTicketPath] = useState(isEdit ? (transport.ticket_path || '') : '')
  const fileRef = useRef()
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function handleFilePick(e) {
    const f = e.target.files[0]
    if (!f) return
    setStagedFile(f)
    setTicketName(f.name)
  }
  function removeTicket() {
    setStagedFile(null)
    setTicketName('')
    setTicketPath('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function save() {
    // Servono almeno un estremo: un luogo digitato oppure una città collegata.
    if (!form.from_place.trim() && !form.to_place.trim() && !form.from_city_id && !form.to_city_id) return
    setSaving(true)
    try {
      const payload = {
        ...form,
        from_city_id: form.from_city_id || null,
        to_city_id: form.to_city_id || null,
        day_id: form.day_id || null,
        cost: form.cost === '' ? null : form.cost,
      }
      const resp = isEdit
        ? await updateTransport(tripId, transport.id, payload)
        : await addTransport(tripId, payload)
      const id = resp.data.id

      if (stagedFile) {
        await uploadTransportTicket(tripId, id, stagedFile)
      } else if (isEdit && transport.ticket_path && !ticketPath) {
        // Biglietto rimosso senza sostituzione
        await deleteTransportTicket(tripId, id)
      }
      onSaved()
      onClose()
    } catch { } finally { setSaving(false) }
  }

  const cityOpts = [{ value: '', label: '— Nessuna —' }, ...cities.map(c => ({ value: String(c.id), label: cityLabel(c) }))]
  const dayOpts = [
    { value: '', label: '— Non collegato —' },
    ...days.map(d => ({ value: String(d.id), label: format(parseISO(d.date), 'EEE d MMM', { locale: it }) })),
  ]

  return (
    <Modal title={isEdit ? 'Modifica trasporto' : 'Aggiungi trasporto'} onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" onClick={save}
          disabled={saving || (!form.from_place.trim() && !form.to_place.trim())}>
          {saving ? 'Salvo...' : isEdit ? 'Salva' : 'Aggiungi'}
        </button>
      </>}
    >
      <div className="act-slot-row" style={{ flexWrap: 'wrap' }}>
        {MODES.map(m => (
          <button key={m.key} type="button"
            className={`act-slot-pill${form.mode === m.key ? ' active' : ''}`}
            style={form.mode === m.key ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : {}}
            onClick={() => set('mode', m.key)}>
            {m.emoji} {m.label}
          </button>
        ))}
      </div>

      <div className="form-row">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Da</label>
          <input className="form-control" placeholder="Es. Roma Fiumicino"
            value={form.from_place} onChange={e => set('from_place', e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">A</label>
          <input className="form-control" placeholder="Es. Tokyo Haneda"
            value={form.to_place} onChange={e => set('to_place', e.target.value)} />
        </div>
      </div>

      {cities.length > 0 && (
        <div className="form-row" style={{ marginTop: '.75rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Città partenza</label>
            <CustomSelect value={String(form.from_city_id || '')} onChange={v => set('from_city_id', v)} options={cityOpts} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Città arrivo</label>
            <CustomSelect value={String(form.to_city_id || '')} onChange={v => set('to_city_id', v)} options={cityOpts} />
          </div>
        </div>
      )}

      <div className="form-row" style={{ marginTop: '.75rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Partenza</label>
          <div style={{ display: 'flex', gap: '.4rem' }}>
            <input className="form-control" type="date" value={form.depart_date} onChange={e => set('depart_date', e.target.value)} />
            <input className="form-control" type="time" value={form.depart_time} onChange={e => set('depart_time', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Arrivo</label>
          <div style={{ display: 'flex', gap: '.4rem' }}>
            <input className="form-control" type="date" value={form.arrive_date} onChange={e => set('arrive_date', e.target.value)} />
            <input className="form-control" type="time" value={form.arrive_time} onChange={e => set('arrive_time', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="form-row" style={{ marginTop: '.75rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Costo (€)</label>
          <input className="form-control" type="number" min="0" step="0.01" placeholder="0"
            value={form.cost} onChange={e => set('cost', e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Compagnia / N°</label>
          <input className="form-control" placeholder="Es. JL123, Shinkansen"
            value={form.carrier} onChange={e => set('carrier', e.target.value)} />
        </div>
      </div>

      <div className="form-row" style={{ marginTop: '.75rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Prenotazione</label>
          <input className="form-control" placeholder="Codice"
            value={form.booking_ref} onChange={e => set('booking_ref', e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Posto</label>
          <input className="form-control" placeholder="Es. 14A"
            value={form.seat} onChange={e => set('seat', e.target.value)} />
        </div>
      </div>

      <div className="form-group" style={{ marginTop: '.75rem' }}>
        <label className="form-label">Link biglietto</label>
        <input className="form-control" type="url" placeholder="https://..."
          value={form.link} onChange={e => set('link', e.target.value)} />
      </div>

      <div className="form-group">
        <label className="form-label">Biglietto (PDF o immagine)</label>
        {ticketName ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', background: 'var(--surface)', borderRadius: 8, padding: '.5rem .65rem' }}>
            <Icon name="attach" size={15} color="var(--text-muted)" />
            <span style={{ flex: 1, minWidth: 0, fontSize: '.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ticketName}{stagedFile ? ' (da caricare)' : ''}
            </span>
            {ticketPath && !stagedFile && (
              <a href={ticketPath} target="_blank" rel="noopener noreferrer"
                className="btn btn-ghost btn-icon btn-sm" title="Apri">
                <Icon name="download" size={14} color="var(--text-muted)" />
              </a>
            )}
            <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Rimuovi" onClick={removeTicket}>
              <Icon name="trash" size={14} color="var(--danger)" />
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={14} /> Allega biglietto
          </button>
        )}
        <input type="file" ref={fileRef} accept="application/pdf,image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,image/avif" style={{ display: 'none' }} onChange={handleFilePick} />
      </div>

      {days.length > 0 && (
        <div className="form-group">
          <label className="form-label">Collega a un giorno (itinerario)</label>
          <CustomSelect value={String(form.day_id || '')} onChange={v => set('day_id', v)} options={dayOpts} />
        </div>
      )}

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label">Note</label>
        <textarea className="form-control" rows={2} placeholder="Note aggiuntive..."
          value={form.notes} onChange={e => set('notes', e.target.value)} />
      </div>
    </Modal>
  )
}

/* ─── TransportCard ──────────────────────────────────────────────────────────── */
function TransportCard({ t, cities = [], canEdit, onEdit, onDelete }) {
  const from = t.from_place || t.from_city_name || '—'
  const to = t.to_place || t.to_city_name || '—'
  const dep = fmtDateTime(t.depart_date, t.depart_time)
  const arr = fmtDateTime(t.arrive_date, t.arrive_time)
  // Build a directions link: free-typed place wins, else the linked city (coords).
  const fromPt = t.from_place || cityEndpoint(cities.find(c => c.id === t.from_city_id))
  const toPt = t.to_place || cityEndpoint(cities.find(c => c.id === t.to_city_id))
  const canRoute = fromPt && toPt
  return (
    <div className="card" style={{ padding: '.75rem 1rem', marginBottom: '.6rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.6rem' }}>
        <span style={{ fontSize: '1.4rem', lineHeight: 1 }} title={modeLabel(t.mode)}>{modeEmoji(t.mode)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '.95rem' }}>{from} <span style={{ color: 'var(--text-muted)' }}>→</span> {to}</div>
          {(dep || arr) && (
            <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: '.15rem' }}>
              {dep}{dep && arr ? ' → ' : ''}{arr}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginTop: '.35rem', fontSize: '.78rem', color: 'var(--text-light)' }}>
            {t.cost != null && <span>💶 €{parseFloat(t.cost).toFixed(2)}</span>}
            {t.carrier && <span>🏷 {t.carrier}</span>}
            {t.booking_ref && <span>🎟 {t.booking_ref}</span>}
            {t.seat && <span>💺 {t.seat}</span>}
            {t.link && (
              <a href={t.link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                🔗 Link
              </a>
            )}
            {t.ticket_path && (
              <a role="button" tabIndex={0}
                onClick={() => openAttachment(t.ticket_path).catch(() => alert('Impossibile aprire il biglietto'))}
                style={{ color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }}>
                🎫 Biglietto
              </a>
            )}
            {canRoute && (
              <a href={directionsUrl(fromPt, toPt, modeTravel(t.mode))} target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--primary)', fontWeight: 600 }}>
                🧭 Indicazioni
              </a>
            )}
          </div>
          {t.notes && <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: '.3rem', fontStyle: 'italic' }}>{t.notes}</div>}
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: '.1rem', flexShrink: 0 }}>
            <button className="btn btn-ghost btn-icon btn-sm" title="Modifica" onClick={onEdit}>
              <Icon name="edit" size={14} color="var(--text-muted)" />
            </button>
            <button className="btn btn-ghost btn-icon btn-sm" title="Elimina" onClick={onDelete}>
              <Icon name="trash" size={14} color="var(--danger)" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── DirectionsPlanner — "come spostarsi" tra città (deep-link a Google Maps) ── */
// Mezzo del planner → modalità trasporto dell'app (per "Aggiungi come spostamento").
const PLAN_TO_MODE = { transit: 'treno', driving: 'auto', walking: 'apiedi' }

function DirectionsPlanner({ cities, destination = '', onAdd }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [mode, setMode] = useState('transit')

  const cityOpts = cities.map(c => ({ value: String(c.id), label: cityLabel(c) }))
  const fromCity = cities.find(c => String(c.id) === from)
  const toCity = cities.find(c => String(c.id) === to)
  const ready = fromCity && toCity && from !== to
  const providers = providersFor(destination)

  // Punto per i provider: coordinate (più precise) + nome città.
  const point = (c) => ({ name: cityLabel(c), coords: (c && c.lat && c.lon) ? `${c.lat},${c.lon}` : null })

  function openProvider(p) {
    if (!ready) return
    window.open(p.build(point(fromCity), point(toCity), mode, destination), '_blank', 'noopener')
  }
  function addLeg() {
    if (!ready) return
    onAdd({ from_city_id: fromCity.id, to_city_id: toCity.id, mode: PLAN_TO_MODE[mode] || 'treno' })
  }

  // overflow:visible così il menu a tendina non viene tagliato dalla .card
  return (
    <div className="card" style={{ padding: '.85rem 1rem', marginBottom: '1rem', overflow: 'visible' }}>
      <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: '.6rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
        🧭 Come spostarsi
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
        <div style={{ flex: '1 1 130px', minWidth: 110 }}>
          <label className="form-label" style={{ fontSize: '.72rem' }}>Da</label>
          <CustomSelect value={from} onChange={setFrom}
            options={[{ value: '', label: '— Città —' }, ...cityOpts]} />
        </div>
        <div style={{ flex: '1 1 130px', minWidth: 110 }}>
          <label className="form-label" style={{ fontSize: '.72rem' }}>A</label>
          <CustomSelect value={to} onChange={setTo}
            options={[{ value: '', label: '— Città —' }, ...cityOpts]} />
        </div>
        <div style={{ flex: '1 1 130px', minWidth: 110 }}>
          <label className="form-label" style={{ fontSize: '.72rem' }}>Mezzo</label>
          <CustomSelect value={mode} onChange={setMode}
            options={[
              { value: 'transit', label: 'Mezzi pubblici' },
              { value: 'driving', label: 'Auto' },
              { value: 'walking', label: 'A piedi' },
            ]} />
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginTop: '.7rem' }}>
        {providers.map((p, i) => (
          <button key={p.id} className={`btn btn-sm ${i === 0 ? 'btn-primary' : 'btn-secondary'}`}
            disabled={!ready} onClick={() => openProvider(p)}
            title={p.prefilled ? `Apri ${p.label}` : `${p.label} — apre la pagina di ricerca`}>
            {p.emoji} {p.label}{p.prefilled ? '' : ' ↗'}
          </button>
        ))}
        {onAdd && (
          <button className="btn btn-ghost btn-sm" disabled={!ready} onClick={addLeg}>
            <Icon name="add" size={13} /> Aggiungi come spostamento
          </button>
        )}
      </div>
      <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: '.55rem' }}>
        Rome2Rio confronta tutte le opzioni (volo/treno/bus/auto); Google Maps dà orari e percorso del mezzo scelto. Poi salva la tratta qui.
      </div>
    </div>
  )
}

/* ─── TransportsTab ──────────────────────────────────────────────────────────── */
export default function TransportsTab({ tripId, transports = [], cities = [], days = [], myRole, onRefresh, destination = '' }) {
  const [modal, setModal] = useState(null) // 'add' | transport object
  const [addDefaults, setAddDefaults] = useState(null) // prefill per il modale di aggiunta
  const { confirm: doConfirm, modal: confirmModal } = useConfirm()
  const canEdit = myRole === 'admin' || myRole === 'editor'

  const total = transports.reduce((s, t) => s + (t.cost != null ? parseFloat(t.cost) : 0), 0)

  async function handleDelete(t) {
    const ok = await doConfirm({ message: 'Eliminare questo trasporto?', confirmLabel: 'Elimina', danger: true })
    if (!ok) return
    try { await deleteTransport(tripId, t.id); onRefresh() } catch {}
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <div style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>
          {transports.length} {transports.length === 1 ? 'spostamento' : 'spostamenti'}
          {total > 0 && <> · Totale <strong style={{ color: 'var(--text)' }}>€{total.toFixed(2)}</strong></>}
        </div>
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={() => { setAddDefaults(null); setModal('add') }}>
            <Icon name="add" size={14} /> Aggiungi
          </button>
        )}
      </div>

      {cities.length >= 2 && (
        <DirectionsPlanner cities={cities} destination={destination}
          onAdd={canEdit ? (d) => { setAddDefaults(d); setModal('add') } : null} />
      )}

      {transports.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Icon name="plane" size={28} color="var(--primary)" /></div>
          <div>Nessuno spostamento</div>
          {canEdit && <div style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginTop: '.3rem' }}>Aggiungi voli, treni e trasferimenti del viaggio.</div>}
        </div>
      ) : (
        transports.map(t => (
          <TransportCard key={t.id} t={t} cities={cities} canEdit={canEdit}
            onEdit={() => setModal(t)} onDelete={() => handleDelete(t)} />
        ))
      )}

      {modal && (
        <TransportModal
          tripId={tripId} cities={cities} days={days}
          transport={modal === 'add' ? null : modal}
          defaults={modal === 'add' ? (addDefaults || {}) : {}}
          onSaved={onRefresh}
          onClose={() => { setModal(null); setAddDefaults(null) }}
        />
      )}
      {confirmModal}
    </div>
  )
}
