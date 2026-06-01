import { useState, useRef, useEffect } from 'react'
import Icon from './Icon'

export default function CustomSelect({
  value, onChange, options = [],
  placeholder = 'Seleziona...',
  style = {},
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const selected = options.find(o => String(o.value) === String(value))

  useEffect(() => {
    function onOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  function handleKey(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o) }
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={ref} className={`custom-select${open ? ' open' : ''}`} style={style}>
      <div
        className="custom-select-trigger form-control"
        onClick={() => setOpen(o => !o)}
        onKeyDown={handleKey}
        tabIndex={0}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span style={selected ? {} : { color: 'var(--text-light)', fontWeight: 400 }}>
          {selected ? selected.label : placeholder}
        </span>
        <Icon name="chevronDown" size={15} color="var(--text-muted)"
          style={{ flexShrink: 0, transition: 'transform .18s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </div>

      {open && (
        <div className="custom-select-dropdown" role="listbox">
          {options.map(opt => (
            <div
              key={opt.value}
              role="option"
              aria-selected={String(opt.value) === String(value)}
              className={`custom-select-option${String(opt.value) === String(value) ? ' selected' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false) }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
