import { useState } from 'react'
import { DndContext, DragOverlay, useDraggable, useDroppable, closestCenter } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import Icon from './Icon'
import { useConfirm } from './ConfirmModal'
import { updateWishlistPlace, addActivity, deleteActivity } from '../js/api'

const SLOTS = [
  { key: 'mattina',    label: 'Mattina' },
  { key: 'pomeriggio', label: 'Pomeriggio' },
  { key: 'sera',       label: 'Sera' },
  { key: 'notte',      label: 'Notte' },
]

const CAT_COLOR = { tempio: '#8b5cf6', chiesa: '#d4a017', cibo: '#f59e0b', natura: '#10b981', shopping: '#ec4899', museo: '#3b82f6', palestra: '#ef4444', sport: '#f97316', teatro: '#a21caf', cinema: '#4f46e5', musica: '#be185d', nightlife: '#9333ea', benessere: '#0d9488', libreria: '#854d0e', zoo: '#65a30d', acquario: '#0891b2', farmacia: '#16a34a', supermercato: '#0369a1', trasporto: '#6b7280', alloggio: 'var(--primary)', altro: 'var(--text-light)' }
const PRIORITY_DOT = { 1: '#c94040', 2: '#c98c30', 3: '#6b9e7a' }

function DraggablePlace({ place, isDragging }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `place-${place.id}`,
    data: { place },
    disabled: place.is_slotted
  })

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`draggable-place ${place.is_slotted ? 'slotted' : ''} ${isDragging ? 'dragging' : ''}`}
      title={place.is_slotted ? 'Gia pianificato' : 'Trascina su uno slot'}
    >
      <Icon name="drag" size={16} color="var(--text-light)" />
      <div style={{ width: 10, height: 10, borderRadius: 99, background: CAT_COLOR[place.category] || 'var(--text-light)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '.875rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {place.name}
        </div>
        {place.city && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{place.city}</div>}
      </div>
      <div style={{ width: 8, height: 8, borderRadius: 99, background: PRIORITY_DOT[place.priority] || '#aaa', flexShrink: 0 }} />
    </div>
  )
}

function DroppableSlot({ dayId, slot, children, items, canEdit, onClear }) {
  const id = `slot-${dayId}-${slot.key}`
  const { setNodeRef, isOver } = useDroppable({ id, data: { dayId, slot: slot.key } })

  return (
    <div ref={setNodeRef} className={`droppable-slot ${isOver ? 'over' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.5rem' }}>
        <span style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          {slot.label}
        </span>
        {canEdit && items.length > 0 && (
          <button
            className="btn btn-ghost btn-icon btn-sm"
            title={`Svuota ${slot.label}`}
            onClick={() => onClear(items)}
            style={{ marginRight: '-.2rem' }}
          >
            <Icon name="trash" size={13} color="var(--danger)" />
          </button>
        )}
      </div>
      {items.length === 0 && !isOver && (
        <div className="droppable-slot-label">Trascina qui</div>
      )}
      {items.map(act => (
        <div key={act.id} style={{ fontSize: '.8rem', background: 'var(--surface)', borderRadius: 6, padding: '.35rem .6rem', marginBottom: '.3rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          <div style={{ width: 8, height: 8, borderRadius: 99, background: CAT_COLOR[act.category] || 'var(--text-light)', flexShrink: 0 }} />
          {act.name}
        </div>
      ))}
      {children}
    </div>
  )
}

export default function PianoTab({ tripId, wishlist, days, myRole, onRefresh }) {
  const [activePlace, setActivePlace] = useState(null)
  const { confirm: doConfirm, modal: confirmModal } = useConfirm()
  const canEdit = myRole === 'admin' || myRole === 'editor'

  const [wishlistCollapsed, setWishlistCollapsed] = useState(() => {
    const saved = localStorage.getItem('piano-wishlist-collapsed')
    if (saved !== null) return saved === 'true'
    return window.innerWidth < 900
  })

  function toggleWishlist() {
    setWishlistCollapsed(c => {
      const next = !c
      localStorage.setItem('piano-wishlist-collapsed', String(next))
      return next
    })
  }

  const unslotted = wishlist.filter(p => !p.is_slotted)
  const slotted = wishlist.filter(p => p.is_slotted)

  function getActivitiesForSlot(day, slotKey) {
    return (day.activities || []).filter(a => a.slot === slotKey)
  }

  async function clearSlot(day, slotKey, acts) {
    const label = SLOTS.find(s => s.key === slotKey)?.label || slotKey
    const ok = await doConfirm({
      message: `Svuotare "${label}" del ${format(parseISO(day.date), 'd MMM', { locale: it })}? Verranno eliminate ${acts.length} ${acts.length === 1 ? 'attività' : 'attività'}.`,
      confirmLabel: 'Svuota',
      danger: true,
    })
    if (!ok) return
    for (const act of acts) {
      await deleteActivity(tripId, day.id, act.id)
    }
    onRefresh()
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    setActivePlace(null)
    if (!over) return

    const place = active.data.current?.place
    const { dayId, slot } = over.data.current || {}
    if (!place || !dayId || !slot) return

    try {
      await updateWishlistPlace(tripId, place.id, { day_id: dayId, slot, is_slotted: true })
      await addActivity(tripId, dayId, {
        slot,
        name: place.name,
        category: place.category,
        notes: place.notes,
        wishlist_place_id: place.id
      })
      onRefresh()
    } catch (err) {
      console.error('Drag drop error', err)
    }
  }

  function handleDragStart(event) {
    const place = event.active.data.current?.place
    setActivePlace(place || null)
  }

  if (!canEdit) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><Icon name="lock" size={28} color="var(--primary)" /></div>
        <div>Servono permessi di editor per pianificare</div>
      </div>
    )
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="piano-layout">
        <div className="piano-wishlist">
          <div className="card">
            <div className="card-header" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={toggleWishlist}>
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                <Icon name="star" size={15} color="var(--accent)" />
                Wishlist ({unslotted.length} da pianificare)
              </span>
              <Icon
                name="chevronDown"
                size={18}
                color="var(--text-muted)"
                style={{ transform: wishlistCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform .2s' }}
              />
            </div>
            {!wishlistCollapsed && (
              <div className="card-body" style={{ padding: '.75rem' }}>
                {unslotted.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem', fontSize: '.875rem' }}>
                    Tutti i posti sono stati pianificati!
                  </div>
                ) : (
                  unslotted.map(p => (
                    <DraggablePlace key={p.id} place={p} isDragging={activePlace?.id === p.id} />
                  ))
                )}
                {slotted.length > 0 && (
                  <>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-light)', margin: '.75rem 0 .5rem', fontWeight: 700, textTransform: 'uppercase' }}>
                      Pianificati
                    </div>
                    {slotted.map(p => (
                      <DraggablePlace key={p.id} place={p} isDragging={false} />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="piano-days">
          {days.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><Icon name="calendar" size={28} color="var(--primary)" /></div>
              <div>Nessun giorno disponibile</div>
            </div>
          ) : (
            days.map(day => (
              <div key={day.id} className="piano-day card" style={{ marginBottom: '1rem' }}>
                <div style={{ padding: '.75rem 1rem', borderBottom: '1px solid var(--border)', background: 'var(--primary)', color: '#fff', borderRadius: '12px 12px 0 0' }}>
                  <div style={{ fontWeight: 700 }}>{format(parseISO(day.date), 'EEEE d MMMM', { locale: it })}</div>
                  {day.city_area && (
                    <div style={{ fontSize: '.85rem', opacity: .85, display: 'flex', alignItems: 'center', gap: '.3rem' }}>
                      <Icon name="pin" size={12} color="rgba(255,255,255,.8)" />
                      {day.city_area}
                    </div>
                  )}
                </div>
                <div style={{ padding: '.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
                  {SLOTS.map(slot => {
                    const acts = getActivitiesForSlot(day, slot.key)
                    return (
                      <DroppableSlot
                        key={slot.key}
                        dayId={day.id}
                        slot={slot}
                        items={acts}
                        canEdit={canEdit}
                        onClear={items => clearSlot(day, slot.key, items)}
                      />
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {confirmModal}

      <DragOverlay>
        {activePlace && (
          <div className="draggable-place" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)', opacity: .95 }}>
            <div style={{ width: 10, height: 10, borderRadius: 99, background: CAT_COLOR[activePlace.category] || 'var(--text-light)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '.875rem', fontWeight: 600 }}>{activePlace.name}</div>
              {activePlace.city && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{activePlace.city}</div>}
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
