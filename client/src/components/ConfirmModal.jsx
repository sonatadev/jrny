import { useState, useCallback } from 'react'
import Modal from './Modal'
import Icon from './Icon'

export default function ConfirmModal({ title, message, confirmLabel = 'Conferma', danger = false, onConfirm, onClose }) {
  return (
    <Modal
      title={title || 'Conferma'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: '.85rem', alignItems: 'flex-start' }}>
        {danger && <Icon name="warning" size={22} color="var(--danger)" style={{ flexShrink: 0, marginTop: 2 }} />}
        <p style={{ fontSize: '.9rem', lineHeight: 1.55, color: 'var(--text)', margin: 0 }}>{message}</p>
      </div>
    </Modal>
  )
}

export function useConfirm() {
  const [state, setState] = useState(null)

  const confirm = useCallback((opts) => new Promise(resolve => {
    setState({ ...opts, _resolve: resolve })
  }), [])

  function handleConfirm() { state._resolve(true);  setState(null) }
  function handleCancel()  { state._resolve(false); setState(null) }

  const modal = state ? (
    <ConfirmModal
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      danger={state.danger}
      onConfirm={handleConfirm}
      onClose={handleCancel}
    />
  ) : null

  return { confirm, modal }
}
