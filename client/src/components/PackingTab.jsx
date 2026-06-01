import { useState, useEffect } from 'react'
import Icon from './Icon'
import CustomSelect from './CustomSelect'
import { getPacking, addPackingItem, updatePackingItem, deletePackingItem } from '../js/api'

const PACKING_CATEGORIES = [
  { key: 'documenti',    label: 'Documenti',    color: '#3b82f6', icon: 'list' },
  { key: 'vestiti',     label: 'Vestiti',       color: '#ec4899', icon: 'star' },
  { key: 'igiene',      label: 'Igiene',        color: '#10b981', icon: 'check' },
  { key: 'elettronica', label: 'Elettronica',   color: '#8b5cf6', icon: 'info' },
  { key: 'medicine',    label: 'Medicine',      color: '#f59e0b', icon: 'warning' },
  { key: 'altro',       label: 'Altro',         color: 'var(--text-muted)', icon: 'backpack' },
]

const DEFAULT_ITEMS = {
  documenti:    ['Passaporto', 'Carta d\'identità', 'Biglietti', 'Assicurazione', 'Patente'],
  vestiti:      ['Maglie', 'Pantaloni', 'Scarpe comode', 'Giacca', 'Biancheria'],
  igiene:       ['Spazzolino', 'Dentifricio', 'Shampoo', 'Crema solare', 'Deodorante'],
  elettronica:  ['Telefono', 'Caricatore', 'Adattatore', 'Cuffie', 'Power bank'],
  medicine:     ['Antidolorifico', 'Cerotti', 'Antistaminico'],
  altro:        ['Sacchetti zip', 'Occhiali da sole', 'Bottiglia acqua'],
}

function CategoryBlock({ category, items, canEdit, tripId, participants, onRefresh }) {
  const [newName, setNewName] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [adding, setAdding] = useState(false)
  const checked = items.filter(i => i.checked).length
  const pct = items.length > 0 ? (checked / items.length) * 100 : 0

  async function toggle(item) {
    await updatePackingItem(tripId, item.id, { checked: !item.checked })
    onRefresh()
  }

  async function toggleAll() {
    const newVal = checked < items.length
    for (const item of items) {
      if (item.checked !== newVal) {
        await updatePackingItem(tripId, item.id, { checked: newVal })
      }
    }
    onRefresh()
  }

  async function assignItem(item, name) {
    await updatePackingItem(tripId, item.id, { assigned_to_name: name || null })
    onRefresh()
  }

  async function addItem() {
    if (!newName.trim()) return
    setAdding(true)
    try {
      await addPackingItem(tripId, { name: newName.trim(), category: category.key, assigned_to_name: newAssignee || null })
      setNewName('')
      setNewAssignee('')
      onRefresh()
    } finally { setAdding(false) }
  }

  async function remove(itemId) {
    await deletePackingItem(tripId, itemId)
    onRefresh()
  }

  function handleKey(e) {
    if (e.key === 'Enter') addItem()
  }

  return (
    <div className="packing-category">
      <div className="packing-category-header">
        <div className="packing-category-icon" style={{ background: category.color }}>
          <Icon name={category.icon} size={16} color="#fff" />
        </div>
        <div className="packing-category-title">{category.label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.25rem', marginLeft: 'auto' }}>
          <div className="packing-category-count">{checked}/{items.length}</div>
          {canEdit && items.length > 0 && (
            <button
              className="btn btn-ghost btn-icon btn-sm"
              title={checked === items.length ? 'Deseleziona tutto' : 'Seleziona tutto'}
              onClick={toggleAll}
              style={{ padding: '2px', opacity: .7 }}
            >
              <Icon name={checked === items.length ? 'close' : 'check'} size={13} color={category.color} />
            </button>
          )}
        </div>
      </div>
      {items.length > 0 && (
        <div className="packing-progress">
          <div className="packing-progress-bar" style={{ width: `${pct}%`, background: category.color }} />
        </div>
      )}
      <div className="packing-items">
        {items.map(item => (
          <div key={item.id} className={`packing-item ${item.checked ? 'checked' : ''}`}>
            <div className="packing-checkbox"
              style={item.checked ? { background: category.color, borderColor: category.color } : {}}
              onClick={() => canEdit && toggle(item)}>
              {item.checked && <Icon name="check" size={13} color="#fff" />}
            </div>
            <span className="packing-item-name" style={{ flex: 1 }} onClick={() => canEdit && toggle(item)}>{item.name}</span>
            {item.assigned_to_name && (
              <span style={{ fontSize: '.7rem', background: 'var(--bg)', border: '1px solid var(--border-light)', borderRadius: 99, padding: '1px 7px', color: 'var(--text-muted)', flexShrink: 0 }}>
                {item.assigned_to_name}
              </span>
            )}
            {canEdit && participants?.length > 0 && (
              <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
                <CustomSelect
                  value={item.assigned_to_name || ''}
                  onChange={v => assignItem(item, v)}
                  placeholder="—"
                  options={[
                    { value: '', label: '—' },
                    ...participants.map(p => ({ value: p.name, label: p.name })),
                  ]}
                  style={{ minWidth: 90, fontSize: '.75rem' }}
                />
              </div>
            )}
            {canEdit && (
              <button className="packing-item-del" onClick={e => { e.stopPropagation(); remove(item.id) }}>
                <Icon name="close" size={14} color="var(--danger)" />
              </button>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <div style={{ fontSize: '.8rem', color: 'var(--text-light)', fontStyle: 'italic', padding: '.4rem .5rem' }}>
            Nessun elemento
          </div>
        )}
      </div>
      {canEdit && (
        <div className="packing-add-row" style={{ flexWrap: 'wrap', gap: '.4rem' }}>
          <input
            type="text"
            placeholder="Aggiungi elemento..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={handleKey}
            style={{ flex: '1 1 140px', minWidth: 0 }}
          />
          {participants?.length > 0 && (
            <CustomSelect
              value={newAssignee}
              onChange={v => setNewAssignee(v)}
              placeholder="A chi?"
              options={[
                { value: '', label: 'A chi?' },
                ...participants.map(p => ({ value: p.name, label: p.name })),
              ]}
              style={{ flex: '0 0 auto', minWidth: 110 }}
            />
          )}
          <button className="btn btn-primary btn-sm btn-icon" onClick={addItem} disabled={adding || !newName.trim()}>
            <Icon name="add" size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

export default function PackingTab({ tripId, myRole, participants }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [preloaded, setPreloaded] = useState(false)
  const canEdit = myRole === 'admin' || myRole === 'editor'

  async function load() {
    try {
      const res = await getPacking(tripId)
      setItems(res.data)
    } catch { } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [tripId])

  async function preload() {
    setPreloaded(true)
    const toAdd = []
    for (const [cat, names] of Object.entries(DEFAULT_ITEMS)) {
      for (const name of names) {
        toAdd.push({ name, category: cat })
      }
    }
    for (const item of toAdd) {
      await addPackingItem(tripId, item)
    }
    load()
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>

  const total = items.length
  const checked = items.filter(i => i.checked).length
  const globalPct = total > 0 ? Math.round((checked / total) * 100) : 0

  return (
    <div>
      <div className="section-header">
        <div className="section-title">
          Lista zaino
          {total > 0 && (
            <span style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--text-muted)', marginLeft: '.75rem' }}>
              {checked}/{total} ({globalPct}%)
            </span>
          )}
        </div>
        {canEdit && !preloaded && total === 0 && (
          <button className="btn btn-secondary btn-sm" onClick={preload}>
            <Icon name="list" size={14} /> Carica lista predefinita
          </button>
        )}
      </div>

      {total > 0 && (
        <div style={{ marginBottom: '1.25rem', background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '1rem', boxShadow: 'var(--shadow)', border: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.5rem', fontSize: '.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            <span>Completamento zaino</span>
            <span style={{ color: globalPct === 100 ? 'var(--secondary)' : 'var(--text-muted)' }}>{globalPct}%</span>
          </div>
          <div style={{ height: 8, background: 'var(--bg)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${globalPct}%`,
              background: globalPct === 100
                ? 'var(--secondary)'
                : `linear-gradient(90deg, var(--primary), var(--accent))`,
              borderRadius: 99,
              transition: 'width .4s ease',
            }} />
          </div>
          {globalPct === 100 && (
            <div style={{ marginTop: '.6rem', fontSize: '.82rem', color: 'var(--secondary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '.35rem' }}>
              <Icon name="check" size={15} color="var(--secondary)" /> Pronto per partire!
            </div>
          )}
        </div>
      )}

      {total === 0 && canEdit && (
        <div className="empty-state">
          <div className="empty-icon"><Icon name="backpack" size={28} color="var(--primary)" /></div>
          <div className="font-bold mb-1">Zaino vuoto</div>
          <div className="text-sm mb-2">Aggiungi gli elementi da portare in viaggio</div>
          <button className="btn btn-primary" onClick={preload}>
            <Icon name="list" size={16} /> Carica lista predefinita
          </button>
        </div>
      )}

      {total === 0 && !canEdit && (
        <div className="empty-state">
          <div className="empty-icon"><Icon name="backpack" size={28} color="var(--primary)" /></div>
          <div>Nessun elemento ancora</div>
        </div>
      )}

      {total > 0 && (
        <div className="packing-grid">
          {PACKING_CATEGORIES.map(cat => {
            const catItems = items.filter(i => i.category === cat.key)
            return (
              <CategoryBlock
                key={cat.key}
                category={cat}
                items={catItems}
                canEdit={canEdit}
                tripId={tripId}
                participants={participants}
                onRefresh={load}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
