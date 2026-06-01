import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import ParticlesBg from '../components/ParticlesBg'
import Icon from '../components/Icon'
import { getTrips } from '../js/api'
import { format, parseISO, differenceInDays } from 'date-fns'
import { it } from 'date-fns/locale'

function useCountUp(target, duration = 650) {
  const [value, setValue] = useState(0)
  const raf = useRef(null)
  useEffect(() => {
    if (raf.current) cancelAnimationFrame(raf.current)
    if (!target) { setValue(0); return }
    let start = null
    const step = ts => {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      setValue(Math.round(p * target))
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration])
  return value
}

const STATUS_LABELS = {
  pianificazione: 'Pianificazione',
  confermato: 'Confermato',
  concluso: 'Concluso'
}
const STATUS_CLASS = {
  pianificazione: 'status-pianificazione',
  confermato: 'status-confermato',
  concluso: 'status-concluso'
}

function TripCard({ trip, onClick }) {
  const start = parseISO(trip.start_date)
  const end = parseISO(trip.end_date)
  const days = differenceInDays(end, start) + 1

  return (
    <div className="card trip-card" onClick={onClick}>
      <div className="trip-card-cover">
        {trip.cover_image
          ? <img src={trip.cover_image} alt={trip.title} onError={e => { e.target.style.display = 'none' }} />
          : <div className="trip-card-cover-placeholder">
              <Icon name="globe" size={48} color="rgba(255,255,255,.35)" />
            </div>
        }
        <span className={`trip-status-badge ${STATUS_CLASS[trip.status] || 'status-pianificazione'}`}>
          {STATUS_LABELS[trip.status] || trip.status}
        </span>
      </div>
      <div className="trip-card-info">
        <div className="trip-card-title">{trip.title}</div>
        <div className="trip-card-dest">
          <Icon name="pin" size={13} color="var(--text-muted)" />
          {trip.destination}
        </div>
        <div className="trip-card-dates">
          {format(start, 'd MMM yyyy', { locale: it })} — {format(end, 'd MMM yyyy', { locale: it })} · {days} {days === 1 ? 'giorno' : 'giorni'}
        </div>
      </div>
      <div className="trip-card-footer">
        <div className="participants-avatars">
          {Array.from({ length: Math.min(trip.participant_count, 4) }).map((_, i) => (
            <div key={i} className="avatar" style={{ background: `hsl(${i * 60 + 200},60%,50%)` }}>
              {i < 3 ? '?' : `+${trip.participant_count - 3}`}
            </div>
          ))}
        </div>
        <span className="text-xs text-muted">{trip.participant_count} {trip.participant_count === 1 ? 'persona' : 'persone'}</span>
      </div>
    </div>
  )
}

function getNextTrip(trips) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const upcoming = trips
    .filter(t => parseISO(t.start_date) >= today && t.status !== 'concluso')
    .sort((a, b) => parseISO(a.start_date) - parseISO(b.start_date))
  return upcoming[0] || null
}

export default function DashboardPage() {
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('tutti')
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    getTrips().then(r => { setTrips(r.data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const nextTrip = getNextTrip(trips)
  const daysUntil = nextTrip ? differenceInDays(parseISO(nextTrip.start_date), new Date()) : null

  const filtered = trips.filter(t => {
    if (filter !== 'tutti' && t.status !== filter) return false
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
        !t.destination.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const stats = {
    total: trips.length,
    upcoming: trips.filter(t => parseISO(t.start_date) >= new Date()).length,
    completed: trips.filter(t => t.status === 'concluso').length,
  }
  const animTotal     = useCountUp(stats.total)
  const animUpcoming  = useCountUp(stats.upcoming)
  const animCompleted = useCountUp(stats.completed)

  return (
    <Layout>
      <div className="dashboard-hero">
        <ParticlesBg count={18} color="rgba(255,255,255,.6)" />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="dashboard-hero-title">Buon viaggio!</div>
          <div className="dashboard-hero-sub">Pianifica, organizza e vivi le tue avventure</div>
          <div className="hero-actions">
            <button
              className="btn btn-lg"
              style={{ background: '#fff', color: 'var(--primary)', fontWeight: 800 }}
              onClick={() => navigate('/trips/new')}
            >
              <Icon name="add" size={20} color="var(--primary)" /> Nuovo viaggio
            </button>
            {nextTrip && daysUntil !== null && (
              <div className="countdown-badge">
                <Icon name="calendar" size={15} color="#fff" />
                <span>Prossimo: <strong>{nextTrip.title}</strong></span>
                <span className="countdown-days">{daysUntil === 0 ? 'Oggi!' : `${daysUntil}g`}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="stats-strip">
        <div className="stat-chip">
          <Icon name="globe" size={20} color="var(--primary)" />
          <div>
            <div className="stat-chip-value">{animTotal}</div>
            <div className="stat-chip-label">Viaggi totali</div>
          </div>
        </div>
        <div className="stat-chip">
          <Icon name="calendar" size={20} color="var(--accent)" />
          <div>
            <div className="stat-chip-value" style={{ color: 'var(--accent)' }}>{animUpcoming}</div>
            <div className="stat-chip-label">In arrivo</div>
          </div>
        </div>
        <div className="stat-chip">
          <Icon name="check" size={20} color="var(--secondary)" />
          <div>
            <div className="stat-chip-value" style={{ color: 'var(--secondary)' }}>{animCompleted}</div>
            <div className="stat-chip-label">Completati</div>
          </div>
        </div>
      </div>

      <div className="section-header">
        <h2 className="section-title">I miei viaggi</h2>
      </div>

      {/* Search */}
      <div className="search-bar">
        <span className="search-bar-icon"><Icon name="search" size={18} /></span>
        <input
          type="text"
          placeholder="Cerca per titolo o destinazione..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="wishlist-filters">
        {['tutti', 'pianificazione', 'confermato', 'concluso'].map(f => (
          <button key={f} className={`filter-chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'tutti' ? 'Tutti' : STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="page-loading"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Icon name="globe" size={28} color="var(--primary)" /></div>
          <div className="font-bold mb-1">Nessun viaggio trovato</div>
          <div className="text-sm">
            {filter === 'tutti' && !search
              ? 'Inizia creando il tuo primo viaggio!'
              : 'Nessun viaggio corrisponde alla ricerca'}
          </div>
          {filter === 'tutti' && !search && (
            <button className="btn btn-primary mt-2" onClick={() => navigate('/trips/new')}>
              Crea viaggio
            </button>
          )}
        </div>
      ) : (
        <div className="trips-grid">
          {filtered.map(trip => (
            <TripCard key={trip.id} trip={trip} onClick={() => navigate(`/trips/${trip.id}`)} />
          ))}
        </div>
      )}
    </Layout>
  )
}
