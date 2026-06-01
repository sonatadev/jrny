import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { format, parseISO, differenceInDays } from 'date-fns'
import { it } from 'date-fns/locale'
import { getPublicTrip } from '../js/api'
import Icon from '../components/Icon'
import ParticlesBg from '../components/ParticlesBg'

const SLOTS = [
  { key: 'mattina',    label: 'Mattina',    color: '#f59e0b' },
  { key: 'pomeriggio', label: 'Pomeriggio', color: '#ef8c1a' },
  { key: 'sera',       label: 'Sera',       color: '#8b5cf6' },
  { key: 'notte',      label: 'Notte',      color: '#3b82f6' },
]

const STATUS_LABELS = { pianificazione: 'Pianificazione', confermato: 'Confermato', concluso: 'Concluso' }

export default function SharePage() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getPublicTrip(token)
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.error || 'Link non valido o scaduto'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return <div className="page-loading"><div className="spinner" /></div>

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✈️</div>
        <h2 style={{ marginBottom: '.5rem' }}>Link non valido</h2>
        <p style={{ color: 'var(--text-muted)' }}>{error}</p>
        <a href="/" className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-flex' }}>Vai a jrny</a>
      </div>
    </div>
  )

  const { trip, days, wishlist, participants } = data
  const start = parseISO(trip.start_date)
  const end = parseISO(trip.end_date)
  const totalDays = differenceInDays(end, start) + 1

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ position: 'relative', minHeight: 180, background: 'linear-gradient(135deg, var(--primary), var(--accent))', overflow: 'hidden' }}>
        {trip.cover_image && (
          <img src={trip.cover_image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.35 }} />
        )}
        <div style={{ position: 'absolute', inset: 0 }}><ParticlesBg count={12} color="rgba(255,255,255,.5)" /></div>
        <div style={{ position: 'relative', zIndex: 1, padding: '2rem 1.5rem 1.5rem', color: '#fff' }}>
          <div style={{ fontSize: '.8rem', opacity: .8, marginBottom: '.5rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <Icon name="share2" size={13} color="rgba(255,255,255,.8)" /> Viaggio condiviso
          </div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, lineHeight: 1.2 }}>{trip.title}</h1>
          <div style={{ marginTop: '.5rem', display: 'flex', flexWrap: 'wrap', gap: '.75rem', fontSize: '.85rem', opacity: .9 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
              <Icon name="pin" size={13} /> {trip.destination}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
              <Icon name="calendar" size={13} />
              {format(start, 'd MMM', { locale: it })} — {format(end, 'd MMM yyyy', { locale: it })}
            </span>
            <span>{totalDays} {totalDays === 1 ? 'giorno' : 'giorni'}</span>
            {participants.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
                <Icon name="people" size={13} /> {participants.join(', ')}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
        {trip.description && (
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>{trip.description}</p>
        )}

        {/* Itinerario */}
        {days.length > 0 && (
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <Icon name="itinerary" size={18} color="var(--primary)" /> Itinerario
            </h2>
            {days.map(day => {
              const activities = Array.isArray(day.activities) ? day.activities : []
              const hasActivities = activities.length > 0
              return (
                <div key={day.id} className="card" style={{ marginBottom: '.75rem' }}>
                  <div style={{ padding: '.75rem 1rem', borderBottom: hasActivities ? '1px solid var(--border-light)' : 'none' }}>
                    <div style={{ fontWeight: 700, fontSize: '.9rem' }}>
                      {format(parseISO(day.date), 'EEEE d MMMM', { locale: it })}
                    </div>
                    {day.city_name && (
                      <div style={{ fontSize: '.78rem', color: day.city_color || 'var(--primary)', fontWeight: 600, marginTop: '.2rem' }}>
                        {day.city_name}
                      </div>
                    )}
                    {day.notes && (
                      <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: '.3rem', fontStyle: 'italic' }}>{day.notes}</div>
                    )}
                  </div>
                  {hasActivities && (
                    <div style={{ padding: '.75rem 1rem' }}>
                      {SLOTS.filter(s => activities.some(a => a.slot === s.key)).map(slot => (
                        <div key={slot.key} style={{ marginBottom: '.6rem' }}>
                          <div style={{ fontSize: '.72rem', fontWeight: 700, color: slot.color, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.3rem' }}>
                            {slot.label}
                          </div>
                          {activities.filter(a => a.slot === slot.key).map(act => (
                            <div key={act.id} style={{ display: 'flex', gap: '.5rem', padding: '.3rem 0', borderBottom: '1px solid var(--border-light)', fontSize: '.875rem' }}>
                              <span style={{ flex: 1 }}>{act.name}</span>
                              {act.time && <span style={{ color: 'var(--text-muted)', fontSize: '.78rem' }}>{act.time.slice(0, 5)}</span>}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Wishlist */}
        {wishlist.length > 0 && (
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <Icon name="star" size={18} color="var(--primary)" /> Mete ({wishlist.length})
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.6rem' }}>
              {wishlist.map((p, i) => (
                <div key={i} className="card" style={{ padding: '.75rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{p.name}</div>
                  {p.city && <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{p.city}</div>}
                  {p.notes && <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: '.3rem', fontStyle: 'italic' }}>{p.notes}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: '2.5rem', textAlign: 'center', fontSize: '.8rem', color: 'var(--text-muted)' }}>
          Pianificato con <a href="/" style={{ color: 'var(--primary)', fontWeight: 700 }}>jrny</a>
        </div>
      </div>
    </div>
  )
}
