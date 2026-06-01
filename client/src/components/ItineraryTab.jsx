import { useState, useMemo, useEffect, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { createPortal } from 'react-dom'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Modal from './Modal'
import Icon from './Icon'
import { useConfirm } from './ConfirmModal'
import CustomSelect from './CustomSelect'
import { addActivity, updateActivity, deleteActivity, updateDay, addCity, deleteCity, reorderActivities, toggleActivityComplete, uploadTripPhoto, deleteTripPhoto } from '../js/api'

const SLOTS = [
  { key: 'mattina',    label: 'Mattina',     colorClass: 'slot-icon-mattina',    color: '#f59e0b' },
  { key: 'pomeriggio', label: 'Pomeriggio',  colorClass: 'slot-icon-pomeriggio', color: '#ef8c1a' },
  { key: 'sera',       label: 'Sera',        colorClass: 'slot-icon-sera',       color: '#8b5cf6' },
  { key: 'notte',      label: 'Notte',       colorClass: 'slot-icon-notte',      color: '#3b82f6' },
]

const CATEGORIES = ['tempio', 'chiesa', 'cibo', 'natura', 'shopping', 'museo', 'palestra', 'sport', 'teatro', 'cinema', 'musica', 'nightlife', 'benessere', 'libreria', 'zoo', 'acquario', 'farmacia', 'supermercato', 'trasporto', 'alloggio', 'altro']
const CAT_COLOR = { tempio: '#8b5cf6', chiesa: '#d4a017', cibo: '#f59e0b', natura: '#10b981', shopping: '#ec4899', museo: '#3b82f6', palestra: '#ef4444', sport: '#f97316', teatro: '#a21caf', cinema: '#4f46e5', musica: '#be185d', nightlife: '#9333ea', benessere: '#0d9488', libreria: '#854d0e', zoo: '#65a30d', acquario: '#0891b2', farmacia: '#16a34a', supermercato: '#0369a1', trasporto: '#6b7280', alloggio: '#c26b4a', altro: '#b89d82' }
const CAT_EMOJI = { tempio: '⛩', chiesa: '⛪', cibo: '🍜', natura: '🌿', shopping: '🛍', museo: '🏛', palestra: '🏋', sport: '⚽', teatro: '🎭', cinema: '🎬', musica: '🎵', nightlife: '🌙', benessere: '🧖', libreria: '📚', zoo: '🦁', acquario: '🐠', farmacia: '💊', supermercato: '🛒', trasporto: '🚆', alloggio: '🏨', altro: '⭐' }

const CITY_PALETTE = ['#c26b4a', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#ef4444', '#6b7280']

/* ─── ActivityModal (add + edit) ───────────────────────────────────────────── */
function ActivityModal({ dayId, slot, tripId, onSaved, onClose, wishlist, activity }) {
  const isEdit = !!activity
  const [form, setForm] = useState(
    isEdit
      ? {
          slot: activity.slot,
          name: activity.name,
          time: activity.time?.slice(0, 5) || '',
          duration: activity.duration || '',
          category: activity.category || 'altro',
          notes: activity.notes || '',
          wishlist_place_id: activity.wishlist_place_id || '',
        }
      : { slot, name: '', time: '', duration: '', category: 'altro', notes: '', wishlist_place_id: '' }
  )
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function handleWishlistSelect(id) {
    if (id) {
      const place = wishlist.find(p => p.id === parseInt(id))
      if (place) {
        set('name', place.name)
        set('category', place.category || 'altro')
        set('wishlist_place_id', id)
      }
    } else {
      set('wishlist_place_id', '')
    }
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const payload = {
        ...form,
        duration: form.duration ? parseInt(form.duration) : null,
        wishlist_place_id: form.wishlist_place_id ? parseInt(form.wishlist_place_id) : null,
      }
      if (isEdit) {
        await updateActivity(tripId, dayId, activity.id, payload)
      } else {
        await addActivity(tripId, dayId, payload)
      }
      onSaved()
      onClose()
    } catch { } finally { setSaving(false) }
  }

  const availableWishlist = wishlist?.filter(p => !p.is_slotted || p.id === form.wishlist_place_id) || []

  return (
    <Modal title={isEdit ? 'Modifica attività' : 'Aggiungi attività'} onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" onClick={save} disabled={saving || !form.name.trim()}>
          {saving ? 'Salvo...' : isEdit ? 'Salva' : 'Aggiungi'}
        </button>
      </>}
    >
      <div className="act-slot-row">
        {SLOTS.map(s => (
          <button key={s.key} type="button"
            className={`act-slot-pill${form.slot === s.key ? ' active' : ''}`}
            style={form.slot === s.key ? { background: s.color, color: '#fff', borderColor: s.color } : {}}
            onClick={() => set('slot', s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {!isEdit && availableWishlist.length > 0 && (
        <div className="form-group">
          <label className="form-label">Dalla wishlist</label>
          <CustomSelect
            value={String(form.wishlist_place_id || '')}
            onChange={handleWishlistSelect}
            placeholder="— attività personalizzata —"
            options={[
              { value: '', label: '— attività personalizzata —' },
              ...availableWishlist.map(p => ({
                value: String(p.id),
                label: p.name + (p.city ? ` · ${p.city}` : ''),
              })),
            ]}
          />
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Nome attività *</label>
        <input className="form-control" required placeholder="Es. Visita al Fushimi Inari"
          value={form.name} onChange={e => set('name', e.target.value)} />
      </div>

      <div className="form-row act-time-row">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Orario</label>
          <input className="form-control" type="time" value={form.time} onChange={e => set('time', e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Durata (min)</label>
          <input className="form-control" type="number" min="0" step="15" placeholder="60"
            value={form.duration} onChange={e => set('duration', e.target.value)} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Categoria</label>
        <div className="cat-chip-grid">
          {CATEGORIES.map(c => (
            <button key={c} type="button"
              className={`cat-chip${form.category === c ? ' active' : ''}`}
              style={form.category === c
                ? { background: CAT_COLOR[c], borderColor: CAT_COLOR[c], color: '#fff' }
                : { borderColor: CAT_COLOR[c] + '70', color: 'var(--text-muted)' }}
              onClick={() => set('category', c)}
            >
              <span style={{ fontSize: '1rem' }}>{CAT_EMOJI[c]}</span>
              <span>{c.charAt(0).toUpperCase() + c.slice(1)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Note</label>
        <textarea className="form-control" rows={2} placeholder="Note aggiuntive..."
          value={form.notes} onChange={e => set('notes', e.target.value)} />
      </div>
    </Modal>
  )
}

/* ─── CitiesManagerModal ────────────────────────────────────────────────────── */
function CitiesManagerModal({ tripId, cities, days, myRole, onSaved, onClose }) {
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(CITY_PALETTE[0])
  const [saving, setSaving] = useState(false)
  const canEdit = myRole === 'admin' || myRole === 'editor'
  const { confirm: doConfirm, modal: confirmModal } = useConfirm()

  async function handleAdd() {
    if (!newName.trim()) return
    setSaving(true)
    try {
      await addCity(tripId, { name: newName.trim(), color: newColor })
      setNewName('')
      onSaved()
    } catch { } finally { setSaving(false) }
  }

  async function handleDelete(cityId, cityName) {
    const ok = await doConfirm({
      message: `Eliminare "${cityName}"? I giorni associati perderanno la città.`,
      confirmLabel: 'Elimina', danger: true,
    })
    if (!ok) return
    await deleteCity(tripId, cityId)
    onSaved()
  }

  return (
    <Modal title="Gestisci città" onClose={onClose}
      footer={<button className="btn btn-secondary" onClick={onClose}>Chiudi</button>}
    >
      {canEdit && (
        <div className="city-add-block">
          <div className="city-color-row">
            <span className="form-label" style={{ margin: 0 }}>Colore</span>
            <div className="city-color-dots">
              {CITY_PALETTE.map(c => (
                <button key={c} type="button"
                  className={`city-color-dot${newColor === c ? ' active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setNewColor(c)}
                />
              ))}
            </div>
          </div>
          <div className="city-add-row">
            <input className="form-control" placeholder="Nome città (es. Tokyo)"
              value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()} />
            <button className="btn btn-primary btn-sm" onClick={handleAdd}
              disabled={saving || !newName.trim()} style={{ flexShrink: 0 }}>
              <Icon name="add" size={14} /> Aggiungi
            </button>
          </div>
        </div>
      )}

      {cities.length === 0 ? (
        <p style={{ color: 'var(--text-light)', fontStyle: 'italic', fontSize: '.875rem', padding: '.5rem 0' }}>
          Nessuna città aggiunta. Inserisci le città del tuo viaggio.
        </p>
      ) : (
        <div className="cities-list">
          {cities.map(city => {
            const n = days.filter(d => d.city_id === city.id).length
            return (
              <div key={city.id} className="city-list-item">
                <span className="city-list-dot" style={{ background: city.color }} />
                <div className="city-list-info">
                  <span className="city-list-name">{city.name}</span>
                  <span className="city-list-count">{n > 0 ? `${n} giorn${n === 1 ? 'o' : 'i'}` : 'Nessun giorno'}</span>
                </div>
                {canEdit && (
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(city.id, city.name)}>
                    <Icon name="trash" size={14} color="var(--danger)" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="city-manager-hint">
        Per assegnare un giorno a una città, clicca ✏️ sul giorno nell'itinerario.
      </div>
      {confirmModal}
    </Modal>
  )
}

/* ─── CompleteDot ───────────────────────────────────────────────────────────── */
function CompleteDot({ completed, onToggle }) {
  return (
    <div
      onClick={e => { e.stopPropagation(); onToggle() }}
      style={{
        width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
        border: `2px solid ${completed ? 'var(--secondary)' : 'var(--border)'}`,
        background: completed ? 'var(--secondary)' : 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background .15s, border-color .15s',
      }}
    >
      {completed && <Icon name="check" size={10} color="#fff" />}
    </div>
  )
}

/* ─── SortableActivityItem ──────────────────────────────────────────────────── */
function SortableActivityItem({ act, canEdit, onRemove, onEdit, formatDuration, onToggleComplete, mapsLink }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: act.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="activity-item"
    >
      <CompleteDot completed={act.completed} onToggle={() => onToggleComplete(act)} />
      {canEdit && (
        <div
          {...attributes}
          {...listeners}
          style={{ cursor: isDragging ? 'grabbing' : 'grab', padding: '0 2px', color: 'var(--text-light)', display: 'flex', alignItems: 'center', flexShrink: 0, touchAction: 'none' }}
        >
          <Icon name="drag" size={16} />
        </div>
      )}
      <div className={`activity-cat-dot cat-${act.category}`} />
      <div className="activity-info">
        <div className="activity-name" style={act.completed ? { textDecoration: 'line-through', opacity: 0.5 } : {}}>{act.name}</div>
        <div className="activity-meta">
          {act.time && <span>{act.time.slice(0, 5)}</span>}
          {act.duration && <span>{act.time ? ' · ' : ''}{formatDuration(act.duration)}</span>}
          {act.notes && <span style={{ display: 'block' }}>{act.notes}</span>}
        </div>
      </div>
      <div className="activity-actions">
        {mapsLink && (
          <a href={mapsLink} target="_blank" rel="noopener noreferrer"
            className="btn btn-ghost btn-icon btn-sm" title="Apri in Maps"
            onClick={e => e.stopPropagation()}>
            <Icon name="map" size={13} color="var(--text-muted)" />
          </a>
        )}
        {canEdit && (
          <>
            <button className="btn btn-ghost btn-icon btn-sm" title="Modifica" onClick={onEdit}>
              <Icon name="edit" size={14} color="var(--text-muted)" />
            </button>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onRemove}>
              <Icon name="trash" size={14} color="var(--danger)" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ─── UploadPhotoModal ──────────────────────────────────────────────────────── */
function UploadPhotoModal({ dayId, tripId, activities, onSaved, onClose }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [caption, setCaption] = useState('')
  const [activityId, setActivityId] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()

  function handleFileChange(e) {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    try {
      await uploadTripPhoto(tripId, file, dayId, activityId || null, caption || null)
      onSaved()
      onClose()
    } catch {} finally { setUploading(false) }
  }

  return (
    <Modal title="Aggiungi foto" onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" onClick={handleUpload} disabled={uploading || !file}>
          {uploading ? 'Carico...' : 'Carica'}
        </button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
        <div
          onClick={() => fileRef.current.click()}
          style={{
            border: '2px dashed var(--border)', borderRadius: 10, padding: '1.5rem',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.5rem',
            cursor: 'pointer', overflow: 'hidden', minHeight: 100, justifyContent: 'center',
          }}
        >
          {preview ? (
            <img src={preview} alt="" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6, objectFit: 'contain' }} />
          ) : (
            <>
              <Icon name="image" size={32} color="var(--text-muted)" />
              <span style={{ color: 'var(--text-muted)', fontSize: '.875rem' }}>Clicca per scegliere un'immagine</span>
            </>
          )}
        </div>
        <input type="file" ref={fileRef} accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Didascalia (opzionale)</label>
          <input className="form-control" value={caption} onChange={e => setCaption(e.target.value)}
            placeholder="Es. Tramonto dal tempio..." />
        </div>

        {activities.length > 0 && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Collega a un'attività (opzionale)</label>
            <CustomSelect
              value={String(activityId)}
              onChange={v => setActivityId(v)}
              options={[
                { value: '', label: '— Solo giorno —' },
                ...activities.map(a => ({ value: String(a.id), label: a.name })),
              ]}
            />
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ─── DayPhotosSection ──────────────────────────────────────────────────────── */
function DayPhotosSection({ photos, activities, canEdit, tripId, dayId, onRefresh }) {
  const [uploadModal, setUploadModal] = useState(false)
  const [lightboxIdx, setLightboxIdx] = useState(null)
  const { confirm: doConfirm, modal: confirmModal } = useConfirm()

  async function handleDelete(photo) {
    const ok = await doConfirm({ message: 'Eliminare questa foto?', confirmLabel: 'Elimina', danger: true })
    if (!ok) return
    try { await deleteTripPhoto(tripId, photo.id); onRefresh() } catch {}
  }

  return (
    <div style={{ padding: '.65rem 1rem .75rem', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: photos.length ? '.5rem' : 0 }}>
        <span style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '.3rem' }}>
          <Icon name="image" size={13} color="var(--text-muted)" />
          Foto{photos.length > 0 ? ` (${photos.length})` : ''}
        </span>
        {canEdit && (
          <button className="btn btn-ghost btn-sm" onClick={() => setUploadModal(true)}
            style={{ fontSize: '.75rem', padding: '.2rem .5rem', display: 'flex', alignItems: 'center', gap: '.25rem' }}>
            <Icon name="add" size={13} /> Aggiungi
          </button>
        )}
      </div>

      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          {photos.map((p, i) => (
            <div key={p.id} style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
              <img
                src={p.url} alt={p.caption || ''}
                onClick={() => setLightboxIdx(i)}
                onError={e => { e.target.parentElement.style.display = 'none' }}
                style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', display: 'block' }}
              />
              {canEdit && (
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(p) }}
                  style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,.55)', border: 'none', cursor: 'pointer', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '.6rem', padding: 0 }}
                >✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {uploadModal && (
        <UploadPhotoModal
          dayId={dayId} tripId={tripId} activities={activities}
          onSaved={onRefresh} onClose={() => setUploadModal(false)}
        />
      )}

      {lightboxIdx !== null && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setLightboxIdx(null)}
        >
          <button onClick={() => setLightboxIdx(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,.15)', border: 'none', cursor: 'pointer', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.1rem' }}>✕</button>
          <img
            src={photos[lightboxIdx]?.url} alt={photos[lightboxIdx]?.caption || ''}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,.6)' }}
          />
          {(photos[lightboxIdx]?.caption || photos[lightboxIdx]?.activity_name) && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              {photos[lightboxIdx]?.caption && <div style={{ color: '#fff', fontWeight: 600, fontSize: '.95rem' }}>{photos[lightboxIdx].caption}</div>}
              {photos[lightboxIdx]?.activity_name && <div style={{ color: 'rgba(255,255,255,.55)', fontSize: '.8rem', marginTop: '.25rem' }}>📍 {photos[lightboxIdx].activity_name}</div>}
            </div>
          )}
          {photos.length > 1 && (
            <div style={{ display: 'flex', gap: '.75rem', marginTop: '1rem' }}>
              <button onClick={e => { e.stopPropagation(); setLightboxIdx(i => (i - 1 + photos.length) % photos.length) }} style={{ background: 'rgba(255,255,255,.15)', border: 'none', cursor: 'pointer', borderRadius: 8, padding: '.4rem .9rem', color: '#fff', fontSize: '1.2rem' }}>‹</button>
              <span style={{ color: 'rgba(255,255,255,.5)', fontSize: '.85rem', alignSelf: 'center' }}>{lightboxIdx + 1} / {photos.length}</span>
              <button onClick={e => { e.stopPropagation(); setLightboxIdx(i => (i + 1) % photos.length) }} style={{ background: 'rgba(255,255,255,.15)', border: 'none', cursor: 'pointer', borderRadius: 8, padding: '.4rem .9rem', color: '#fff', fontSize: '1.2rem' }}>›</button>
            </div>
          )}
        </div>,
        document.body
      )}

      {confirmModal}
    </div>
  )
}

/* ─── DayCard ───────────────────────────────────────────────────────────────── */
function DayCard({ day, tripId, myRole, onRefresh, wishlist, cities, cityInfo, dayPhotos }) {
  const [open, setOpen] = useState(false)

  // Build wishlist lookup map for maps links
  const wishlistMap = useMemo(() => {
    const m = {}
    for (const w of wishlist || []) m[w.id] = w
    return m
  }, [wishlist])
  const [addModal, setAddModal] = useState(null)
  const [editActivityModal, setEditActivityModal] = useState(null)
  const [editModal, setEditModal] = useState(false)
  const [dayForm, setDayForm] = useState({ city_id: day.city_id || '', notes: day.notes || '' })
  const [saving, setSaving] = useState(false)
  const [localActivities, setLocalActivities] = useState(day.activities || [])
  const { confirm: doConfirm, modal: confirmModal } = useConfirm()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    setLocalActivities(day.activities || [])
  }, [day.activities])

  const date = parseISO(day.date)
  const canEdit = myRole === 'admin' || myRole === 'editor'

  const totalActs     = localActivities.length
  const completedActs = localActivities.filter(a => a.completed).length
  const totalDuration = localActivities.reduce((s, a) => s + (a.duration || 0), 0)

  const activitiesBySlot = {}
  for (const act of localActivities) {
    if (!activitiesBySlot[act.slot]) activitiesBySlot[act.slot] = []
    activitiesBySlot[act.slot].push(act)
  }

  async function removeActivity(actId) {
    const ok = await doConfirm({ message: 'Eliminare questa attività?', confirmLabel: 'Elimina', danger: true })
    if (!ok) return
    await deleteActivity(tripId, day.id, actId)
    onRefresh()
  }

  async function toggleComplete(act) {
    const newVal = !act.completed
    setLocalActivities(prev => prev.map(a => a.id === act.id ? { ...a, completed: newVal } : a))
    try {
      await toggleActivityComplete(tripId, day.id, act.id, newVal)
    } catch {
      setLocalActivities(prev => prev.map(a => a.id === act.id ? { ...a, completed: !newVal } : a))
    }
  }

  async function clearSlot(slotKey, acts) {
    const slotLabel = SLOTS.find(s => s.key === slotKey)?.label || slotKey
    const ok = await doConfirm({
      message: `Svuotare "${slotLabel}"? Verranno eliminate ${acts.length} attività.`,
      confirmLabel: 'Svuota', danger: true,
    })
    if (!ok) return
    for (const act of acts) {
      await deleteActivity(tripId, day.id, act.id)
    }
    onRefresh()
  }

  function handleDragEnd(event, slotKey) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const acts = activitiesBySlot[slotKey] || []
    const oldIndex = acts.findIndex(a => a.id === active.id)
    const newIndex = acts.findIndex(a => a.id === over.id)
    const reordered = arrayMove(acts, oldIndex, newIndex)

    setLocalActivities(prev => [
      ...prev.filter(a => a.slot !== slotKey),
      ...reordered,
    ])

    const orderPayload = reordered.map((a, i) => ({ id: a.id, sort_order: i }))
    reorderActivities(tripId, day.id, orderPayload).catch(() => onRefresh())
  }

  async function saveDay() {
    setSaving(true)
    const cityId = dayForm.city_id ? parseInt(dayForm.city_id) : null
    const cityName = cities.find(c => c.id === cityId)?.name || ''
    try {
      await updateDay(tripId, day.id, { city_id: cityId, city_area: cityName, notes: dayForm.notes })
      onRefresh()
      setEditModal(false)
    } finally { setSaving(false) }
  }

  function formatDuration(min) {
    if (!min) return ''
    const h = Math.floor(min / 60), m = min % 60
    return h > 0 ? `${h}h${m > 0 ? m + 'm' : ''}` : `${m}m`
  }

  return (
    <div className="day-card">
      <div className="day-header" onClick={() => setOpen(o => !o)}>
        <div className="day-header-info">
          <div className="day-date">{format(date, 'EEEE d MMMM', { locale: it })}</div>
          {cityInfo ? (
            <div className="day-city-bar">
              <span className="day-city-pill"
                style={{ background: cityInfo.color + '22', color: cityInfo.color, borderColor: cityInfo.color + '55' }}>
                <span className="day-city-dot" style={{ background: cityInfo.color }} />
                {cityInfo.name}
              </span>
              <span className="day-city-counter">
                Giorno {cityInfo.dayIndex} di {cityInfo.totalDays}
              </span>
            </div>
          ) : day.city_area ? (
            <div className="day-city">
              <Icon name="pin" size={12} color="rgba(255,255,255,.8)" />
              {day.city_area}
            </div>
          ) : null}
          {day.notes && !open && (
            <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.7)', marginTop: '.2rem', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
              📝 {day.notes}
            </div>
          )}
          {!open && totalActs > 0 && (
            <div style={{ display: 'flex', gap: '.5rem', marginTop: '.2rem', fontSize: '.72rem', color: 'rgba(255,255,255,.6)', flexWrap: 'wrap' }}>
              <span>{totalActs} {totalActs === 1 ? 'attività' : 'attività'}</span>
              {totalDuration > 0 && <span>· {formatDuration(totalDuration)}</span>}
              {completedActs > 0 && <span>· {completedActs}/{totalActs} completate</span>}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          {canEdit && (
            <button className="btn btn-ghost btn-sm" style={{ color: 'rgba(255,255,255,.8)' }}
              onClick={e => {
                e.stopPropagation()
                setDayForm({ city_id: day.city_id || '', notes: day.notes || '' })
                setEditModal(true)
              }}>
              <Icon name="edit" size={14} color="rgba(255,255,255,.8)" />
            </button>
          )}
          <Icon name="chevronDown" size={18} color="rgba(255,255,255,.7)"
            style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .2s' }} />
        </div>
      </div>

      {open && (
        <div>
          {canEdit && SLOTS.some(s => !(activitiesBySlot[s.key] || []).length) && (
            <div className="slots-empty-row">
              {SLOTS.filter(s => !(activitiesBySlot[s.key] || []).length).map(slot => (
                <button key={slot.key} className="slot-add-btn" onClick={() => setAddModal(slot.key)}
                  title={`Aggiungi a ${slot.label}`}>
                  <span className={`slot-icon ${slot.colorClass}`} style={{ width: 18, height: 18, fontSize: '.6rem' }}>
                    {slot.label.slice(0, 1)}
                  </span>
                  <span>{slot.label}</span>
                  <Icon name="add" size={13} color="var(--text-muted)" />
                </button>
              ))}
            </div>
          )}

          {SLOTS.some(s => (activitiesBySlot[s.key] || []).length > 0) && (
            <div className="slots-grid">
              {SLOTS.filter(s => (activitiesBySlot[s.key] || []).length > 0).map(slot => {
                const acts = activitiesBySlot[slot.key] || []
                return (
                  <div key={slot.key} className={`slot slot-${slot.key}`}>
                    <div className="slot-header">
                      <div className="slot-title">
                        <span className={`slot-icon ${slot.colorClass}`}>{slot.label.slice(0, 1)}</span>
                        {slot.label}
                      </div>
                      {canEdit && (
                        <div style={{ display: 'flex', gap: '.15rem' }}>
                          <button className="btn btn-ghost btn-icon btn-sm" title="Svuota slot"
                            onClick={() => clearSlot(slot.key, acts)}>
                            <Icon name="trash" size={13} color="var(--danger)" />
                          </button>
                          <button className="btn btn-ghost btn-icon btn-sm" title="Aggiungi attività"
                            onClick={() => setAddModal(slot.key)}>
                            <Icon name="add" size={16} />
                          </button>
                        </div>
                      )}
                    </div>

                    {canEdit ? (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={e => handleDragEnd(e, slot.key)}
                      >
                        <SortableContext items={acts.map(a => a.id)} strategy={verticalListSortingStrategy}>
                          {acts.map(act => (
                            <SortableActivityItem
                              key={act.id}
                              act={act}
                              canEdit={canEdit}
                              onRemove={() => removeActivity(act.id)}
                              onEdit={() => setEditActivityModal(act)}
                              formatDuration={formatDuration}
                              onToggleComplete={toggleComplete}
                              mapsLink={act.wishlist_place_id ? wishlistMap[act.wishlist_place_id]?.maps_link : null}
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                    ) : (
                      acts.map(act => {
                        const mapsLink = act.wishlist_place_id ? wishlistMap[act.wishlist_place_id]?.maps_link : null
                        return (
                          <div key={act.id} className="activity-item">
                            <CompleteDot completed={act.completed} onToggle={() => toggleComplete(act)} />
                            <div className={`activity-cat-dot cat-${act.category}`} />
                            <div className="activity-info">
                              <div className="activity-name" style={act.completed ? { textDecoration: 'line-through', opacity: 0.5 } : {}}>{act.name}</div>
                              <div className="activity-meta">
                                {act.time && <span>{act.time.slice(0, 5)}</span>}
                                {act.duration && <span>{act.time ? ' · ' : ''}{formatDuration(act.duration)}</span>}
                                {act.notes && <span style={{ display: 'block' }}>{act.notes}</span>}
                              </div>
                            </div>
                            {mapsLink && (
                              <a href={mapsLink} target="_blank" rel="noopener noreferrer"
                                className="btn btn-ghost btn-icon btn-sm" title="Apri in Maps">
                                <Icon name="map" size={13} color="var(--text-muted)" />
                              </a>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <DayPhotosSection
            photos={dayPhotos}
            activities={localActivities}
            canEdit={canEdit}
            tripId={tripId}
            dayId={day.id}
            onRefresh={onRefresh}
          />
        </div>
      )}

      {addModal && (
        <ActivityModal
          dayId={day.id} slot={addModal} tripId={tripId}
          wishlist={wishlist}
          onSaved={onRefresh} onClose={() => setAddModal(null)}
        />
      )}

      {editActivityModal && (
        <ActivityModal
          dayId={day.id} slot={editActivityModal.slot} tripId={tripId}
          wishlist={wishlist}
          activity={editActivityModal}
          onSaved={() => { onRefresh(); setEditActivityModal(null) }}
          onClose={() => setEditActivityModal(null)}
        />
      )}

      {confirmModal}

      {editModal && (
        <Modal title="Modifica giorno" onClose={() => setEditModal(false)}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setEditModal(false)}>Annulla</button>
            <button className="btn btn-primary" onClick={saveDay} disabled={saving}>
              {saving ? 'Salvo...' : 'Salva'}
            </button>
          </>}
        >
          <div className="form-group">
            <label className="form-label">Città</label>
            {cities.length > 0 ? (
              <CustomSelect
                value={String(dayForm.city_id)}
                onChange={v => setDayForm(f => ({ ...f, city_id: v }))}
                options={[
                  { value: '', label: '— Nessuna città —' },
                  ...cities.map(c => ({ value: String(c.id), label: c.name })),
                ]}
              />
            ) : (
              <div className="day-no-cities-hint">
                Nessuna città definita. Vai su "Gestisci città" per aggiungerne.
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Note del giorno</label>
            <textarea className="form-control" rows={3} value={dayForm.notes}
              onChange={e => setDayForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ─── ItineraryTab ──────────────────────────────────────────────────────────── */
export default function ItineraryTab({ tripId, days, myRole, onRefresh, wishlist, cities, onCitiesRefresh, photos = [] }) {
  const [showCitiesManager, setShowCitiesManager] = useState(false)
  const canEdit = myRole === 'admin' || myRole === 'editor'

  const daysCityInfo = useMemo(() => {
    const info = {}
    const cityGroups = {}
    for (const d of days) {
      if (d.city_id) {
        if (!cityGroups[d.city_id]) cityGroups[d.city_id] = []
        cityGroups[d.city_id].push(d.id)
      }
    }
    for (const d of days) {
      if (d.city_id && d.city_name) {
        const idx = cityGroups[d.city_id].indexOf(d.id)
        info[d.id] = {
          name: d.city_name,
          color: d.city_color || '#c26b4a',
          dayIndex: idx + 1,
          totalDays: cityGroups[d.city_id].length
        }
      }
    }
    return info
  }, [days])

  if (!days || days.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><Icon name="calendar" size={28} color="var(--primary)" /></div>
        <div>Nessun giorno disponibile</div>
      </div>
    )
  }

  return (
    <div>
      {days.map(day => (
        <DayCard key={day.id} day={day} tripId={tripId} myRole={myRole}
          onRefresh={onRefresh} wishlist={wishlist} cities={cities}
          cityInfo={daysCityInfo[day.id]}
          dayPhotos={photos.filter(p => p.day_id === day.id)}
        />
      ))}

      {showCitiesManager && (
        <CitiesManagerModal
          tripId={tripId} cities={cities} days={days} myRole={myRole}
          onSaved={() => { onCitiesRefresh(); onRefresh() }}
          onClose={() => setShowCitiesManager(false)}
        />
      )}
    </div>
  )
}
