import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO, differenceInDays } from 'date-fns'
import { it } from 'date-fns/locale'
import Modal from './Modal'
import Icon from './Icon'
import CustomSelect from './CustomSelect'
import { useConfirm } from './ConfirmModal'
import {
  updateTrip, inviteToTrip, updateParticipantRole, removeParticipant, cancelInvitation,
  generateInviteLink, revokeInviteLink,
  toggleShareLink,
  getAttachments, uploadAttachment, deleteAttachment, openAttachment,
  cloneTrip, uploadImage, updateTripNotes,
} from '../js/api'

const STATUS_LABELS = { pianificazione: 'Pianificazione', confermato: 'Confermato', concluso: 'Concluso' }
function initials(name) { return (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) }

function formatBytes(n) {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(mime) {
  if (!mime) return '📎'
  if (mime.startsWith('image/')) return '🖼'
  if (mime === 'application/pdf') return '📄'
  if (mime.includes('word')) return '📝'
  if (mime.includes('spreadsheet') || mime.includes('excel')) return '📊'
  if (mime.startsWith('video/')) return '🎬'
  return '📎'
}

function exportIcal(trip, days) {
  const SLOT_TIMES = { mattina: '09:00', pomeriggio: '14:00', sera: '19:00', notte: '22:00' }
  const UID_BASE = `jrny-${trip.id}-${Date.now()}`

  function dtStr(dateStr, timeStr) {
    const d = dateStr.replace(/-/g, '')
    if (!timeStr) return `${d}T000000`
    return `${d}T${timeStr.replace(':', '')}00`
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//jrny//jrny//IT',
    `X-WR-CALNAME:${trip.title}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]

  lines.push(
    'BEGIN:VEVENT',
    `UID:trip-${UID_BASE}`,
    `DTSTART;VALUE=DATE:${trip.start_date.replace(/-/g, '')}`,
    `DTEND;VALUE=DATE:${trip.end_date.replace(/-/g, '')}`,
    `SUMMARY:✈️ ${trip.title} - ${trip.destination}`,
    `DESCRIPTION:${trip.description || ''}`,
    'END:VEVENT'
  )

  days.forEach(day => {
    const acts = Array.isArray(day.activities) ? day.activities : []
    acts.forEach((act, i) => {
      const t = act.time?.slice(0, 5) || SLOT_TIMES[act.slot] || '09:00'
      lines.push(
        'BEGIN:VEVENT',
        `UID:act-${UID_BASE}-${day.id}-${i}`,
        `DTSTART:${dtStr(day.date, t)}`,
        `DTEND:${dtStr(day.date, t)}`,
        `SUMMARY:${act.name}`,
        act.notes ? `DESCRIPTION:${act.notes}` : '',
        'END:VEVENT'
      )
    })
    if (day.notes) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:day-${UID_BASE}-${day.id}`,
        `DTSTART;VALUE=DATE:${day.date.replace(/-/g, '')}`,
        `DTEND;VALUE=DATE:${day.date.replace(/-/g, '')}`,
        `SUMMARY:📝 Note: ${day.notes.slice(0, 60)}`,
        `DESCRIPTION:${day.notes}`,
        'END:VEVENT'
      )
    }
  })

  lines.push('END:VCALENDAR')

  const blob = new Blob([lines.filter(Boolean).join('\r\n')], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${trip.title.replace(/[^a-z0-9]/gi, '_')}.ics`
  a.click()
  URL.revokeObjectURL(url)
}

// Escape dei caratteri HTML: i dati del viaggio vengono interpolati in una stringa HTML
// e iniettati con document.write, fuori dalla protezione di React → previene XSS stored.
function esc(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function printItinerary(trip, days) {
  const SLOTS = ['mattina', 'pomeriggio', 'sera', 'notte']
  const SLOT_LABELS = { mattina: 'Mattina', pomeriggio: 'Pomeriggio', sera: 'Sera', notte: 'Notte' }

  const dayRows = days.map(day => {
    const acts = Array.isArray(day.activities) ? day.activities : []
    const slotRows = SLOTS.filter(s => acts.some(a => a.slot === s)).map(s => {
      const sActs = acts.filter(a => a.slot === s)
      return `<div style="margin-bottom:8px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:4px">${SLOT_LABELS[s]}</div>
        ${sActs.map(a => `<div style="padding:4px 0;border-bottom:1px solid #eee;font-size:13px">
          <strong>${esc(a.name)}</strong>${a.time ? ` <span style="color:#888;font-size:11px">${esc(a.time.slice(0,5))}</span>` : ''}
          ${a.notes ? `<div style="color:#666;font-size:11px;margin-top:2px">${esc(a.notes)}</div>` : ''}
        </div>`).join('')}
      </div>`
    }).join('')
    const dateLabel = new Date(day.date + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
    return `<div style="margin-bottom:20px;page-break-inside:avoid">
      <div style="background:#f5f0eb;padding:8px 12px;border-radius:6px;margin-bottom:8px">
        <strong>${esc(dateLabel)}</strong>${day.city_name ? ` <span style="color:#c26b4a;font-size:12px">&nbsp;· ${esc(day.city_name)}</span>` : ''}
        ${day.notes ? `<div style="font-size:12px;color:#666;margin-top:2px;font-style:italic">${esc(day.notes)}</div>` : ''}
      </div>
      ${slotRows || '<div style="color:#aaa;font-size:12px;font-style:italic">Nessuna attività</div>'}
    </div>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <title>${esc(trip.title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; color: #222; background: #fff; padding: 32px; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .meta { color: #888; font-size: 13px; margin-bottom: 24px; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <h1>✈️ ${esc(trip.title)}</h1>
  <div class="meta">
    📍 ${esc(trip.destination)} &nbsp;·&nbsp;
    ${new Date(trip.start_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} – ${new Date(trip.end_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
  </div>
  ${dayRows}
  <div style="margin-top:32px;color:#bbb;font-size:11px;text-align:center">Generato con jrny</div>
</body>
</html>`

  const w = window.open('', '_blank')
  w.document.write(html)
  w.document.close()
  w.focus()
  w.print()
}

export default function InfoTab({ trip, myRole, onTripUpdated, days }) {
  const navigate = useNavigate()
  const [editModal, setEditModal] = useState(false)
  const [inviteModal, setInviteModal] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('editor')
  const [saving, setSaving] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [editImgUploading, setEditImgUploading] = useState(false)
  const [msg, setMsg] = useState('')
  const { confirm: doConfirm, modal: confirmModal } = useConfirm()
  const editImageRef = useRef(null)
  const noteTimer    = useRef(null)
  const [noteContent, setNoteContent]   = useState(trip.trip_notes || '')
  const [noteSaving, setNoteSaving]     = useState(false)
  const [noteSaved, setNoteSaved]       = useState(false)

  // Invite link
  const [inviteLink, setInviteLink] = useState(null)
  const [inviteLinkLoading, setInviteLinkLoading] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)

  // Share link
  const [shareLink, setShareLink] = useState(trip.share_token ? `${window.location.origin}/share/${trip.share_token}` : null)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  // Attachments
  const [attachments, setAttachments] = useState([])
  const [attLoading, setAttLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  const canEdit = myRole === 'admin' || myRole === 'editor'
  const start = parseISO(trip.start_date)
  const end = parseISO(trip.end_date)
  const numDays = differenceInDays(end, start) + 1

  useEffect(() => {
    getAttachments(trip.id).then(r => setAttachments(r.data)).catch(() => {}).finally(() => setAttLoading(false))
  }, [trip.id])

  function openEdit() {
    setEditForm({
      title: trip.title, description: trip.description || '',
      destination: trip.destination, cover_image: trip.cover_image || '',
      status: trip.status, total_budget: trip.total_budget || 0
    })
    setEditModal(true)
  }

  async function saveEdit() {
    setSaving(true)
    try { await updateTrip(trip.id, editForm); onTripUpdated(); setEditModal(false) }
    catch { } finally { setSaving(false) }
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) return
    setSaving(true)
    try {
      await inviteToTrip(trip.id, { email: inviteEmail.trim(), role: inviteRole })
      setMsg('Invito inviato!')
      setInviteEmail('')
      onTripUpdated()
    } catch (err) { setMsg(err.response?.data?.error || 'Errore') }
    finally { setSaving(false) }
  }

  async function changeRole(userId, role) {
    await updateParticipantRole(trip.id, userId, { role }); onTripUpdated()
  }

  async function handleRemoveParticipant(p) {
    const ok = await doConfirm({ message: `Rimuovere ${p.name} dal viaggio?`, confirmLabel: 'Rimuovi', danger: true })
    if (!ok) return
    try { await removeParticipant(trip.id, p.id); onTripUpdated() }
    catch (err) { alert(err.response?.data?.error || 'Errore') }
  }

  async function handleCancelInvitation(email) {
    const ok = await doConfirm({ message: `Annullare l'invito a ${email}?`, confirmLabel: 'Annulla invito', danger: true })
    if (!ok) return
    try { await cancelInvitation(trip.id, email); onTripUpdated() } catch { }
  }

  async function handleGenerateInviteLink() {
    setInviteLinkLoading(true)
    try { const r = await generateInviteLink(trip.id); setInviteLink(r.data.link) }
    catch { } finally { setInviteLinkLoading(false) }
  }

  async function handleRevokeInviteLink() {
    await revokeInviteLink(trip.id); setInviteLink(null)
  }

  function copyInviteLink() {
    navigator.clipboard.writeText(inviteLink).then(() => { setInviteCopied(true); setTimeout(() => setInviteCopied(false), 2000) })
  }

  async function handleToggleShare() {
    setShareLoading(true)
    try {
      const r = await toggleShareLink(trip.id)
      setShareLink(r.data.link)
      onTripUpdated()
    } catch { } finally { setShareLoading(false) }
  }

  function copyShareLink() {
    navigator.clipboard.writeText(shareLink).then(() => { setShareCopied(true); setTimeout(() => setShareCopied(false), 2000) })
  }

  useEffect(() => () => clearTimeout(noteTimer.current), [])

  function handleNoteChange(v) {
    setNoteContent(v)
    setNoteSaved(false)
    clearTimeout(noteTimer.current)
    noteTimer.current = setTimeout(async () => {
      setNoteSaving(true)
      try {
        await updateTripNotes(trip.id, v)
        setNoteSaved(true)
        setTimeout(() => setNoteSaved(false), 2000)
      } catch {} finally { setNoteSaving(false) }
    }, 1200)
  }

  async function handleEditImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setEditImgUploading(true)
    try {
      const r = await uploadImage(file)
      setEditForm(f => ({ ...f, cover_image: r.data.url }))
    } catch { } finally { setEditImgUploading(false); e.target.value = '' }
  }

  async function handleClone() {
    const ok = await doConfirm({ message: `Duplicare "${trip.title}"? Verrà creato un nuovo viaggio identico (senza spese).`, confirmLabel: 'Duplica' })
    if (!ok) return
    setCloning(true)
    try {
      const r = await cloneTrip(trip.id)
      navigate(`/trips/${r.data.id}`)
    } catch { } finally { setCloning(false) }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const r = await uploadAttachment(trip.id, file)
      setAttachments(prev => [r.data, ...prev])
    } catch { } finally { setUploading(false); e.target.value = '' }
  }

  async function handleDeleteAttachment(att) {
    const ok = await doConfirm({ message: `Eliminare "${att.name}"?`, confirmLabel: 'Elimina', danger: true })
    if (!ok) return
    await deleteAttachment(trip.id, att.id)
    setAttachments(prev => prev.filter(a => a.id !== att.id))
  }

  return (
    <div>
      {/* ── Dettagli ── */}
      <div className="info-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
          <div className="info-section-title">Dettagli viaggio</div>
          <div style={{ display: 'flex', gap: '.4rem' }}>
            {myRole === 'admin' && (
              <button className="btn btn-secondary btn-sm" onClick={handleClone} disabled={cloning}>
                <Icon name="copy" size={13} /> {cloning ? 'Copia...' : 'Duplica'}
              </button>
            )}
            {canEdit && <button className="btn btn-secondary btn-sm" onClick={openEdit}><Icon name="edit" size={13} /> Modifica</button>}
          </div>
        </div>
        <div className="info-grid">
          <div className="info-item">
            <div className="info-item-label">Destinazione</div>
            <div className="info-item-value"><Icon name="pin" size={14} color="var(--primary)" /> {trip.destination}</div>
          </div>
          <div className="info-item">
            <div className="info-item-label">Date</div>
            <div className="info-item-value">{format(start, 'd MMM', { locale: it })} — {format(end, 'd MMM yyyy', { locale: it })}</div>
          </div>
          <div className="info-item">
            <div className="info-item-label">Durata</div>
            <div className="info-item-value">{numDays} {numDays === 1 ? 'giorno' : 'giorni'}</div>
          </div>
          <div className="info-item">
            <div className="info-item-label">Stato</div>
            <div className="info-item-value">{STATUS_LABELS[trip.status]}</div>
          </div>
          <div className="info-item">
            <div className="info-item-label">Budget totale</div>
            <div className="info-item-value"><Icon name="euro" size={14} color="var(--primary)" />{parseFloat(trip.total_budget || 0).toFixed(2)}</div>
          </div>
          <div className="info-item">
            <div className="info-item-label">Creato da</div>
            <div className="info-item-value">{trip.creator_name}</div>
          </div>
        </div>
        {trip.description && (
          <div className="info-item mt-2">
            <div className="info-item-label">Descrizione</div>
            <div style={{ fontWeight: 400, lineHeight: 1.6, fontSize: '.95rem', color: 'var(--text)', marginTop: '.28rem' }}>{trip.description}</div>
          </div>
        )}
      </div>

      {/* ── Esporta ── */}
      <div className="info-section">
        <div className="info-section-title" style={{ marginBottom: '.75rem' }}>Esporta</div>
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => printItinerary(trip, days || [])}>
            <Icon name="download" size={14} /> PDF / Stampa
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => exportIcal(trip, days || [])}>
            <Icon name="calendar" size={14} /> Calendario (.ics)
          </button>
        </div>
      </div>

      {/* ── Notepad ── */}
      <div className="info-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
          <div className="info-section-title">Note del viaggio</div>
          <span style={{ fontSize: '.72rem', color: noteSaving ? 'var(--text-muted)' : noteSaved ? 'var(--secondary)' : 'transparent', transition: 'color .2s' }}>
            {noteSaving ? 'Salvo...' : '✓ Salvato'}
          </span>
        </div>
        <textarea
          className="form-control"
          rows={4}
          placeholder="Promemoria, idee, numeri utili, checklist libera..."
          value={noteContent}
          onChange={e => handleNoteChange(e.target.value)}
          readOnly={!canEdit}
          style={{ resize: 'vertical', minHeight: 80, fontFamily: 'inherit', fontSize: '.88rem' }}
        />
      </div>

      {/* ── Partecipanti ── */}
      <div className="info-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
          <div className="info-section-title">Partecipanti ({trip.participants?.length || 0})</div>
          {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => setInviteModal(true)}><Icon name="add" size={13} /> Invita</button>}
        </div>
        <div className="participant-list">
          {trip.participants?.map(p => (
            <div key={p.id} className="participant-row">
              <div className="participant-avatar" style={{ background: `hsl(${p.id * 60 + 200},60%,50%)` }}>{initials(p.name)}</div>
              <div className="participant-info">
                <div className="participant-name">{p.name}</div>
                <div className="participant-email">{p.email}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                {myRole === 'admin' && p.role !== 'admin' ? (
                  <CustomSelect value={p.role} onChange={v => changeRole(p.id, v)}
                    options={[{ value: 'editor', label: 'Editor' }, { value: 'viewer', label: 'Viewer' }]}
                    style={{ width: 120 }} />
                ) : (
                  <span className={`role-badge role-${p.role}`}>{p.role}</span>
                )}
                {myRole === 'admin' && p.role !== 'admin' && (
                  <button className="btn btn-ghost btn-icon btn-sm" title="Rimuovi" onClick={() => handleRemoveParticipant(p)}>
                    <Icon name="close" size={15} color="var(--danger)" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {trip.pending_invitations?.map(inv => (
            <div key={inv.invited_email} className="participant-row" style={{ opacity: .7 }}>
              <div className="participant-avatar" style={{ background: 'var(--text-light)' }}>?</div>
              <div className="participant-info">
                <div className="participant-name" style={{ fontStyle: 'italic' }}>In attesa</div>
                <div className="participant-email">{inv.invited_email}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <span className={`role-badge role-${inv.role}`}>{inv.role}</span>
                {canEdit && (
                  <button className="btn btn-ghost btn-icon btn-sm" title="Annulla" onClick={() => handleCancelInvitation(inv.invited_email)}>
                    <Icon name="close" size={15} color="var(--danger)" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Link di invito ── */}
      {canEdit && (
        <div className="info-section">
          <div className="info-section-title" style={{ marginBottom: '.75rem' }}>Link di invito</div>
          {inviteLink ? (
            <div>
              <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.5rem' }}>
                <input className="form-control" readOnly value={inviteLink} style={{ fontSize: '.78rem' }} />
                <button className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }} onClick={copyInviteLink}>
                  <Icon name={inviteCopied ? 'check' : 'copy'} size={14} />
                  {inviteCopied ? 'Copiato!' : 'Copia'}
                </button>
              </div>
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: '.5rem' }}>
                Chiunque abbia questo link può unirsi come editor.
              </div>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', fontSize: '.78rem' }} onClick={handleRevokeInviteLink}>
                Revoca link
              </button>
            </div>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={handleGenerateInviteLink} disabled={inviteLinkLoading}>
              <Icon name="link" size={14} /> {inviteLinkLoading ? 'Generazione...' : 'Genera link di invito'}
            </button>
          )}
        </div>
      )}

      {/* ── Condivisione pubblica ── */}
      {canEdit && (
        <div className="info-section">
          <div className="info-section-title" style={{ marginBottom: '.75rem' }}>Condivisione pubblica</div>
          {shareLink ? (
            <div>
              <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.5rem' }}>
                <input className="form-control" readOnly value={shareLink} style={{ fontSize: '.78rem' }} />
                <button className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }} onClick={copyShareLink}>
                  <Icon name={shareCopied ? 'check' : 'copy'} size={14} />
                  {shareCopied ? 'Copiato!' : 'Copia'}
                </button>
              </div>
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: '.5rem' }}>
                Chiunque (anche senza account) può vedere l'itinerario in sola lettura.
              </div>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', fontSize: '.78rem' }} onClick={handleToggleShare} disabled={shareLoading}>
                Disattiva condivisione
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: '.6rem' }}>
                Genera un link pubblico in sola lettura per condividere l'itinerario con chiunque.
              </div>
              <button className="btn btn-secondary btn-sm" onClick={handleToggleShare} disabled={shareLoading}>
                <Icon name="share2" size={14} /> {shareLoading ? 'Generazione...' : 'Attiva condivisione'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Allegati ── */}
      <div className="info-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
          <div className="info-section-title">Documenti e allegati {attachments.length > 0 && `(${attachments.length})`}</div>
          {canEdit && (
            <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <Icon name="attach" size={14} /> {uploading ? 'Caricamento...' : 'Allega'}
            </button>
          )}
        </div>
        <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} />

        {attLoading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '.875rem' }}>Caricamento...</div>
        ) : attachments.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '.875rem', fontStyle: 'italic' }}>
            Nessun allegato. {canEdit && 'Allega biglietti, conferme di prenotazione o altri documenti.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            {attachments.map(att => (
              <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.6rem', background: 'var(--bg)', borderRadius: 'var(--radius)', border: '1px solid var(--border-light)' }}>
                <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>{fileIcon(att.mime_type)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.875rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <a role="button" tabIndex={0}
                      onClick={() => openAttachment(att.file_path).catch(() => alert('Impossibile aprire il file'))}
                      style={{ color: 'var(--text)', textDecoration: 'none', cursor: 'pointer' }}>{att.name}</a>
                  </div>
                  <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                    {formatBytes(att.file_size)} · {att.uploader_name}
                  </div>
                </div>
                {canEdit && (
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDeleteAttachment(att)}>
                    <Icon name="trash" size={14} color="var(--danger)" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modali ── */}
      {editModal && (
        <Modal title="Modifica viaggio" onClose={() => setEditModal(false)}
          footer={<><button className="btn btn-secondary" onClick={() => setEditModal(false)}>Annulla</button>
            <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>{saving ? 'Salvo...' : 'Salva'}</button></>}>
          <div className="form-group"><label className="form-label">Titolo</label>
            <input className="form-control" value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Destinazione</label>
            <input className="form-control" value={editForm.destination} onChange={e => setEditForm({ ...editForm, destination: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Stato</label>
            <CustomSelect value={editForm.status} onChange={v => setEditForm({ ...editForm, status: v })}
              options={[{ value: 'pianificazione', label: 'Pianificazione' }, { value: 'confermato', label: 'Confermato' }, { value: 'concluso', label: 'Concluso' }]} /></div>
          <div className="form-group"><label className="form-label">Budget totale (€)</label>
            <input className="form-control" type="number" min="0" step="0.01" value={editForm.total_budget}
              onChange={e => setEditForm({ ...editForm, total_budget: e.target.value })} /></div>
          <div className="form-group">
            <label className="form-label">Copertina</label>
            <div style={{ display: 'flex', gap: '.5rem', marginBottom: editForm.cover_image ? '.5rem' : 0 }}>
              <input className="form-control" value={editForm.cover_image || ''} placeholder="URL immagine"
                onChange={e => setEditForm({ ...editForm, cover_image: e.target.value })} />
              <button type="button" className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }}
                disabled={editImgUploading} onClick={() => editImageRef.current?.click()}>
                <Icon name="upload" size={13} /> {editImgUploading ? '...' : 'Carica'}
              </button>
            </div>
            {editForm.cover_image && (
              <div style={{ height: 80, borderRadius: 8, overflow: 'hidden' }}>
                <img src={editForm.cover_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={e => { e.target.style.display = 'none' }} />
              </div>
            )}
            <input ref={editImageRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleEditImageUpload} />
          </div>
          <div className="form-group"><label className="form-label">Descrizione</label>
            <textarea className="form-control" rows={3} value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} /></div>
        </Modal>
      )}

      {inviteModal && (
        <Modal title="Invita partecipante" onClose={() => { setInviteModal(false); setMsg('') }}
          footer={<><button className="btn btn-secondary" onClick={() => setInviteModal(false)}>Chiudi</button>
            <button className="btn btn-primary" onClick={sendInvite} disabled={saving}>{saving ? 'Invio...' : 'Invita'}</button></>}>
          {msg && <div className={`alert ${msg.includes('ato') ? 'alert-success' : 'alert-error'}`}>{msg}</div>}
          <div className="form-group"><label className="form-label">Email</label>
            <input className="form-control" type="email" placeholder="amico@esempio.it"
              value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Ruolo</label>
            <CustomSelect value={inviteRole} onChange={v => setInviteRole(v)}
              options={[{ value: 'editor', label: 'Editor (può modificare)' }, { value: 'viewer', label: 'Viewer (sola lettura)' }]} /></div>
        </Modal>
      )}

      {confirmModal}
    </div>
  )
}
