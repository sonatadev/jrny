import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Modal from './Modal'
import Icon from './Icon'
import { addToWishlist, importFromMaps, updateWishlistPlace, deleteWishlistPlace, addActivity, deleteActivity, toggleWishlistVote } from '../js/api'
import { useConfirm } from './ConfirmModal'
import CustomSelect from './CustomSelect'
import { cityLabel, cityNameLabel } from '../js/cityLabel'

const CAT_COLOR = {
  museo: '#3b82f6', galleria: '#7c3aed', attrazione: '#c26b4a', tempio: '#8b5cf6',
  santuario: '#6d28d9', castello: '#92400e', storico: '#a16207', rovine: '#78716c',
  monumento: '#64748b', panorama: '#0284c7', parco: '#16a34a', giardino: '#059669',
  spiaggia: '#0891b2', natura: '#10b981', terme: '#06b6d4',
  ristorante: '#ea580c', cafe: '#92400e', bar: '#b45309', street_food: '#d97706',
  mercato: '#b45309', shopping: '#ec4899', moda: '#db2777', souvenir: '#f43f5e',
  palestra: '#ef4444', sport: '#f97316', piscina: '#0369a1', benessere: '#0d9488',
  teatro: '#a21caf', cinema: '#4f46e5', musica: '#be185d', nightlife: '#9333ea',
  libreria: '#854d0e', chiesa: '#d4a017', farmacia: '#16a34a', supermercato: '#0369a1',
  zoo: '#65a30d', acquario: '#0891b2',
  cibo: '#f59e0b', trasporto: '#6b7280', alloggio: 'var(--primary)', altro: 'var(--text-light)',
}

const CAT_LABEL = {
  museo: 'Musei', galleria: "Gallerie d'Arte", attrazione: 'Attrazioni',
  tempio: 'Templi', santuario: 'Santuari', castello: 'Castelli',
  storico: 'Siti Storici', rovine: 'Rovine', monumento: 'Monumenti',
  panorama: 'Panorami e Belvedere', parco: 'Parchi', giardino: 'Giardini',
  spiaggia: 'Spiagge', natura: 'Natura', terme: 'Terme e Sorgenti',
  ristorante: 'Ristoranti', cafe: 'Caffetterie', bar: 'Bar',
  street_food: 'Street Food', mercato: 'Mercati',
  shopping: 'Shopping', moda: 'Moda', souvenir: 'Souvenir',
  palestra: 'Palestre', sport: 'Sport', piscina: 'Piscine', benessere: 'Benessere e Spa',
  teatro: 'Teatro', cinema: 'Cinema', musica: 'Musica dal Vivo', nightlife: 'Vita Notturna',
  libreria: 'Librerie', chiesa: 'Chiese', farmacia: 'Farmacie', supermercato: 'Supermercati',
  zoo: 'Zoo', acquario: 'Acquari',
  cibo: 'Cibo', trasporto: 'Trasporti', alloggio: 'Alloggi', altro: 'Altro',
}

const CAT_ORDER = [
  'museo', 'galleria', 'attrazione', 'tempio', 'santuario', 'castello', 'storico', 'rovine', 'monumento',
  'panorama', 'parco', 'giardino', 'spiaggia', 'natura', 'terme',
  'ristorante', 'cafe', 'bar', 'street_food', 'mercato',
  'shopping', 'moda', 'souvenir',
  'palestra', 'sport', 'piscina', 'benessere',
  'teatro', 'cinema', 'musica', 'nightlife',
  'libreria', 'chiesa', 'farmacia', 'supermercato', 'zoo', 'acquario',
  'cibo', 'trasporto', 'alloggio', 'altro',
]
const PRIORITY_LABELS = { 1: 'Alta', 2: 'Media', 3: 'Bassa' }

const catLabel = c => CAT_LABEL[c] || (c ? c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : '')

function CatDot({ category }) {
  return (
    <div className="cat-icon" style={{
      width: 28, height: 28, background: CAT_COLOR[category] || 'var(--text-light)',
      borderRadius: 8, fontSize: '.6rem',
    }}>
      {(category || 'Alt').slice(0, 3).toUpperCase()}
    </div>
  )
}

function AddPlaceModal({ tripId, cities, onSaved, onClose }) {
  const [form, setForm] = useState({ name: '', city: '', category: 'altro', notes: '', maps_link: '', priority: 2 })
  const [saving, setSaving] = useState(false)
  const [newCity, setNewCity] = useState(false) // città digitata a mano (verrà creata al salvataggio)
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }
  async function save() {
    if (!form.name) return
    setSaving(true)
    try { await addToWishlist(tripId, form); onSaved(); onClose() }
    catch { } finally { setSaving(false) }
  }
  return (
    <Modal title="Aggiungi meta" onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" onClick={save} disabled={saving || !form.name}>
          {saving ? 'Salvo...' : 'Aggiungi'}
        </button>
      </>}
    >
      <div className="form-group"><label className="form-label">Nome *</label>
        <input className="form-control" required placeholder="Es. Fushimi Inari-taisha"
          value={form.name} onChange={e => set('name', e.target.value)} />
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Città</label>
          {cities?.length > 0 && !newCity ? (
            <CustomSelect
              value={form.city}
              onChange={v => { if (v === '__new__') { setNewCity(true); set('city', '') } else set('city', v) }}
              placeholder="— Nessuna città —"
              options={[
                { value: '', label: '— Nessuna città —' },
                ...cities.map(c => ({ value: c.name, label: cityLabel(c) })),
                { value: '__new__', label: '➕ Nuova città…' },
              ]}
            />
          ) : (
            <>
              <input className="form-control" placeholder="Es. Kyoto" autoFocus={newCity}
                value={form.city} onChange={e => set('city', e.target.value)} />
              {cities?.length > 0 && (
                <button type="button" className="btn-link"
                  style={{ background: 'none', border: 'none', padding: '.25rem 0 0', color: 'var(--primary)', fontSize: '.78rem', cursor: 'pointer' }}
                  onClick={() => { setNewCity(false); set('city', '') }}>
                  ← Scegli dall'elenco
                </button>
              )}
            </>
          )}
        </div>
        <div className="form-group"><label className="form-label">Categoria</label>
          <CustomSelect
            value={form.category}
            onChange={v => set('category', v)}
            options={Object.keys(CAT_COLOR).map(c => ({ value: c, label: catLabel(c) }))}
          />
        </div>
      </div>
      <div className="form-group"><label className="form-label">Priorità</label>
        <CustomSelect
          value={String(form.priority)}
          onChange={v => set('priority', parseInt(v))}
          options={[{ value: '1', label: 'Alta' }, { value: '2', label: 'Media' }, { value: '3', label: 'Bassa' }]}
        />
      </div>
      <div className="form-group"><label className="form-label">Link Google Maps</label>
        <input className="form-control" type="url" placeholder="https://maps.google.com/..."
          value={form.maps_link} onChange={e => set('maps_link', e.target.value)} />
      </div>
      <div className="form-group"><label className="form-label">Note</label>
        <textarea className="form-control" rows={2} placeholder="Apertura, consigli, orari..."
          value={form.notes} onChange={e => set('notes', e.target.value)} />
      </div>
    </Modal>
  )
}

function SlotModal({ place, days, tripId, onSaved, onClose }) {
  const [dayId, setDayId] = useState('')
  const [slot, setSlot] = useState('mattina')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!dayId) return
    setSaving(true)
    try {
      // If re-assigning, delete the existing day_activity first so we don't leave orphans
      for (const day of days) {
        const existing = (day.activities || []).find(a => a.wishlist_place_id === place.id)
        if (existing) {
          await deleteActivity(tripId, day.id, existing.id)
          break
        }
      }
      // Mark the wishlist place as slotted
      await updateWishlistPlace(tripId, place.id, { day_id: parseInt(dayId), slot, is_slotted: true })
      // Create the day_activities row that Piano and Itinerary tabs read from
      await addActivity(tripId, parseInt(dayId), {
        slot,
        name: place.name,
        category: place.category,
        notes: place.notes,
        wishlist_place_id: place.id,
      })
      onSaved()
      onClose()
    } catch { } finally { setSaving(false) }
  }

  async function unslot() {
    setSaving(true)
    try {
      // Delete the linked day_activity (backend will also clear wishlist_places fields)
      let deleted = false
      for (const day of days) {
        const existing = (day.activities || []).find(a => a.wishlist_place_id === place.id)
        if (existing) {
          await deleteActivity(tripId, day.id, existing.id)
          deleted = true
          break
        }
      }
      // Fallback for legacy data where no day_activity exists
      if (!deleted) {
        await updateWishlistPlace(tripId, place.id, { day_id: null, slot: null, is_slotted: false })
      }
      onSaved()
      onClose()
    } catch { } finally { setSaving(false) }
  }
  return (
    <Modal title={`Pianifica: ${place.name}`} onClose={onClose}
      footer={<>
        {place.is_slotted && <button className="btn btn-secondary" onClick={unslot} disabled={saving}>Rimuovi slot</button>}
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" onClick={save} disabled={saving || !dayId}>
          {saving ? 'Salvo...' : 'Conferma'}
        </button>
      </>}
    >
      <div className="form-group"><label className="form-label">Giorno</label>
        <CustomSelect
          value={dayId}
          onChange={v => setDayId(v)}
          placeholder="Seleziona giorno"
          options={days.map(d => ({
            value: String(d.id),
            label: `${d.date.slice(0, 10)}${d.city_area ? ` · ${d.city_area}` : ''}`,
          }))}
        />
      </div>
      <div className="form-group"><label className="form-label">Slot</label>
        <CustomSelect
          value={slot}
          onChange={v => setSlot(v)}
          options={[
            { value: 'mattina',    label: 'Mattina' },
            { value: 'pomeriggio', label: 'Pomeriggio' },
            { value: 'sera',       label: 'Sera' },
            { value: 'notte',      label: 'Notte' },
          ]}
        />
      </div>
    </Modal>
  )
}

function PlaceDetailModal({ place, tripId, myRole, days, cities, onRefresh, onClose, voteCount = 0, myVote = false, onVote }) {
  const [slotModal, setSlotModal]     = useState(false)
  const [activeIdx, setActiveIdx]     = useState(0)
  const [brokenIdxs, setBrokenIdxs]  = useState(new Set())
  const { confirm: doConfirm, modal: confirmModal } = useConfirm()
  const canEdit  = myRole === 'admin' || myRole === 'editor'

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  const catColor = CAT_COLOR[place.category] || 'var(--text-light)'

  // Merge photos array + photo_url (old records), deduplicate
  const allPhotos = (() => {
    const arr = place.photos?.length > 0
      ? place.photos
      : place.photo_url ? [place.photo_url] : []
    return arr.filter((u, i, a) => u && a.indexOf(u) === i)
  })()
  const visiblePhotos = allPhotos.filter((_, i) => !brokenIdxs.has(i))
  const safeIdx = Math.min(activeIdx, Math.max(0, visiblePhotos.length - 1))
  const hasPhoto = visiblePhotos.length > 0

  function markBroken(origIdx) {
    setBrokenIdxs(prev => new Set([...prev, origIdx]))
  }

  async function remove() {
    const ok = await doConfirm({ message: `Rimuovere "${place.name}"?`, confirmLabel: 'Rimuovi', danger: true })
    if (!ok) return
    await deleteWishlistPlace(tripId, place.id)
    onRefresh(); onClose()
  }

  return createPortal(
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 560 }}>

        {/* ── Main photo / gradient header ── */}
        <div style={{
          position: 'relative', height: 210, flexShrink: 0,
          overflow: 'hidden', borderRadius: 'inherit',
          borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
        }}>
          {hasPhoto ? (
            <img
              key={visiblePhotos[safeIdx]}
              src={visiblePhotos[safeIdx]}
              alt={place.name}
              onError={() => {
                const origIdx = allPhotos.indexOf(visiblePhotos[safeIdx])
                if (origIdx !== -1) markBroken(origIdx)
              }}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              background: `linear-gradient(135deg, ${catColor}28 0%, ${catColor}10 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: 20,
                background: catColor + '22', border: `2px solid ${catColor}55`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '.95rem', fontWeight: 900, color: catColor,
              }}>
                {(place.category || 'ALT').slice(0, 3).toUpperCase()}
              </div>
            </div>
          )}

          {/* Prev / Next arrows when multiple photos */}
          {visiblePhotos.length > 1 && (
            <>
              <button onClick={() => setActiveIdx(i => (i - 1 + visiblePhotos.length) % visiblePhotos.length)}
                style={{
                  position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'rgba(255,255,255,.82)', backdropFilter: 'blur(4px)',
                  border: 'none', cursor: 'pointer', borderRadius: '50%',
                  width: 44, height: 44, fontSize: '1.2rem', color: 'var(--text)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 1px 4px rgba(0,0,0,.2)',
                }}>‹</button>
              <button onClick={() => setActiveIdx(i => (i + 1) % visiblePhotos.length)}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'rgba(255,255,255,.82)', backdropFilter: 'blur(4px)',
                  border: 'none', cursor: 'pointer', borderRadius: '50%',
                  width: 44, height: 44, fontSize: '1.2rem', color: 'var(--text)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 1px 4px rgba(0,0,0,.2)',
                }}>›</button>
            </>
          )}

          {/* Category chip */}
          <div style={{
            position: 'absolute', bottom: 10, left: 12,
            background: catColor, color: '#fff',
            padding: '.22rem .75rem', borderRadius: 99,
            fontSize: '.7rem', fontWeight: 800, letterSpacing: '.03em',
            boxShadow: '0 2px 6px rgba(0,0,0,.18)',
          }}>
            {catLabel(place.category)}
          </div>

          {/* Photo counter badge */}
          {visiblePhotos.length > 1 && (
            <div style={{
              position: 'absolute', bottom: 10, right: 12,
              background: 'rgba(0,0,0,.45)', color: '#fff',
              padding: '.2rem .55rem', borderRadius: 99,
              fontSize: '.7rem', fontWeight: 700,
            }}>
              {safeIdx + 1}/{visiblePhotos.length}
            </div>
          )}

          {/* Floating close button */}
          <button onClick={onClose} style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(255,255,255,.88)', backdropFilter: 'blur(4px)',
            border: 'none', cursor: 'pointer', borderRadius: '50%',
            width: 44, height: 44, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '1rem', color: 'var(--text)',
            boxShadow: '0 1px 4px rgba(0,0,0,.18)', lineHeight: 1,
          }}>✕</button>
        </div>

        {/* ── Thumbnail strip (when 2+ photos) ── */}
        {visiblePhotos.length > 1 && (
          <div style={{
            display: 'flex', gap: 5, padding: '.55rem .85rem',
            overflowX: 'auto', background: 'var(--surface-warm)',
            borderBottom: '1.5px solid var(--border-light)',
            scrollbarWidth: 'none',
          }}>
            {visiblePhotos.map((url, i) => (
              <button key={i} onClick={() => setActiveIdx(i)} style={{
                flexShrink: 0, width: 58, height: 44, padding: 0, border: 'none', cursor: 'pointer',
                borderRadius: 7, overflow: 'hidden',
                outline: i === safeIdx ? `2.5px solid ${catColor}` : '2.5px solid transparent',
                opacity: i === safeIdx ? 1 : 0.55,
                transition: 'opacity .15s, outline .15s',
              }}>
                <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </button>
            ))}
          </div>
        )}

        {/* ── Content ── */}
        <div className="modal-body">
          <div style={{ fontSize: '1.22rem', fontWeight: 900, color: 'var(--text)', lineHeight: 1.3, marginBottom: '.45rem' }}>
            {place.name}
          </div>

          {place.city && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem', marginBottom: '.75rem', color: 'var(--text-muted)', fontSize: '.88rem', fontWeight: 600 }}>
              <Icon name="pin" size={13} color="var(--primary)" /> {cityNameLabel(place.city, cities)}
            </div>
          )}

          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: place.notes ? '1rem' : '.5rem' }}>
            <span className={`place-badge badge-priority-${place.priority}`}>{PRIORITY_LABELS[place.priority]} priorità</span>
            {place.is_slotted && <span className="place-badge badge-slotted">Pianificato</span>}
          </div>

          {place.notes && (
            <div style={{
              background: 'var(--surface-warm)', border: '1.5px solid var(--border-light)',
              borderRadius: 'var(--radius-xs)', padding: '.8rem 1rem', marginBottom: '1rem',
            }}>
              <div style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '.35rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Indirizzo & info
              </div>
              <div style={{ fontSize: '.875rem', color: 'var(--text)', whiteSpace: 'pre-line', lineHeight: 1.6 }}>
                {place.notes}
              </div>
            </div>
          )}

          {place.maps_link && (
            <>
              <a href={place.maps_link} target="_blank" rel="noopener noreferrer" className="btn btn-secondary w-full"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.45rem' }}>
                <Icon name="link" size={15} color="var(--primary)" /> Apri in Google Maps
              </a>
              {/* Attribuzione richiesta per nome, indirizzo e foto che arrivano da Google */}
              <div style={{ marginTop: '.5rem', fontSize: '.72rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                Dati del luogo e foto: © Google Maps
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="modal-footer">
          {canEdit && (
            <button className="btn btn-ghost btn-sm" onClick={remove} style={{ marginRight: 'auto' }}>
              <Icon name="trash" size={13} color="var(--danger)" />
            </button>
          )}
          {onVote && (
            <button className="btn btn-ghost btn-sm" onClick={onVote}
              style={{ color: myVote ? 'var(--primary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '.3rem' }}>
              <Icon name="star" size={14} color={myVote ? 'var(--primary)' : 'var(--text-muted)'} />
              {voteCount > 0 ? voteCount : ''}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Chiudi</button>
          {canEdit && (
            <button className="btn btn-primary btn-sm" onClick={() => setSlotModal(true)}>
              <Icon name="calendar" size={13} /> {place.is_slotted ? 'Riassegna' : 'Pianifica'}
            </button>
          )}
        </div>
      </div>

      {slotModal && (
        <SlotModal place={place} days={days} tripId={tripId}
          onSaved={() => { onRefresh(); onClose() }}
          onClose={() => setSlotModal(false)} />
      )}
      {confirmModal}
    </div>,
    document.body
  )
}

function PlaceCard({ place, tripId, myRole, days, cities, onRefresh }) {
  const [detailModal, setDetailModal] = useState(false)
  const [slotModal, setSlotModal]     = useState(false)
  const [myVote, setMyVote]           = useState(!!place.my_vote)
  const [voteCount, setVoteCount]     = useState(parseInt(place.vote_count || 0))
  const pendingVote = useRef(false)

  useEffect(() => {
    if (!pendingVote.current) {
      setMyVote(!!place.my_vote)
      setVoteCount(parseInt(place.vote_count || 0))
    }
  }, [place.my_vote, place.vote_count])
  const { confirm: doConfirm, modal: confirmModal } = useConfirm()
  const canEdit = myRole === 'admin' || myRole === 'editor'

  async function handleVote(e) {
    e.stopPropagation()
    const newVote = !myVote
    pendingVote.current = true
    setMyVote(newVote)
    setVoteCount(c => c + (newVote ? 1 : -1))
    try {
      await toggleWishlistVote(tripId, place.id)
    } catch {
      setMyVote(!newVote)
      setVoteCount(c => c + (newVote ? -1 : 1))
    } finally {
      pendingVote.current = false
    }
  }

  async function remove(e) {
    e.stopPropagation()
    const ok = await doConfirm({ message: `Rimuovere "${place.name}"?`, confirmLabel: 'Rimuovi', danger: true })
    if (!ok) return
    await deleteWishlistPlace(tripId, place.id)
    onRefresh()
  }

  return (
    <>
      <div
        className={`place-card ${place.is_slotted ? 'is-slotted' : ''}`}
        onClick={() => setDetailModal(true)}
        style={{ cursor: 'pointer' }}
      >
        {/* Thumbnail strip — prefer photos[0], fall back to photo_url */}
        {(place.photos?.[0] || place.photo_url) && (
          <div style={{ margin: '-1.1rem -1.1rem .75rem', height: 118, overflow: 'hidden', borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0', flexShrink: 0 }}>
            <img src={place.photos?.[0] || place.photo_url} alt={place.name}
              onError={e => { e.target.parentElement.style.display = 'none' }}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        )}

        <div className="place-card-header">
          <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
            <div className="place-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{place.name}</div>
            {place.city && (
              <div className="place-city">
                <Icon name="pin" size={11} color="var(--text-muted)" /> {cityNameLabel(place.city, cities)}
              </div>
            )}
          </div>
          <CatDot category={place.category} />
        </div>

        <div className="place-badges">
          <span className="place-badge badge-cat">{catLabel(place.category)}</span>
          <span className={`place-badge badge-priority-${place.priority}`}>{PRIORITY_LABELS[place.priority]}</span>
          {place.is_slotted && <span className="place-badge badge-slotted">Pianificato</span>}
        </div>

        {/* Show first line of notes as a preview */}
        {place.notes && (
          <div className="place-notes">
            {place.notes.split('\n')[0]}
          </div>
        )}

        <div className="place-actions" onClick={e => e.stopPropagation()}>
          <button className="btn btn-ghost btn-sm" onClick={handleVote}
            style={{ color: myVote ? 'var(--primary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '.25rem', padding: '.25rem .4rem' }}>
            <Icon name="star" size={13} color={myVote ? 'var(--primary)' : 'var(--text-muted)'} />
            {voteCount > 0 && <span style={{ fontSize: '.72rem', fontWeight: 700 }}>{voteCount}</span>}
          </button>
          {canEdit && (
            <button className="btn btn-secondary btn-sm" onClick={() => setSlotModal(true)}>
              <Icon name="calendar" size={13} /> {place.is_slotted ? 'Riassegna' : 'Pianifica'}
            </button>
          )}
          {canEdit && (
            <button className="btn btn-ghost btn-sm" onClick={remove}>
              <Icon name="trash" size={13} color="var(--danger)" />
            </button>
          )}
        </div>
      </div>

      {confirmModal}
      {slotModal && (
        <SlotModal place={place} days={days} tripId={tripId}
          onSaved={onRefresh} onClose={() => setSlotModal(false)} />
      )}
      {detailModal && (
        <PlaceDetailModal place={place} tripId={tripId} myRole={myRole}
          days={days} cities={cities} onRefresh={onRefresh} onClose={() => setDetailModal(false)}
          voteCount={voteCount} myVote={myVote} onVote={handleVote} />
      )}
    </>
  )
}

function ImportFromMapsModal({ tripId, onSaved, onClose }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleImport() {
    const trimmed = url.trim()
    if (!trimmed) return
    setLoading(true)
    setError('')
    try {
      await importFromMaps(tripId, { maps_url: trimmed })
      onSaved()
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Errore durante l\'importazione')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Importa da Google Maps" onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" onClick={handleImport} disabled={loading || !url.trim()}>
          {loading ? 'Importo...' : 'Importa'}
        </button>
      </>}
    >
      <div className="form-group">
        <label className="form-label">Link Google Maps</label>
        <input
          className="form-control"
          type="url"
          placeholder="https://maps.app.goo.gl/... oppure https://www.google.com/maps/place/..."
          value={url}
          onChange={e => { setUrl(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && !loading && handleImport()}
          autoFocus
        />
        <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: '.4rem' }}>
          Incolla un link di Google Maps per importare automaticamente nome, città e categoria.
        </div>
      </div>
      {error && (
        <div style={{
          color: 'var(--danger)', fontSize: '.88rem',
          marginTop: '.5rem', padding: '.5rem .75rem',
          background: 'var(--danger-light)', borderRadius: 'var(--radius-xs)',
        }}>
          {error}
        </div>
      )}
    </Modal>
  )
}

export default function WishlistTab({ tripId, wishlist, days, myRole, onRefresh, cities }) {
  const [addModal, setAddModal]         = useState(false)
  const [importModal, setImportModal]   = useState(false)
  const [catFilter, setCatFilter]       = useState('')
  const [cityFilter, setCityFilter]     = useState('')
  const [showSlotted, setShowSlotted]   = useState(true)
  const [search, setSearch]             = useState('')
  const [sortByVotes, setSortByVotes]   = useState(false)
  const [collapsedCats, setCollapsedCats] = useState(() => new Set(CAT_ORDER))
  const canEdit = myRole === 'admin' || myRole === 'editor'

  function toggleCat(cat) {
    setCollapsedCats(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat); else next.add(cat)
      return next
    })
  }

  const filtered = useMemo(() => wishlist.filter(p => {
    if (catFilter && p.category !== catFilter) return false
    if (!showSlotted && p.is_slotted) return false
    if (cityFilter && p.city !== cityFilter) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [wishlist, catFilter, showSlotted, cityFilter, search])

  const topPicks = useMemo(() => {
    if (!sortByVotes) return null
    return [...filtered]
      .filter(p => parseInt(p.vote_count || 0) > 0 || true)
      .sort((a, b) => parseInt(b.vote_count || 0) - parseInt(a.vote_count || 0))
  }, [filtered, sortByVotes])

  const grouped = useMemo(() => {
    const map = {}
    for (const p of filtered) {
      const k = p.category || 'altro'
      if (!map[k]) map[k] = []
      map[k].push(p)
    }
    return Object.entries(map)
      .sort(([a], [b]) => {
        const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b)
        if (ia === -1 && ib === -1) return a.localeCompare(b)
        if (ia === -1) return 1; if (ib === -1) return -1
        return ia - ib
      })
      .map(([cat, places]) => ({ cat, label: catLabel(cat), color: CAT_COLOR[cat] || 'var(--text-light)', places }))
  }, [filtered])

  const cats = useMemo(() => [...new Set(wishlist.map(p => p.category))], [wishlist])

  const allExpanded = grouped.length > 0 && grouped.every(g => !collapsedCats.has(g.cat))

  return (
    <div>
      {/* ── Header row ── */}
      <div className="section-header" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <div className="section-title">
          Mete ({filtered.length}{filtered.length !== wishlist.length ? `/${wishlist.length}` : ''})
        </div>
        <input
          className="form-control"
          placeholder="Cerca meta..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 180, fontSize: '.85rem', padding: '.3rem .6rem' }}
        />
        {canEdit && (
          <div style={{ display: 'flex', gap: '.5rem', flexShrink: 0 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setImportModal(true)}>
              <Icon name="link" size={15} /> Importa
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setAddModal(true)}>
              <Icon name="add" size={15} /> Aggiungi
            </button>
          </div>
        )}
      </div>

      {/* ── City filter chips ── */}
      {cities.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div className="filter-section-label">Città</div>
          <div className="wishlist-filters" style={{ marginBottom: '1.25rem' }}>
            <button className={`filter-chip ${!cityFilter ? 'active' : ''}`} onClick={() => setCityFilter('')}>
              Tutte le città
            </button>
            {cities.map(city => {
              const cnt = wishlist.filter(p => p.city === city.name).length
              return (
                <button key={city.id}
                  className={`filter-chip ${cityFilter === city.name ? 'active' : ''}`}
                  style={{ borderLeft: `3px solid ${city.color}` }}
                  onClick={() => setCityFilter(f => f === city.name ? '' : city.name)}
                >
                  <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: city.color, marginRight: 4 }} />
                  {cityLabel(city)}
                  {cnt > 0 && <span style={{ marginLeft: 4, opacity: .65, fontSize: '.77rem' }}>({cnt})</span>}
                </button>
              )
            })}
          </div>
          <div style={{ borderBottom: '1px solid #e8e0d8' }} />
        </div>
      )}

      {/* ── Category filter chips ── */}
      <div style={{ marginTop: cities.length > 0 ? '1.25rem' : 0, marginBottom: '1.25rem' }}>
        <div className="filter-section-label">Categoria</div>
        <div className="wishlist-filters">
          <button className={`filter-chip ${!catFilter ? 'active' : ''}`} onClick={() => setCatFilter('')}>Tutte</button>
          {cats.map(c => (
            <button key={c} className={`filter-chip ${catFilter === c ? 'active' : ''}`} onClick={() => setCatFilter(c)}>
              <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: CAT_COLOR[c] || 'var(--text-light)', marginRight: 4 }} />
              {catLabel(c)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Second filter row: slotted toggle + sort + collapse all ── */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.1rem', gap: '.5rem' }}>
        <button className={`filter-chip ${!showSlotted ? 'active' : ''}`} onClick={() => setShowSlotted(s => !s)} style={{ flexShrink: 0 }}>
          {showSlotted ? 'Nascondi pianificati' : 'Mostra pianificati'}
        </button>
        <button
          className={`filter-chip ${sortByVotes ? 'active' : ''}`}
          onClick={() => setSortByVotes(s => !s)}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '.25rem' }}
        >
          <Icon name="star" size={12} color={sortByVotes ? 'var(--primary)' : 'var(--text-muted)'} />
          Top picks
        </button>
        {!sortByVotes && grouped.length > 1 && !catFilter && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: 'auto', flexShrink: 0 }}
            onClick={() => setCollapsedCats(allExpanded ? new Set(grouped.map(g => g.cat)) : new Set())}
          >
            <Icon name="chevronDown" size={13}
              style={{ transform: allExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .2s' }} />
            {allExpanded ? 'Comprimi tutto' : 'Espandi tutto'}
          </button>
        )}
      </div>

      {/* ── Empty states ── */}
      {wishlist.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Icon name="star" size={28} color="var(--primary)" /></div>
          <div>Nessuna meta ancora</div>
          {canEdit && (
            <div style={{ marginTop: '.75rem', display: 'flex', gap: '.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => setImportModal(true)}>Importa da Google Maps</button>
              <button className="btn btn-secondary" onClick={() => setAddModal(true)}>Aggiungi manualmente</button>
            </div>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Icon name="search" size={24} color="var(--text-light)" /></div>
          <div>Nessuna meta corrisponde ai filtri</div>
          <button className="btn btn-secondary btn-sm mt-2"
            onClick={() => { setCatFilter(''); setCityFilter(''); setShowSlotted(true); setSearch('') }}>
            Rimuovi filtri
          </button>
        </div>
      ) : sortByVotes ? (
        /* ── Top picks: flat list sorted by votes ── */
        <div>
          {topPicks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><Icon name="star" size={24} color="var(--text-light)" /></div>
              <div>Nessun voto ancora</div>
            </div>
          ) : (
            <div className="wishlist-grid">
              {topPicks.map(p => (
                <PlaceCard key={p.id} place={p} tripId={tripId} myRole={myRole} days={days} cities={cities} onRefresh={onRefresh} />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── Grouped by category (collapsible) ── */
        grouped.map(group => {
          const collapsed = collapsedCats.has(group.cat)
          return (
            <div key={group.cat} style={{ marginBottom: collapsed ? '.5rem' : '2rem' }}>
              <button
                onClick={() => toggleCat(group.cat)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '.5rem',
                  width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                  padding: '0 0 .4rem', marginBottom: collapsed ? 0 : '.8rem',
                  borderBottom: `2px solid ${group.color}40`,
                  textAlign: 'left',
                }}
              >
                <span style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: group.color + '22', border: `1.5px solid ${group.color}60`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontSize: '.58rem', fontWeight: 800, color: group.color,
                }}>
                  {group.cat.slice(0, 3).toUpperCase()}
                </span>
                <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text)' }}>{group.label}</span>
                <span style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginLeft: '.1rem' }}>
                  ({group.places.length})
                </span>
                <Icon name="chevronDown" size={15} color="var(--text-muted)"
                  style={{ marginLeft: 'auto', flexShrink: 0, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform .18s' }} />
              </button>
              {!collapsed && (
                <div className="wishlist-grid">
                  {group.places.map(p => (
                    <PlaceCard key={p.id} place={p} tripId={tripId} myRole={myRole} days={days} cities={cities} onRefresh={onRefresh} />
                  ))}
                </div>
              )}
            </div>
          )
        })
      )}

      {addModal && <AddPlaceModal tripId={tripId} cities={cities} onSaved={onRefresh} onClose={() => setAddModal(false)} />}
      {importModal && <ImportFromMapsModal tripId={tripId} onSaved={onRefresh} onClose={() => setImportModal(false)} />}
    </div>
  )
}
