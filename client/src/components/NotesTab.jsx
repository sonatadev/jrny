import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from './Icon'
import { useConfirm } from './ConfirmModal'
import NoteImagesBoard from './NoteImagesBoard'
import { addNote, deleteNote } from '../js/api'

const NOTE_PALETTE = ['#f59e0b', '#c26b4a', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#ef4444', '#6b7280']

const SCOPE_FILTERS = [
  { key: 'all',         label: 'Tutte' },
  { key: 'general',     label: 'Generali' },
  { key: 'city',        label: 'Per città' },
  { key: 'participant', label: 'Personali' },
]

function scopeBadge(note) {
  if (note.scope === 'city') return { icon: 'pin', text: note.city_name || 'Città' }
  if (note.scope === 'participant') return { icon: 'person', text: note.participant_name || 'Partecipante' }
  return null
}

// Estrae un'anteprima testuale dal corpo HTML (mai iniettato come HTML nella card)
function htmlToExcerpt(html, max = 160) {
  if (!html) return ''
  let text = ''
  try {
    text = new DOMParser().parseFromString(html, 'text/html').body.textContent || ''
  } catch {
    text = html.replace(/<[^>]*>/g, ' ')
  }
  text = text.replace(/\s+/g, ' ').trim()
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text
}

// Rileva se il corpo contiene un'immagine (per mostrare un indicatore sulla card)
function hasImage(html) {
  return !!html && /<img\b/i.test(html)
}

/* ─── NoteCard ───────────────────────────────────────────────────────────────── */
function NoteCard({ note, canEdit, onOpen, onDelete }) {
  const badge = scopeBadge(note)
  const excerpt = htmlToExcerpt(note.body)
  return (
    <div className="card note-card" style={{ padding: '.85rem 1rem', borderLeft: `4px solid ${note.color || '#f59e0b'}`, cursor: 'pointer' }}
      role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {note.title && <div style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: '.2rem' }}>{note.title}</div>}
          {excerpt && <div style={{ fontSize: '.85rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{excerpt}</div>}
          {(badge || hasImage(note.body)) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginTop: '.5rem', flexWrap: 'wrap' }}>
              {badge && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.72rem', color: 'var(--text-light)', background: 'var(--surface)', padding: '.15rem .5rem', borderRadius: 99 }}>
                  <Icon name={badge.icon} size={12} color="var(--text-light)" />
                  {badge.text}
                </span>
              )}
              {hasImage(note.body) && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.25rem', fontSize: '.72rem', color: 'var(--text-light)' }}>
                  <Icon name="image" size={12} color="var(--text-light)" /> Immagine
                </span>
              )}
            </div>
          )}
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: '.1rem', flexShrink: 0 }}>
            <button className="btn btn-ghost btn-icon btn-sm" title="Elimina"
              onClick={e => { e.stopPropagation(); onDelete() }}>
              <Icon name="trash" size={14} color="var(--danger)" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── NotesTab ───────────────────────────────────────────────────────────────── */
export default function NotesTab({ tripId, notes = [], noteImages = [], myRole, onRefresh }) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const [creating, setCreating] = useState(false)
  const { confirm: doConfirm, modal: confirmModal } = useConfirm()
  const canEdit = myRole === 'admin' || myRole === 'editor'

  const filtered = filter === 'all' ? notes : notes.filter(n => n.scope === filter)

  function openNote(note) {
    navigate(`/trips/${tripId}/note/${note.id}`)
  }

  async function createNote() {
    if (creating) return
    setCreating(true)
    try {
      const { data } = await addNote(tripId, { title: 'Senza titolo', scope: 'general', color: NOTE_PALETTE[0] })
      navigate(`/trips/${tripId}/note/${data.id}`)
    } catch { setCreating(false) }
  }

  async function handleDelete(note) {
    const ok = await doConfirm({ message: 'Eliminare questa nota?', confirmLabel: 'Elimina', danger: true })
    if (!ok) return
    try { await deleteNote(tripId, note.id); onRefresh() } catch {}
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <div className="act-slot-row" style={{ margin: 0, flexWrap: 'wrap' }}>
          {SCOPE_FILTERS.map(f => (
            <button key={f.key} type="button"
              className={`act-slot-pill${filter === f.key ? ' active' : ''}`}
              style={filter === f.key ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : {}}
              onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={createNote} disabled={creating}>
            <Icon name="add" size={14} /> {creating ? 'Creo...' : 'Nuova nota'}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Icon name="notes" size={28} color="var(--primary)" /></div>
          <div>Nessuna nota</div>
          {canEdit && <div style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginTop: '.3rem' }}>Aggiungi promemoria generali, per città o per partecipante.</div>}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '.75rem' }}>
          {filtered.map(note => (
            <NoteCard key={note.id} note={note} canEdit={canEdit}
              onOpen={() => openNote(note)} onDelete={() => handleDelete(note)} />
          ))}
        </div>
      )}

      <NoteImagesBoard tripId={tripId} images={noteImages} myRole={myRole} onRefresh={onRefresh} />

      {confirmModal}
    </div>
  )
}
