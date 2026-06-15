import { useState } from 'react'
import Modal from './Modal'
import Icon from './Icon'
import { useConfirm } from './ConfirmModal'
import CustomSelect from './CustomSelect'
import DatePicker from './DatePicker'
import { addExpense, deleteExpense, updateExpense, updateTotalBudget } from '../js/api'

const CATEGORIES = ['vitto', 'alloggio', 'trasporti', 'attività', 'shopping', 'altro']
const CAT_COLOR = { vitto: '#f59e0b', alloggio: 'var(--primary)', trasporti: '#6b7280', 'attività': '#8b5cf6', shopping: '#ec4899', altro: 'var(--text-muted)' }
const CAT_SHORT = { vitto: 'Vit', alloggio: 'All', trasporti: 'Tra', 'attività': 'Att', shopping: 'Shp', altro: 'Alt' }

const EMPTY_FORM = { amount: '', category: 'vitto', description: '', paid_by_name: '', entry_date: '', place_id: '' }

function calculateSplit(byParticipant, participants) {
  if (!participants || participants.length === 0) return null
  const total = Object.values(byParticipant).reduce((a, b) => a + b, 0)
  if (total < 0.01) return null

  const n = participants.length
  const share = total / n

  const people = {}
  participants.forEach(p => { people[p.name] = 0 })
  Object.entries(byParticipant).forEach(([name, paid]) => {
    people[name] = (people[name] || 0) + paid
  })

  const balances = Object.entries(people).map(([name, paid]) => ({
    name, paid, balance: paid - share,
  }))

  const cred = balances.filter(b => b.balance > 0.005).sort((a, b) => b.balance - a.balance).map(b => ({ ...b }))
  const debt = balances.filter(b => b.balance < -0.005).sort((a, b) => a.balance - b.balance).map(b => ({ ...b }))

  const transactions = []
  let ci = 0, di = 0
  while (ci < cred.length && di < debt.length) {
    const amount = Math.min(cred[ci].balance, -debt[di].balance)
    if (amount > 0.005) {
      transactions.push({ from: debt[di].name, to: cred[ci].name, amount })
    }
    cred[ci].balance -= amount
    debt[di].balance += amount
    if (Math.abs(cred[ci].balance) < 0.005) ci++
    if (Math.abs(debt[di].balance) < 0.005) di++
  }

  return { share, balances, transactions }
}

export default function BudgetTab({ tripId, budget, participants, wishlist = [], myRole, onRefresh }) {
  const [addModal, setAddModal] = useState(false)
  const [editEntry, setEditEntry] = useState(null)
  const [budgetModal, setBudgetModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [newBudget, setNewBudget] = useState('')
  const [saving, setSaving] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const { confirm: doConfirm, modal: confirmModal } = useConfirm()
  const canEdit = myRole === 'admin' || myRole === 'editor'

  if (!budget) return <div className="page-loading"><div className="spinner" /></div>

  const { total_budget, total_spent, remaining, by_category, by_participant, entries } = budget

  const placeOptions = [
    { value: '', label: '— Nessuna meta —' },
    ...wishlist.map(p => ({ value: String(p.id), label: p.name })),
  ]
  const pct = total_budget > 0 ? Math.min(100, (total_spent / total_budget) * 100) : 0

  function openEdit(e) {
    setEditForm({
      amount: parseFloat(e.amount).toFixed(2),
      category: e.category,
      description: e.description || '',
      paid_by_name: e.paid_by_user_name || e.paid_by_name || '',
      entry_date: e.entry_date || '',
      place_id: e.place_id ? String(e.place_id) : '',
    })
    setEditEntry(e)
  }

  async function saveExpense() {
    if (!form.amount || !form.category) return
    setSaving(true)
    try {
      await addExpense(tripId, { ...form, amount: parseFloat(form.amount) })
      setForm(EMPTY_FORM)
      onRefresh()
      setAddModal(false)
    } catch { } finally { setSaving(false) }
  }

  async function saveEditExpense() {
    if (!editForm.amount || !editForm.category) return
    setSaving(true)
    try {
      await updateExpense(tripId, editEntry.id, { ...editForm, amount: parseFloat(editForm.amount) })
      onRefresh()
      setEditEntry(null)
    } catch { } finally { setSaving(false) }
  }

  async function saveBudget() {
    setSaving(true)
    try {
      await updateTotalBudget(tripId, { total_budget: parseFloat(newBudget) })
      onRefresh()
      setBudgetModal(false)
    } catch { } finally { setSaving(false) }
  }

  async function removeExpense(id) {
    const ok = await doConfirm({ message: 'Eliminare questa spesa?', confirmLabel: 'Elimina', danger: true })
    if (!ok) return
    await deleteExpense(tripId, id)
    onRefresh()
  }

  const split = calculateSplit(by_participant, participants)

  return (
    <div>
      <div className="budget-summary">
        <div className="budget-stat">
          <div className="budget-stat-value">€{total_budget.toFixed(2)}</div>
          <div className="budget-stat-label">Budget totale</div>
        </div>
        <div className="budget-stat">
          <div className="budget-stat-value" style={{ color: 'var(--warning)' }}>€{total_spent.toFixed(2)}</div>
          <div className="budget-stat-label">Speso</div>
        </div>
        <div className={`budget-stat ${remaining < 0 ? 'danger' : 'success'}`}>
          <div className="budget-stat-value">€{remaining.toFixed(2)}</div>
          <div className="budget-stat-label">Rimanente</div>
        </div>
      </div>

      {total_budget > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '1rem', boxShadow: 'var(--shadow)', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: '.5rem' }}>
            <span>Utilizzo budget</span>
            <span>{pct.toFixed(1)}%</span>
          </div>
          <div style={{ height: 10, background: 'var(--bg)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pct > 90 ? 'var(--danger)' : pct > 70 ? 'var(--warning)' : 'var(--secondary)', borderRadius: 99, transition: 'width .3s' }} />
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
        {Object.keys(by_category).length > 0 && (
          <div className="card">
            <div className="card-header"><span className="card-title">Per categoria</span></div>
            <div className="card-body">
              {Object.entries(by_category).sort((a, b) => b[1] - a[1]).map(([cat, amount]) => (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.5rem' }}>
                  <div style={{ minWidth: 8, height: 8, borderRadius: 99, background: CAT_COLOR[cat] || 'var(--text-muted)', flexShrink: 0 }} />
                  <span style={{ minWidth: 90, fontSize: '.8rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{cat}</span>
                  <div style={{ flex: 1, height: 8, background: 'var(--bg)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: total_spent > 0 ? `${(amount / total_spent) * 100}%` : '0%', background: CAT_COLOR[cat] || 'var(--primary)', borderRadius: 99 }} />
                  </div>
                  <span style={{ fontSize: '.8rem', fontWeight: 600, minWidth: 60, textAlign: 'right' }}>€{amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {Object.keys(by_participant).length > 0 && (
          <div className="card">
            <div className="card-header"><span className="card-title">Per partecipante</span></div>
            <div className="card-body">
              {Object.entries(by_participant).sort((a, b) => b[1] - a[1]).map(([name, amount]) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '.5rem 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '.875rem' }}>{name}</span>
                  <span style={{ fontWeight: 700 }}>€{amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Liquidazione ── */}
        {split && (
          <div className="card">
            <div
              className="card-header"
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setSplitOpen(o => !o)}
            >
              <span className="card-title">Liquidazione rimborsi</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                  quota €{split.share.toFixed(2)}/persona
                </span>
                <Icon
                  name="chevronDown" size={16} color="var(--text-muted)"
                  style={{ transform: splitOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .2s' }}
                />
              </div>
            </div>
            {splitOpen && (
              <div className="card-body">
                <div style={{ marginBottom: '1rem' }}>
                  {split.balances.map(b => (
                    <div key={b.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.4rem 0', borderBottom: '1px solid var(--border-light)' }}>
                      <span style={{ fontSize: '.875rem' }}>{b.name}</span>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginRight: '.5rem' }}>
                          pagato €{b.paid.toFixed(2)}
                        </span>
                        <span style={{
                          fontSize: '.8rem', fontWeight: 700,
                          color: b.balance > 0.005 ? 'var(--secondary)' : b.balance < -0.005 ? 'var(--danger)' : 'var(--text-muted)',
                        }}>
                          {b.balance > 0.005 ? `+€${b.balance.toFixed(2)}` : b.balance < -0.005 ? `-€${Math.abs(b.balance).toFixed(2)}` : '±0'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {split.transactions.length === 0 ? (
                  <p style={{ fontSize: '.875rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Tutto in pari!</p>
                ) : (
                  <div>
                    <div style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.5rem' }}>
                      Da saldare
                    </div>
                    {split.transactions.map((t, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.4rem 0', borderBottom: '1px solid var(--border-light)', fontSize: '.875rem' }}>
                        <span style={{ fontWeight: 600, color: 'var(--danger)' }}>{t.from}</span>
                        <Icon name="plane" size={14} color="var(--text-muted)" style={{ transform: 'rotate(90deg)' }} />
                        <span style={{ fontWeight: 600, color: 'var(--secondary)' }}>{t.to}</span>
                        <span style={{ marginLeft: 'auto', fontWeight: 700 }}>€{t.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="section-header" style={{ marginTop: '1.5rem' }}>
        <div className="section-title">Spese ({entries?.length || 0})</div>
        {canEdit && (
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setNewBudget(total_budget); setBudgetModal(true) }}>Imposta budget</button>
            <button className="btn btn-primary btn-sm" onClick={() => setAddModal(true)}>
              <Icon name="add" size={15} /> Aggiungi spesa
            </button>
          </div>
        )}
      </div>

      {entries?.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Icon name="euro" size={28} color="var(--primary)" /></div>
          <div>Nessuna spesa registrata</div>
          {canEdit && <button className="btn btn-primary mt-2" onClick={() => setAddModal(true)}>Aggiungi la prima spesa</button>}
        </div>
      ) : (
        <div className="expense-list">
          {entries?.map(e => (
            <div key={e.id} className="expense-item">
              <div className="expense-cat-icon" style={{ background: (CAT_COLOR[e.category] || 'var(--primary)') + '22', color: CAT_COLOR[e.category] || 'var(--primary)' }}>
                {(CAT_SHORT[e.category] || 'Alt')}
              </div>
              <div className="expense-info">
                <div className="expense-desc">
                  {e.description || e.category}
                  {e.transport_id && (
                    <span title="Spesa generata dalla sezione Trasporti"
                      style={{ marginLeft: '.4rem', fontSize: '.7rem', fontWeight: 600, color: 'var(--text-muted)', background: 'var(--surface)', padding: '.1rem .4rem', borderRadius: 99 }}>
                      ✈️ da Trasporti
                    </span>
                  )}
                </div>
                <div className="expense-meta">
                  {e.entry_date} · Pagato da: {e.paid_by_user_name || e.paid_by_name || 'N/D'}
                  {' · '}{e.category}
                </div>
                {e.place_name && (
                  <div className="expense-meta" style={{ display: 'flex', alignItems: 'center', gap: '.25rem', color: 'var(--primary)' }}>
                    <Icon name="pin" size={12} color="var(--primary)" /> {e.place_name}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <div className="expense-amount">€{parseFloat(e.amount).toFixed(2)}</div>
                {canEdit && !e.transport_id && (
                  <>
                    <button className="btn btn-ghost btn-icon btn-sm" title="Modifica" onClick={() => openEdit(e)}>
                      <Icon name="edit" size={14} color="var(--text-muted)" />
                    </button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => removeExpense(e.id)}>
                      <Icon name="trash" size={14} color="var(--danger)" />
                    </button>
                  </>
                )}
                {canEdit && e.transport_id && (
                  <Icon name="lock" size={13} color="var(--text-light)" style={{ marginRight: '.35rem' }} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal aggiungi spesa ── */}
      {addModal && (
        <Modal title="Aggiungi spesa" onClose={() => setAddModal(false)}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setAddModal(false)}>Annulla</button>
            <button className="btn btn-primary" onClick={saveExpense} disabled={saving || !form.amount}>{saving ? 'Salvo...' : 'Aggiungi'}</button>
          </>}
        >
          <ExpenseForm form={form} setForm={setForm} placeOptions={placeOptions} participants={participants} />
        </Modal>
      )}

      {/* ── Modal modifica spesa ── */}
      {editEntry && (
        <Modal title="Modifica spesa" onClose={() => setEditEntry(null)}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setEditEntry(null)}>Annulla</button>
            <button className="btn btn-primary" onClick={saveEditExpense} disabled={saving || !editForm.amount}>{saving ? 'Salvo...' : 'Salva'}</button>
          </>}
        >
          <ExpenseForm form={editForm} setForm={setEditForm} placeOptions={placeOptions} participants={participants} />
        </Modal>
      )}

      {confirmModal}

      {budgetModal && (
        <Modal title="Imposta budget totale" onClose={() => setBudgetModal(false)}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setBudgetModal(false)}>Annulla</button>
            <button className="btn btn-primary" onClick={saveBudget} disabled={saving}>{saving ? 'Salvo...' : 'Salva'}</button>
          </>}
        >
          <div className="form-group"><label className="form-label">Budget totale (€)</label>
            <input className="form-control" type="number" min="0" step="0.01"
              value={newBudget} onChange={e => setNewBudget(e.target.value)} />
          </div>
        </Modal>
      )}
    </div>
  )
}

function ExpenseForm({ form, setForm, placeOptions = [], participants = [] }) {
  const hasPlaces = placeOptions.length > 1
  const participantOpts = [
    { value: '', label: '— Seleziona —' },
    ...participants.map(p => ({ value: p.name, label: p.name })),
  ]
  return (
    <>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Importo (€) *</label>
          <input className="form-control" type="number" min="0" step="0.01" placeholder="0.00"
            value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
        </div>
        <div className="form-group"><label className="form-label">Categoria *</label>
          <CustomSelect
            value={form.category}
            onChange={v => setForm(f => ({ ...f, category: v }))}
            options={CATEGORIES.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))}
          />
        </div>
      </div>
      <div className="form-group"><label className="form-label">Descrizione</label>
        <input className="form-control" placeholder="Es. Cena al ristorante"
          value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
      </div>
      {hasPlaces && (
        <div className="form-group"><label className="form-label">Meta collegata (opzionale)</label>
          <CustomSelect
            value={form.place_id || ''}
            onChange={v => setForm(f => ({ ...f, place_id: v }))}
            options={placeOptions}
            placeholder="— Nessuna meta —"
          />
        </div>
      )}
      <div className="form-row">
        <div className="form-group"><label className="form-label">Chi ha pagato</label>
          {participants.length > 0 ? (
            <CustomSelect
              value={form.paid_by_name}
              onChange={v => setForm(f => ({ ...f, paid_by_name: v }))}
              options={participantOpts}
              placeholder="— Seleziona —"
            />
          ) : (
            <input className="form-control" placeholder="Nome partecipante"
              value={form.paid_by_name} onChange={e => setForm(f => ({ ...f, paid_by_name: e.target.value }))} />
          )}
        </div>
        <div className="form-group"><label className="form-label">Data</label>
          <DatePicker
            value={form.entry_date}
            onChange={v => setForm(f => ({ ...f, entry_date: v }))}
            placeholder="Seleziona data"
          />
        </div>
      </div>
    </>
  )
}
