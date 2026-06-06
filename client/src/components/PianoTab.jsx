import { useState, useEffect } from 'react'
import { DndContext, useDraggable, useDroppable, pointerWithin, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import Icon from './Icon'
import Modal from './Modal'
import { useConfirm } from './ConfirmModal'
import { addActivity, deleteActivity } from '../js/api'

const SLOTS = [
  { key: 'mattina',    label: 'Mattina' },
  { key: 'pomeriggio', label: 'Pomeriggio' },
  { key: 'sera',       label: 'Sera' },
  { key: 'notte',      label: 'Notte' },
]

const CAT_COLOR = { tempio: '#8b5cf6', chiesa: '#d4a017', cibo: '#f59e0b', natura: '#10b981', shopping: '#ec4899', museo: '#3b82f6', palestra: '#ef4444', sport: '#f97316', teatro: '#a21caf', cinema: '#4f46e5', musica: '#be185d', nightlife: '#9333ea', benessere: '#0d9488', libreria: '#854d0e', zoo: '#65a30d', acquario: '#0891b2', farmacia: '#16a34a', supermercato: '#0369a1', trasporto: '#6b7280', alloggio: 'var(--primary)', altro: 'var(--text-light)' }
const PRIORITY_DOT = { 1: '#c94040', 2: '#c98c30', 3: '#6b9e7a' }

function DraggablePlace({ place, dragDisabled, usage = 0 }) {
  // Un posto resta trascinabile anche se già pianificato: può andare in più slot/giorni.
  // Trasciniamo direttamente l'elemento sorgente con transform (niente DragOverlay): così
  // la card segue esattamente il cursore, immune al problema di posizionamento `fixed`
  // causato dall'antenato `.trip-tab-content` che mantiene un transform (animazione tabEnter).
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `place-${place.id}`,
    data: { place },
    disabled: dragDisabled
  })

  // transition:'none' evita il lag (la card insegue il cursore senza animare ad ogni frame)
  const style = transform
    ? { transform: CSS.Translate.toString(transform), transition: 'none', zIndex: 50, position: 'relative' }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`draggable-place ${usage > 0 ? 'slotted' : ''} ${isDragging ? 'dragging' : ''} ${dragDisabled ? 'no-drag' : ''}`}
      title={dragDisabled ? '' : 'Trascina su uno slot (anche più volte)'}
    >
      {!dragDisabled && <Icon name="drag" size={16} color="var(--text-light)" />}
      <div style={{ width: 10, height: 10, borderRadius: 99, background: CAT_COLOR[place.category] || 'var(--text-light)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '.875rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {place.name}
        </div>
        {place.city && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{place.city}</div>}
      </div>
      {usage > 0 && <span className="piano-usage-badge" title={`Già in ${usage} slot`}>×{usage}</span>}
      <div style={{ width: 8, height: 8, borderRadius: 99, background: PRIORITY_DOT[place.priority] || '#aaa', flexShrink: 0 }} />
    </div>
  )
}

function DroppableSlot({ dayId, slot, children, items, canEdit, onClear, onAdd, dragHint }) {
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
      {items.length === 0 && !isOver && dragHint && (
        <div className="droppable-slot-label">Trascina qui</div>
      )}
      {items.map(act => (
        <div key={act.id} style={{ fontSize: '.8rem', background: 'var(--surface)', borderRadius: 6, padding: '.35rem .6rem', marginBottom: '.3rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          <div style={{ width: 8, height: 8, borderRadius: 99, background: CAT_COLOR[act.category] || 'var(--text-light)', flexShrink: 0 }} />
          {act.name}
        </div>
      ))}
      {canEdit && (
        <button className="piano-add-btn" onClick={onAdd} title={`Aggiungi a ${slot.label}`}>
          <Icon name="add" size={14} color="var(--primary)" /> Aggiungi
        </button>
      )}
      {children}
    </div>
  )
}

// Picker: scegli quale meta della wishlist assegnare allo slot (alternativa al drag, ideale su mobile).
// Mostra tutte le mete — anche quelle già pianificate — così un posto può finire in più slot/giorni.
function AddToSlotModal({ places, usageCount, slotLabel, dayLabel, onPick, onClose }) {
  // Non ancora pianificati in cima, poi i già pianificati (comunque ri-aggiungibili)
  const sorted = [...places].sort((a, b) => (usageCount[a.id] ? 1 : 0) - (usageCount[b.id] ? 1 : 0))
  return (
    <Modal title={`Aggiungi a ${slotLabel}`} onClose={onClose}
      footer={<button className="btn btn-secondary" onClick={onClose}>Chiudi</button>}>
      <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: '.75rem' }}>{dayLabel}</div>
      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.25rem 1rem', fontSize: '.875rem' }}>
          Nessuna meta in wishlist. Aggiungine dalla tab <strong>Mete</strong>.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
          {sorted.map(p => {
            const used = usageCount[p.id] || 0
            return (
              <button key={p.id} className="piano-pick-item" onClick={() => onPick(p)}>
                <div style={{ width: 10, height: 10, borderRadius: 99, background: CAT_COLOR[p.category] || 'var(--text-light)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.9rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  {p.city && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{p.city}</div>}
                </div>
                {used > 0 && <span className="piano-usage-badge" title={`Già in ${used} slot`}>già ×{used}</span>}
                <div style={{ width: 8, height: 8, borderRadius: 99, background: PRIORITY_DOT[p.priority] || '#aaa', flexShrink: 0 }} />
                <Icon name="add" size={16} color="var(--primary)" />
              </button>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

export default function PianoTab({ tripId, wishlist, days, myRole, onRefresh }) {
  const [addTarget, setAddTarget] = useState(null)
  const { confirm: doConfirm, modal: confirmModal } = useConfirm()
  const canEdit = myRole === 'admin' || myRole === 'editor'

  // Soglia di 8px prima di attivare il drag: evita drag accidentali e click "scattosi"
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )

  // Su mobile il drag&drop touch confligge con lo scroll: lo disabilitiamo e usiamo il menu "+ Aggiungi"
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 640)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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

  // Quante volte ogni meta è già pianificata (un posto può stare in più slot/giorni)
  const usageCount = {}
  for (const day of days) {
    for (const a of (day.activities || [])) {
      if (a.wishlist_place_id) usageCount[a.wishlist_place_id] = (usageCount[a.wishlist_place_id] || 0) + 1
    }
  }

  const unslotted = wishlist.filter(p => !usageCount[p.id])
  const slotted = wishlist.filter(p => usageCount[p.id])

  function getActivitiesForSlot(day, slotKey) {
    return (day.activities || []).filter(a => a.slot === slotKey)
  }

  // Assegna una meta a uno slot/giorno (usato sia dal drag sia dal menu).
  // Crea una nuova attività ogni volta → lo stesso posto può finire in più slot.
  // Il backend (endpoint /slots) marca da sé is_slotted sul posto.
  async function assignPlace(place, dayId, slot) {
    try {
      await addActivity(tripId, dayId, {
        slot,
        name: place.name,
        category: place.category,
        notes: place.notes,
        wishlist_place_id: place.id
      })
      onRefresh()
    } catch (err) {
      console.error('Assign place error', err)
    }
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
    if (!over) return

    const place = active.data.current?.place
    const { dayId, slot } = over.data.current || {}
    if (!place || !dayId || !slot) return

    await assignPlace(place, dayId, slot)
  }

  async function handlePick(place) {
    if (!addTarget) return
    const { day, slotKey } = addTarget
    setAddTarget(null)
    await assignPlace(place, day.id, slotKey)
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
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
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
                {!isMobile && (
                  <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: '.6rem' }}>
                    Trascina una meta su uno slot (anche più volte), oppure usa <strong>+ Aggiungi</strong> sotto ogni slot.
                  </div>
                )}
                {unslotted.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem', fontSize: '.875rem' }}>
                    Tutti i posti sono stati pianificati!
                  </div>
                ) : (
                  unslotted.map(p => (
                    <DraggablePlace key={p.id} place={p} dragDisabled={isMobile} usage={0} />
                  ))
                )}
                {slotted.length > 0 && (
                  <>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-light)', margin: '.75rem 0 .5rem', fontWeight: 700, textTransform: 'uppercase' }}>
                      Pianificati · ri-assegnabili
                    </div>
                    {slotted.map(p => (
                      <DraggablePlace key={p.id} place={p} dragDisabled={isMobile} usage={usageCount[p.id] || 0} />
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
                        dragHint={!isMobile}
                        onClear={items => clearSlot(day, slot.key, items)}
                        onAdd={() => setAddTarget({ day, slotKey: slot.key, slotLabel: slot.label })}
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

      {addTarget && (
        <AddToSlotModal
          places={wishlist}
          usageCount={usageCount}
          slotLabel={addTarget.slotLabel}
          dayLabel={format(parseISO(addTarget.day.date), 'EEEE d MMMM', { locale: it })}
          onPick={handlePick}
          onClose={() => setAddTarget(null)}
        />
      )}
    </DndContext>
  )
}
