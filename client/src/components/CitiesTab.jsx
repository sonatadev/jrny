import { useState } from 'react'
import Modal from './Modal'
import Icon from './Icon'
import { addCity, deleteCity } from '../js/api'
import { cityLabel } from '../js/cityLabel'

function AddCityModal({ tripId, onSaved, onClose }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  async function save() {
    if (!name.trim()) return
    setSaving(true)
    try { await addCity(tripId, { name: name.trim() }); onSaved(); onClose() }
    catch { } finally { setSaving(false) }
  }
  return (
    <Modal title="Aggiungi città" onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" onClick={save} disabled={saving || !name.trim()}>
          {saving ? 'Salvo...' : 'Aggiungi'}
        </button>
      </>}
    >
      <div className="form-group">
        <label className="form-label">Nome città</label>
        <input className="form-control" placeholder="Es. Kyoto" autoFocus
          value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && save()} />
      </div>
    </Modal>
  )
}

export default function CitiesTab({ tripId, cities, wishlist, myRole, onRefresh }) {
  const [addModal, setAddModal] = useState(false)
  const canEdit = myRole === 'admin' || myRole === 'editor'

  async function handleDelete(city) {
    const count = wishlist.filter(p => p.city === city.name).length
    const warn  = count > 0 ? ` Ci sono ${count} mete associate a questa città.` : ''
    if (!confirm(`Eliminare la città "${city.name}"?${warn}`)) return
    await deleteCity(tripId, city.id)
    onRefresh()
  }

  return (
    <div>
      {/* Header */}
      <div className="section-header" style={{ marginBottom: '1.25rem' }}>
        <div className="section-title">Città del viaggio ({cities.length})</div>
        {canEdit && (
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button className="btn btn-primary btn-sm" onClick={() => setAddModal(true)}>
              <Icon name="add" size={15} /> Aggiungi città
            </button>
          </div>
        )}
      </div>

      {/* Empty state */}
      {cities.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon"><Icon name="pin" size={28} color="var(--primary)" /></div>
          <div>Nessuna città ancora</div>
          {canEdit && (
            <div style={{ display: 'flex', gap: '.75rem', marginTop: '.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setAddModal(true)}>
                Aggiungi manualmente
              </button>
            </div>
          )}
        </div>
      )}

      {/* City grid */}
      {cities.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '1rem' }}>
          {cities.map(city => {
            const count = wishlist.filter(p => p.city === city.name).length
            return (
              <div key={city.id} style={{
                background: 'var(--surface)',
                border: '1.5px solid var(--border-light)',
                borderLeft: `5px solid ${city.color}`,
                borderRadius: 'var(--radius-sm)',
                padding: '1rem 1rem 1rem 1.1rem',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex',
                alignItems: 'center',
                gap: '.85rem',
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: city.color + '22', border: `2px solid ${city.color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon name="pin" size={18} color={city.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '.95rem', color: 'var(--text)', marginBottom: '.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {cityLabel(city)}
                  </div>
                  <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
                    {count} {count === 1 ? 'meta' : 'mete'}
                  </div>
                </div>
                {canEdit && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleDelete(city)}
                    style={{ flexShrink: 0 }}
                    title="Elimina città"
                  >
                    <Icon name="trash" size={14} color="var(--danger)" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {addModal && (
        <AddCityModal tripId={tripId} onSaved={onRefresh} onClose={() => setAddModal(false)} />
      )}
    </div>
  )
}
