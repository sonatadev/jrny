import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from './Icon'
import CustomSelect from './CustomSelect'
import { useConfirm } from './ConfirmModal'
import NoteImagesBoard from './NoteImagesBoard'
import { noteCatLabel, noteCatColor } from '../js/noteCategories'
import {
  addNote, deleteNote, updateNote,
  addChecklistItem, updateChecklistItem, deleteChecklistItem,
} from '../js/api'

const NOTE_PALETTE = ['#f59e0b', '#c26b4a', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#ef4444', '#6b7280']

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

/* ─── ChecklistBody ───────────────────────────────────────────────────────────
   Lista di voci spuntabili, condivisa tra il board del viaggio (noteId null) e le
   nota-liste (noteId valorizzato). Aggiorna in modo ottimistico e poi richiama
   onRefresh per riconciliare con il server. */
function ChecklistBody({ tripId, noteId, items, participants, canEdit, onRefresh }) {
  const [list, setList] = useState(items)
  const [text, setText] = useState('')
  const [assignee, setAssignee] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => { setList(items) }, [items])

  const partOptions = [
    { value: '', label: 'Nessuno' },
    ...participants.map(p => ({ value: String(p.user_id || p.id), label: p.name })),
  ]

  async function addItem() {
    const t = text.trim()
    if (!t || adding) return
    setAdding(true)
    try {
      await addChecklistItem(tripId, { text: t, note_id: noteId || undefined, assigned_to: assignee || undefined })
      setText(''); setAssignee('')
      onRefresh()
    } catch { /* noop */ } finally { setAdding(false) }
  }

  async function toggle(item) {
    setList(l => l.map(i => (i.id === item.id ? { ...i, done: !i.done } : i)))
    try { await updateChecklistItem(tripId, item.id, { done: !item.done }); onRefresh() } catch { onRefresh() }
  }

  async function assign(item, value) {
    const assignee_name = participants.find(p => String(p.user_id || p.id) === value)?.name || null
    setList(l => l.map(i => (i.id === item.id ? { ...i, assigned_to: value || null, assignee_name } : i)))
    try { await updateChecklistItem(tripId, item.id, { assigned_to: value || null }); onRefresh() } catch { onRefresh() }
  }

  async function remove(item) {
    setList(l => l.filter(i => i.id !== item.id))
    try { await deleteChecklistItem(tripId, item.id); onRefresh() } catch { onRefresh() }
  }

  const total = list.length
  const done = list.filter(i => i.done).length
  const pct = total ? Math.round((done / total) * 100) : 0

  return (
    <div>
      {total > 0 && (
        <div style={{ marginBottom: '.6rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: '.25rem' }}>
            <span>{done}/{total} completate</span><span>{pct}%</span>
          </div>
          <div style={{ height: 6, background: 'var(--surface)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--secondary, #10b981)', transition: 'width .25s' }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
        {list.map(item => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.35rem .1rem', flexWrap: 'wrap' }}>
            <button type="button" disabled={!canEdit} onClick={() => toggle(item)}
              aria-label={item.done ? 'Segna da fare' : 'Segna completata'}
              style={{
                width: 20, height: 20, flexShrink: 0, borderRadius: 5, cursor: canEdit ? 'pointer' : 'default',
                border: `2px solid ${item.done ? 'var(--secondary, #10b981)' : 'var(--border)'}`,
                background: item.done ? 'var(--secondary, #10b981)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              }}>
              {item.done && <Icon name="check" size={13} color="#fff" />}
            </button>
            <span style={{
              flex: '1 1 120px', minWidth: 0, fontSize: '.9rem', wordBreak: 'break-word',
              textDecoration: item.done ? 'line-through' : 'none',
              color: item.done ? 'var(--text-muted)' : 'var(--text)',
            }}>{item.text}</span>
            {/* Chip assegnatario solo in sola lettura: in modifica il nome è già nel select */}
            {!canEdit && item.assignee_name && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.25rem', maxWidth: 140, fontSize: '.72rem', color: 'var(--text-light)', background: 'var(--surface)', padding: '.1rem .45rem', borderRadius: 99, flexShrink: 0 }}>
                <Icon name="person" size={11} color="var(--text-light)" />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.assignee_name}</span>
              </span>
            )}
            {canEdit && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '.25rem', flexShrink: 0, marginLeft: 'auto' }}>
                {participants.length > 0 && (
                  <CustomSelect value={String(item.assigned_to || '')} onChange={v => assign(item, v)}
                    options={partOptions} style={{ width: 130 }} />
                )}
                <button className="btn btn-ghost btn-icon btn-sm" title="Elimina" onClick={() => remove(item)}>
                  <Icon name="trash" size={13} color="var(--danger)" />
                </button>
              </div>
            )}
          </div>
        ))}
        {total === 0 && (
          <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '.2rem 0' }}>
            Nessuna voce.{canEdit && ' Aggiungine una qui sotto.'}
          </div>
        )}
      </div>

      {canEdit && (
        <div style={{ display: 'flex', gap: '.4rem', marginTop: '.6rem', flexWrap: 'wrap' }}>
          <input className="form-control" placeholder="Aggiungi una voce…" value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
            style={{ flex: 1, minWidth: 140, fontSize: '.88rem' }} />
          {participants.length > 0 && (
            <CustomSelect value={assignee} onChange={setAssignee} options={partOptions} style={{ width: 130 }} />
          )}
          <button className="btn btn-primary btn-sm" onClick={addItem} disabled={adding || !text.trim()} style={{ flexShrink: 0 }}>
            <Icon name="add" size={14} /> Aggiungi
          </button>
        </div>
      )}
    </div>
  )
}

/* ─── TodoCard (opzione: nota-lista) ──────────────────────────────────────────
   Una nota di tipo 'todo' resa come checklist collassabile. */
function TodoCard({ note, items, tripId, participants, canEdit, onRefresh, onDelete }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(note.title || '')
  const [renamingHeader, setRenamingHeader] = useState(false)
  const headerInputRef = useRef(null)
  useEffect(() => { setTitle(note.title || '') }, [note.title])
  useEffect(() => { if (renamingHeader) headerInputRef.current?.select() }, [renamingHeader])

  const total = items.length
  const done = items.filter(i => i.done).length

  async function saveTitle() {
    const t = title.trim()
    if (!t || t === note.title) { setTitle(note.title || ''); return }
    try {
      await updateNote(tripId, note.id, {
        title: t, body: note.body || '', scope: note.scope, color: note.color,
        city_id: note.city_id, participant_user_id: note.participant_user_id,
      })
      onRefresh()
    } catch { setTitle(note.title || '') }
  }

  const badge = scopeBadge(note)

  function startHeaderRename(e) {
    if (!canEdit) return
    e.stopPropagation()
    setTitle(note.title || '')
    setRenamingHeader(true)
  }

  async function commitHeaderRename() {
    setRenamingHeader(false)
    await saveTitle()
  }

  return (
    <div className="card" style={{ padding: '.85rem 1rem', borderLeft: `4px solid ${note.color || '#3b82f6'}`, overflow: open ? 'visible' : 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
        <button type="button" className="btn btn-ghost btn-icon btn-sm"
          onClick={() => !renamingHeader && setOpen(o => !o)}
          title={open ? 'Chiudi' : 'Apri'} style={{ flexShrink: 0 }}>
          <Icon name="list" size={16} color="var(--primary)" />
        </button>
        <div style={{ flex: 1, minWidth: 0, cursor: renamingHeader ? 'default' : 'pointer' }}
          onClick={() => !renamingHeader && setOpen(o => !o)}>
          {renamingHeader ? (
            <input ref={headerInputRef} className="form-control"
              style={{ fontWeight: 700, fontSize: '.95rem', height: 'auto', padding: '.15rem .35rem' }}
              value={title} onChange={e => setTitle(e.target.value)}
              onBlur={commitHeaderRename}
              onKeyDown={e => {
                e.stopPropagation()
                if (e.key === 'Enter') e.target.blur()
                if (e.key === 'Escape') { setTitle(note.title || ''); setRenamingHeader(false) }
              }}
              onClick={e => e.stopPropagation()} />
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: '.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                onDoubleClick={canEdit ? startHeaderRename : undefined}>
                {note.title || 'Lista'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '.15rem' }}>
                <span style={{ fontSize: '.75rem', color: done === total && total > 0 ? 'var(--secondary, #10b981)' : 'var(--text-muted)' }}>
                  {done}/{total} completate
                </span>
                {badge && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.25rem', fontSize: '.72rem', color: 'var(--text-light)' }}>
                    <Icon name={badge.icon} size={11} color="var(--text-light)" />{badge.text}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
        {canEdit && (
          <button className="btn btn-ghost btn-icon btn-sm" title="Elimina lista" onClick={onDelete} style={{ flexShrink: 0 }}>
            <Icon name="trash" size={14} color="var(--danger)" />
          </button>
        )}
      </div>

      {open && (
        <div style={{ marginTop: '.75rem', paddingTop: '.75rem', borderTop: '1px solid var(--border-light)' }}>
          {canEdit && (
            <input className="form-control" value={title} placeholder="Titolo della lista"
              onChange={e => setTitle(e.target.value)} onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
              style={{ marginBottom: '.6rem', fontWeight: 600 }} />
          )}
          <ChecklistBody tripId={tripId} noteId={note.id} items={items}
            participants={participants} canEdit={canEdit} onRefresh={onRefresh} />
        </div>
      )}
    </div>
  )
}

/* ─── NoteCard ───────────────────────────────────────────────────────────────── */
function NoteCard({ note, canEdit, onOpen, onDelete, onRename }) {
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const inputRef = useRef(null)
  const badge = scopeBadge(note)
  const excerpt = htmlToExcerpt(note.body)

  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  function startEdit(e) {
    if (!canEdit) return
    e.stopPropagation()
    e.preventDefault()
    setDraftTitle(note.title || '')
    setEditing(true)
  }

  async function commitEdit() {
    setEditing(false)
    const t = draftTitle.trim()
    if (!t || t === note.title) { setDraftTitle(note.title || ''); return }
    await onRename(note, t)
  }

  function cancelEdit() {
    setEditing(false)
    setDraftTitle(note.title || '')
  }

  return (
    <div className="card note-card" style={{ padding: '.85rem 1rem', borderLeft: `4px solid ${note.color || '#f59e0b'}`, cursor: editing ? 'default' : 'pointer' }}
      role="button" tabIndex={0} onClick={editing ? undefined : onOpen}
      onKeyDown={e => { if (!editing && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen() } }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <input ref={inputRef} className="form-control"
              style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: '.2rem', padding: '.15rem .35rem', height: 'auto' }}
              value={draftTitle} onChange={e => setDraftTitle(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } if (e.key === 'Escape') cancelEdit() }}
              onClick={e => e.stopPropagation()} />
          ) : (
            note.title && (
              <div style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: '.2rem' }}
                onDoubleClick={canEdit ? startEdit : undefined}>
                {note.title}
              </div>
            )
          )}
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
export default function NotesTab({ tripId, notes = [], noteImages = [], checklist = [], participants = [], myRole, onRefresh }) {
  const navigate = useNavigate()
  const [expandedCats, setExpandedCats] = useState(() => new Set()) // vuoto = tutte chiuse di default
  const [creating, setCreating] = useState(false)
  const [creatingTodo, setCreatingTodo] = useState(false)
  const [renamingCat, setRenamingCat] = useState(null)
  const [catDraft, setCatDraft] = useState('')
  const catInputRef = useRef(null)
  const { confirm: doConfirm, modal: confirmModal } = useConfirm()
  const canEdit = myRole === 'admin' || myRole === 'editor'

  useEffect(() => { if (renamingCat) catInputRef.current?.select() }, [renamingCat])

  // Separa le note normali dalle nota-liste (opzione 3)
  const textNotes = notes.filter(n => n.kind !== 'todo')
  const todoNotes = notes.filter(n => n.kind === 'todo')
  const filtered = textNotes

  // Raggruppa le note per categoria; le senza categoria vanno in fondo.
  const NONE = '__none__'
  const groups = (() => {
    const map = new Map()
    for (const n of filtered) {
      const k = n.category || NONE
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(n)
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a === NONE ? 1 : b === NONE ? -1 : a.localeCompare(b)))
      .map(([cat, items]) => ({
        cat,
        label: cat === NONE ? 'Senza categoria' : noteCatLabel(cat),
        color: cat === NONE ? 'var(--text-light)' : noteCatColor(cat),
        items,
      }))
  })()

  // Una sezione è aperta se espansa manualmente (di default sono tutte chiuse).
  const isOpen = cat => expandedCats.has(cat)
  const allExpanded = groups.length > 0 && groups.every(g => isOpen(g.cat))

  function toggleCat(cat) {
    setExpandedCats(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  function toggleAll() {
    setExpandedCats(allExpanded ? new Set() : new Set(groups.map(g => g.cat)))
  }

  // Voci raggruppate per nota-lista
  const itemsByNote = id => checklist.filter(i => i.note_id === id)

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

  async function createTodoCard() {
    if (creatingTodo) return
    setCreatingTodo(true)
    try {
      await addNote(tripId, { title: 'Nuova lista', kind: 'todo', scope: 'general', color: NOTE_PALETTE[2] })
      onRefresh()
    } catch { /* noop */ } finally { setCreatingTodo(false) }
  }

  async function handleRename(note, newTitle) {
    try {
      await updateNote(tripId, note.id, {
        title: newTitle, body: note.body || '', scope: note.scope, color: note.color,
        category: note.category || null, city_id: note.city_id || null,
        participant_user_id: note.participant_user_id || null,
      })
      onRefresh()
    } catch { /* noop */ }
  }

  async function commitCatRename() {
    const oldCat = renamingCat
    const newCat = catDraft.trim()
    setRenamingCat(null)
    setCatDraft('')
    if (!newCat || newCat === oldCat) return
    const group = groups.find(g => g.cat === oldCat)
    if (!group) return
    try {
      await Promise.all(group.items.map(note =>
        updateNote(tripId, note.id, {
          title: note.title, body: note.body || '', scope: note.scope, color: note.color,
          category: newCat, city_id: note.city_id || null,
          participant_user_id: note.participant_user_id || null,
        })
      ))
      onRefresh()
    } catch { /* noop */ }
  }

  async function handleDelete(note) {
    const ok = await doConfirm({ message: 'Eliminare questa nota?', confirmLabel: 'Elimina', danger: true })
    if (!ok) return
    try { await deleteNote(tripId, note.id); onRefresh() } catch {}
  }

  async function handleDeleteTodo(note) {
    const ok = await doConfirm({ message: 'Eliminare questa lista?', confirmLabel: 'Elimina', danger: true })
    if (!ok) return
    try { await deleteNote(tripId, note.id); onRefresh() } catch {}
  }

  return (
    <div>
      {/* ── Liste / To-do (nota-liste) ── */}
      {(todoNotes.length > 0 || canEdit) && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem' }}>
            <div className="info-section-title">Liste</div>
            {canEdit && (
              <button className="btn btn-secondary btn-sm" onClick={createTodoCard} disabled={creatingTodo}>
                <Icon name="add" size={14} /> {creatingTodo ? 'Creo...' : 'Nuova lista'}
              </button>
            )}
          </div>
          {todoNotes.length === 0 ? (
            <div style={{ fontSize: '.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Nessuna lista. Crea checklist tematiche (prenotazioni, packing, documenti…).
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '.75rem' }}>
              {todoNotes.map(note => (
                <TodoCard key={note.id} note={note} items={itemsByNote(note.id)} tripId={tripId}
                  participants={participants} canEdit={canEdit} onRefresh={onRefresh}
                  onDelete={() => handleDeleteTodo(note)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Note ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          {groups.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={toggleAll}
              style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
              {allExpanded ? 'Comprimi tutto' : 'Espandi tutto'}
            </button>
          )}
          {canEdit && (
            <button className="btn btn-primary btn-sm" onClick={createNote} disabled={creating}>
              <Icon name="add" size={14} /> {creating ? 'Creo...' : 'Nuova nota'}
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Icon name="notes" size={28} color="var(--primary)" /></div>
          <div>Nessuna nota</div>
          {canEdit && <div style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginTop: '.3rem' }}>Aggiungi promemoria generali, per città o per partecipante.</div>}
        </div>
      ) : (
        groups.map(group => {
          const open = isOpen(group.cat)
          const initials = group.cat === NONE ? '—' : group.cat.slice(0, 3).toUpperCase()
          return (
            <div key={group.cat} style={{ marginBottom: open ? '1.75rem' : '.5rem' }}>
              <div role="button" tabIndex={0}
                onClick={() => renamingCat !== group.cat && toggleCat(group.cat)}
                onKeyDown={e => { if (renamingCat !== group.cat && (e.key === 'Enter' || e.key === ' ')) toggleCat(group.cat) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '.5rem', width: '100%',
                  background: 'none', border: 'none', cursor: renamingCat === group.cat ? 'default' : 'pointer', textAlign: 'left',
                  padding: '0 0 .4rem', marginBottom: open ? '.8rem' : 0,
                  borderBottom: `2px solid ${group.color}40`,
                }}>
                <span style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: group.color + '22', border: `1.5px solid ${group.color}60`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '.58rem', fontWeight: 800, color: group.color,
                }}>{initials}</span>
                {renamingCat === group.cat ? (
                  <input ref={catInputRef} className="form-control"
                    style={{ fontWeight: 800, fontSize: '1rem', flex: 1, height: 'auto', padding: '.1rem .35rem' }}
                    value={catDraft} onChange={e => setCatDraft(e.target.value)}
                    onBlur={commitCatRename}
                    onKeyDown={e => {
                      e.stopPropagation()
                      if (e.key === 'Enter') e.target.blur()
                      if (e.key === 'Escape') { setRenamingCat(null); setCatDraft('') }
                    }}
                    onClick={e => e.stopPropagation()} />
                ) : (
                  <>
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text)' }}
                      onDoubleClick={canEdit && group.cat !== NONE ? e => { e.stopPropagation(); setCatDraft(group.cat); setRenamingCat(group.cat) } : undefined}>
                      {group.label}
                    </span>
                    <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>({group.items.length})</span>
                    <Icon name="chevronDown" size={15} color="var(--text-muted)"
                      style={{ marginLeft: 'auto', flexShrink: 0, transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .18s' }} />
                  </>
                )}
              </div>
              {open && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '.75rem' }}>
                  {group.items.map(note => (
                    <NoteCard key={note.id} note={note} canEdit={canEdit}
                      onOpen={() => openNote(note)} onDelete={() => handleDelete(note)}
                      onRename={handleRename} />
                  ))}
                </div>
              )}
            </div>
          )
        })
      )}

      <NoteImagesBoard tripId={tripId} images={noteImages} myRole={myRole} onRefresh={onRefresh} />

      {confirmModal}
    </div>
  )
}
