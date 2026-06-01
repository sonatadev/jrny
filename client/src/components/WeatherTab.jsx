import { useState, useEffect } from 'react'
import { parseISO, eachDayOfInterval, format } from 'date-fns'
import { it } from 'date-fns/locale'
import Icon from './Icon'

const WMO_LABEL = {
  0: 'Sereno', 1: 'Parz. nuvoloso', 2: 'Nuvoloso', 3: 'Coperto',
  45: 'Nebbia', 48: 'Nebbia ghiacciata',
  51: 'Pioggerella lieve', 53: 'Pioggerella', 55: 'Pioggerella forte',
  61: 'Pioggia lieve', 63: 'Pioggia', 65: 'Pioggia forte',
  71: 'Neve lieve', 73: 'Neve', 75: 'Neve forte',
  80: 'Rovesci', 81: 'Rovesci moderati', 82: 'Rovesci forti',
  95: 'Temporale', 96: 'Temporale con grandine', 99: 'Temporale forte',
}

const WMO_EMOJI = {
  0: '☀️', 1: '🌤', 2: '⛅', 3: '☁️',
  45: '🌫', 48: '🌫',
  51: '🌦', 53: '🌦', 55: '🌧',
  61: '🌧', 63: '🌧', 65: '⛈',
  71: '🌨', 73: '❄️', 75: '❄️',
  80: '🌦', 81: '🌧', 82: '⛈',
  95: '⛈', 96: '⛈', 99: '⛈',
}

function wmoEmoji(code) {
  if (code === null || code === undefined) return '—'
  const key = [99, 96, 95, 82, 81, 80, 75, 73, 71, 65, 63, 61, 55, 53, 51, 48, 45, 3, 2, 1, 0]
    .find(k => k <= code && WMO_EMOJI[k])
  return WMO_EMOJI[key] || '🌡'
}

function wmoLabel(code) {
  if (code === null || code === undefined) return '—'
  const key = [99, 96, 95, 82, 81, 80, 75, 73, 71, 65, 63, 61, 55, 53, 51, 48, 45, 3, 2, 1, 0]
    .find(k => k <= code && WMO_LABEL[k])
  return WMO_LABEL[key] || 'N/D'
}

export default function WeatherTab({ trip }) {
  const [weather, setWeather] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trip.destination)}&count=1&language=it&format=json`
        )
        const geoData = await geoRes.json()
        if (!geoData.results?.length) {
          setError(`Nessuna posizione trovata per "${trip.destination}"`)
          return
        }
        const { latitude, longitude, name, country } = geoData.results[0]

        const start = trip.start_date.slice(0, 10)
        const end = trip.end_date.slice(0, 10)

        const today = new Date().toISOString().slice(0, 10)
        const forecastEnd = end > today ? end : today

        const wxRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
          `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode` +
          `&start_date=${start > today ? start : today}&end_date=${forecastEnd}` +
          `&timezone=auto&forecast_days=16`
        )
        const wxData = await wxRes.json()

        if (cancelled) return

        setWeather({
          location: `${name}${country ? ', ' + country : ''}`,
          latitude, longitude,
          daily: wxData.daily,
        })
      } catch (e) {
        if (!cancelled) setError('Impossibile caricare le previsioni meteo')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [trip.destination, trip.start_date, trip.end_date])

  if (loading) return <div className="page-loading"><div className="spinner" /></div>

  if (error) return (
    <div className="empty-state">
      <div className="empty-icon"><Icon name="cloud" size={28} color="var(--primary)" /></div>
      <div>{error}</div>
      <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: '.5rem' }}>
        Prova a modificare il nome della destinazione nel viaggio
      </div>
    </div>
  )

  if (!weather?.daily?.time?.length) return (
    <div className="empty-state">
      <div className="empty-icon"><Icon name="cloud" size={28} color="var(--primary)" /></div>
      <div>Previsioni non disponibili per queste date</div>
      <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: '.5rem' }}>
        Open-Meteo fornisce previsioni fino a 16 giorni in avanti
      </div>
    </div>
  )

  const { time, temperature_2m_max, temperature_2m_min, precipitation_sum, weathercode } = weather.daily

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '1.25rem', color: 'var(--text-muted)', fontSize: '.875rem' }}>
        <Icon name="pin" size={14} color="var(--primary)" />
        <span>{weather.location}</span>
        <span style={{ marginLeft: 'auto', fontSize: '.75rem' }}>via Open-Meteo</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '.75rem' }}>
        {time.map((date, i) => {
          const d = parseISO(date)
          const emoji = wmoEmoji(weathercode?.[i])
          const label = wmoLabel(weathercode?.[i])
          const tmax = temperature_2m_max?.[i]
          const tmin = temperature_2m_min?.[i]
          const rain = precipitation_sum?.[i]

          return (
            <div key={date} className="card" style={{ padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'capitalize', marginBottom: '.4rem' }}>
                {format(d, 'EEE d MMM', { locale: it })}
              </div>
              <div style={{ fontSize: '2.2rem', lineHeight: 1.1, marginBottom: '.4rem' }}>{emoji}</div>
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: '.5rem', lineHeight: 1.3 }}>{label}</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '.5rem', fontSize: '.85rem', fontWeight: 700 }}>
                <span style={{ color: 'var(--danger)' }}>{tmax != null ? `${Math.round(tmax)}°` : '—'}</span>
                <span style={{ color: 'var(--text-light)' }}>/</span>
                <span style={{ color: 'var(--primary)' }}>{tmin != null ? `${Math.round(tmin)}°` : '—'}</span>
              </div>
              {rain > 0 && (
                <div style={{ fontSize: '.72rem', color: '#3b82f6', marginTop: '.35rem' }}>
                  💧 {rain.toFixed(1)} mm
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: '1rem', fontSize: '.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
        Previsioni fornite da <a href="https://open-meteo.com" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>Open-Meteo</a> · open source, senza API key
      </div>
    </div>
  )
}
