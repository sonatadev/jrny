import { useState, useRef, useEffect } from 'react'
import {
  format, parseISO, isValid, addMonths, subMonths,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
} from 'date-fns'
import { it } from 'date-fns/locale'
import Icon from './Icon'

const WEEKDAYS = ['Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa', 'Do']

export default function DatePicker({ value, onChange, placeholder = 'Seleziona data', min, max }) {
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState(() => {
    if (value) { const d = parseISO(value); if (isValid(d)) return d }
    return new Date()
  })
  const ref = useRef(null)

  const selected = value && isValid(parseISO(value)) ? parseISO(value) : null

  // Keep viewDate in sync when value changes externally
  useEffect(() => {
    if (value) { const d = parseISO(value); if (isValid(d)) setViewDate(d) }
  }, [value])

  useEffect(() => {
    function onOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  const calendarDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(viewDate), { weekStartsOn: 1 }),
    end:   endOfWeek(endOfMonth(viewDate),     { weekStartsOn: 1 }),
  })

  function isDisabled(day) {
    if (min && format(day, 'yyyy-MM-dd') < min) return true
    if (max && format(day, 'yyyy-MM-dd') > max) return true
    return false
  }

  function selectDay(day) {
    if (isDisabled(day)) return
    onChange(format(day, 'yyyy-MM-dd'))
    setOpen(false)
  }

  return (
    <div ref={ref} className="datepicker">
      <div
        className={`datepicker-trigger form-control${open ? ' open' : ''}${!selected ? ' empty' : ''}`}
        onClick={() => setOpen(o => !o)}
        tabIndex={0}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setOpen(o => !o)}
        role="combobox"
        aria-expanded={open}
      >
        <Icon name="calendar" size={16} color={selected ? 'var(--primary)' : 'var(--text-light)'} style={{ flexShrink: 0 }} />
        <span>{selected ? format(selected, 'd MMMM yyyy', { locale: it }) : placeholder}</span>
      </div>

      {open && (
        <div className="datepicker-calendar">
          <div className="datepicker-header">
            <button type="button" className="datepicker-nav" onClick={() => setViewDate(d => subMonths(d, 1))}>‹</button>
            <span style={{ textTransform: 'capitalize', fontWeight: 800, fontSize: '.9rem' }}>
              {format(viewDate, 'MMMM yyyy', { locale: it })}
            </span>
            <button type="button" className="datepicker-nav" onClick={() => setViewDate(d => addMonths(d, 1))}>›</button>
          </div>

          <div className="datepicker-weekdays">
            {WEEKDAYS.map(d => <div key={d} className="datepicker-weekday">{d}</div>)}
          </div>

          <div className="datepicker-days">
            {calendarDays.map(day => {
              const disabled  = isDisabled(day)
              const isSel     = selected && isSameDay(day, selected)
              const isOther   = !isSameMonth(day, viewDate)
              const todayMark = isToday(day) && !isSel
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  className={`datepicker-day${isSel ? ' selected' : ''}${todayMark ? ' today' : ''}${isOther ? ' other-month' : ''}`}
                  onClick={() => selectDay(day)}
                  disabled={disabled}
                  tabIndex={isOther ? -1 : 0}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
