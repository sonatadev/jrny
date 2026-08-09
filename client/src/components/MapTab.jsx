import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Icon from './Icon'
import { updateCity } from '../js/api'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function coloredIcon(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 42" width="28" height="42">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 28 14 28s14-17.5 14-28C28 6.27 21.73 0 14 0z"
      fill="${color}" stroke="white" stroke-width="2"/>
    <circle cx="14" cy="14" r="5" fill="white" opacity="0.9"/>
  </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [28, 42],
    iconAnchor: [14, 42],
    popupAnchor: [0, -44],
  })
}

// Category colors, kept in sync with WishlistTab's CAT_COLOR (fallback for unknowns).
const CAT_COLOR = {
  museo: '#3b82f6', galleria: '#7c3aed', attrazione: '#c26b4a', tempio: '#8b5cf6',
  santuario: '#6d28d9', castello: '#92400e', storico: '#a16207', rovine: '#78716c',
  monumento: '#64748b', panorama: '#0284c7', parco: '#16a34a', giardino: '#059669',
  spiaggia: '#0891b2', natura: '#10b981', terme: '#06b6d4',
  ristorante: '#ea580c', cafe: '#92400e', bar: '#b45309', street_food: '#d97706',
  mercato: '#b45309', shopping: '#ec4899', moda: '#db2777', souvenir: '#f43f5e',
  palestra: '#ef4444', sport: '#f97316', piscina: '#0369a1', benessere: '#0d9488',
  teatro: '#a21caf', cinema: '#4f46e5', musica: '#be185d', nightlife: '#9333ea',
  libreria: '#854d0e', chiesa: '#d4a017', farmacia: '#16a34a', supermercato: '#0369a1',
  zoo: '#65a30d', acquario: '#0891b2',
  cibo: '#f59e0b', trasporto: '#6b7280', alloggio: '#c26b4a', altro: '#9ca3af',
}

// Small round marker for individual places, colored by category.
function placeIcon(color) {
  const html = `<div style="width:15px;height:15px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></div>`
  return L.divIcon({
    html,
    className: '',
    iconSize: [15, 15],
    iconAnchor: [7, 7],
    popupAnchor: [0, -9],
  })
}


// Cross-session cache of geocode queries we've already tried, so cities that
// can't be resolved (or already have coords but no English name) don't re-hit
// Nominatim on every map open. Keyed by `${cityName}|${destination}`.
const ATTEMPT_KEY = 'jrny_geocode_attempts'

function loadAttempts() {
  try { return new Set(JSON.parse(localStorage.getItem(ATTEMPT_KEY) || '[]')) }
  catch { return new Set() }
}

function saveAttempt(set, key) {
  set.add(key)
  try { localStorage.setItem(ATTEMPT_KEY, JSON.stringify([...set])) } catch {}
}

async function geocode(cityName, destination) {
  const q = encodeURIComponent(`${cityName}, ${destination}`)
  try {
    // accept-language=en + namedetails gives us the English/romanized name for display.
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&accept-language=en&namedetails=1`)
    const data = await r.json()
    if (data.length > 0) {
      const d = data[0]
      const name_en = (d.namedetails && d.namedetails['name:en'])
        || (d.display_name ? d.display_name.split(',')[0].trim() : null)
      return { lat: parseFloat(d.lat), lon: parseFloat(d.lon), name_en }
    }
  } catch {}
  return null
}

// Fit the view to the given points, but only when the set of points actually
// changes — never on every render. Re-fitting on each render would fight the
// user's manual zoom/pan (setView keeps snapping back).
function FitBounds({ positions, singleZoom = 11 }) {
  const map = useMap()
  const last = useRef(null)
  useEffect(() => {
    if (!positions.length) return
    const sig = positions.map(p => p.join(',')).join('|')
    if (sig === last.current) return
    last.current = sig
    if (positions.length === 1) { map.setView(positions[0], singleZoom); return }
    map.fitBounds(L.latLngBounds(positions), { padding: [50, 50] })
  }, [positions, map, singleZoom])
  return null
}

const CAT_LABEL = {
  museo: 'Museo', galleria: 'Galleria', attrazione: 'Attrazione', tempio: 'Tempio',
  santuario: 'Santuario', castello: 'Castello', storico: 'Storico', rovine: 'Rovine',
  monumento: 'Monumento', panorama: 'Panorama', parco: 'Parco', giardino: 'Giardino',
  spiaggia: 'Spiaggia', natura: 'Natura', terme: 'Terme',
  ristorante: 'Ristorante', cafe: 'Caffetteria', bar: 'Bar', street_food: 'Street Food',
  mercato: 'Mercato', shopping: 'Shopping', moda: 'Moda', souvenir: 'Souvenir',
  teatro: 'Teatro', cinema: 'Cinema', musica: 'Musica', nightlife: 'Nightlife',
  chiesa: 'Chiesa', alloggio: 'Alloggio', altro: 'Altro',
}

const PRIORITY_DOT = { 1: '🔴', 2: '🟡', 3: '🟢' }

export default function MapTab({ tripId, cities, wishlist, trip }) {
  const [coords, setCoords] = useState({})
  const [names, setNames] = useState({})
  const [loading, setLoading] = useState(false)
  // 'cities' → one pin per city; 'places' → individual geolocated places.
  // Default to places when we have any, so imported spots show right away.
  const [view, setView] = useState(() =>
    wishlist.some(p => p.lat != null && p.lon != null) ? 'places' : 'cities'
  )
  const done = useRef(false)

  useEffect(() => {
    if (done.current || cities.length === 0) { setLoading(false); return }
    done.current = true

    // Seed from data we already have.
    const initCoords = {}
    const initNames = {}
    cities.forEach(c => {
      if (c.lat && c.lon) initCoords[c.id] = { lat: parseFloat(c.lat), lon: parseFloat(c.lon) }
      if (c.name_en) initNames[c.id] = c.name_en
    })
    setCoords(initCoords)
    setNames(initNames)

    // A city needs a lookup if it's missing coordinates OR an English name,
    // and we haven't already tried that exact query before (cross-session cache).
    const attempts = loadAttempts()
    const needsLookup = cities.filter(c =>
      (!c.lat || !c.lon || !c.name_en) && !attempts.has(`${c.name}|${trip.destination}`)
    )
    if (!needsLookup.length) return

    setLoading(true)
    ;(async () => {
      for (const city of needsLookup) {
        const r = await geocode(city.name, trip.destination)
        saveAttempt(attempts, `${city.name}|${trip.destination}`)
        if (r) {
          const patch = {}
          if ((!city.lat || !city.lon) && r.lat && r.lon) {
            patch.lat = r.lat
            patch.lon = r.lon
            setCoords(prev => ({ ...prev, [city.id]: { lat: r.lat, lon: r.lon } }))
          }
          if (!city.name_en && r.name_en) {
            patch.name_en = r.name_en
            setNames(prev => ({ ...prev, [city.id]: r.name_en }))
          }
          if (Object.keys(patch).length) {
            try { await updateCity(tripId, city.id, patch) } catch {}
          }
        }
        await new Promise(res => setTimeout(res, 400))
      }
      setLoading(false)
    })()
  }, [cities, trip.destination, tripId])

  const markers = cities
    .filter(c => coords[c.id])
    .map(c => ({
      city: c,
      pos: [coords[c.id].lat, coords[c.id].lon],
      nameEn: names[c.id] || c.name_en || null,
      places: wishlist.filter(p => p.city === c.name),
    }))

  const positions = markers.map(m => m.pos)

  // Individual places with coordinates (captured at Google Maps import time).
  const placeMarkers = wishlist
    .filter(p => p.lat != null && p.lon != null)
    .map(p => ({
      place: p,
      pos: [parseFloat(p.lat), parseFloat(p.lon)],
      color: CAT_COLOR[p.category] || CAT_COLOR.altro,
    }))
    .filter(m => Number.isFinite(m.pos[0]) && Number.isFinite(m.pos[1]))

  const showPlaces = view === 'places' && placeMarkers.length > 0
  const activePositions = showPlaces ? placeMarkers.map(m => m.pos) : positions

  return (
    <div>
      <div className="section-header" style={{ marginBottom: '1.25rem', gap: '.75rem', flexWrap: 'wrap' }}>
        <div className="section-title">Mappa del viaggio</div>
        {loading && (
          <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <div className="spinner" style={{ width: 14, height: 14 }} />
            Geolocalizzazione città...
          </div>
        )}
        {placeMarkers.length > 0 && (
          <div style={{ display: 'flex', gap: 0, marginLeft: 'auto', border: '1.5px solid var(--border-light)', borderRadius: 99, overflow: 'hidden', flexShrink: 0 }}>
            {[
              { key: 'cities', label: `Città (${markers.length})` },
              { key: 'places', label: `Mete (${placeMarkers.length})` },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => setView(opt.key)}
                style={{
                  border: 'none', cursor: 'pointer', padding: '.4rem .85rem',
                  fontSize: '.82rem', fontWeight: 700,
                  background: view === opt.key ? 'var(--primary)' : 'transparent',
                  color: view === opt.key ? '#fff' : 'var(--text-muted)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {cities.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Icon name="map" size={28} color="var(--primary)" /></div>
          <div>Aggiungi città al viaggio per vederle sulla mappa</div>
        </div>
      ) : (
        <div style={{ borderRadius: 'var(--radius)', overflow: 'hidden', border: '1.5px solid var(--border-light)', height: 500, position: 'relative', isolation: 'isolate', zIndex: 0 }}>
          <MapContainer
            center={[20, 10]}
            zoom={2}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              detectRetina
            />
            {!showPlaces && markers.map(({ city, pos, nameEn, places }) => (
              <Marker key={city.id} position={pos} icon={coloredIcon(city.color)}>
                <Popup maxWidth={280} minWidth={180}>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: city.color, marginBottom: '.4rem' }}>
                    {nameEn || city.name}
                    {nameEn && nameEn !== city.name && (
                      <span style={{ display: 'block', fontWeight: 500, fontSize: '.75rem', color: '#888' }}>
                        {city.name}
                      </span>
                    )}
                  </div>
                  {places.length === 0 ? (
                    <div style={{ fontSize: '.8rem', color: '#888' }}>Nessuna meta salvata</div>
                  ) : (
                    <>
                      <div style={{ fontSize: '.75rem', color: '#888', marginBottom: '.4rem' }}>
                        {places.length} {places.length === 1 ? 'meta' : 'mete'}
                      </div>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                        {places.slice(0, 10).map(p => (
                          <li key={p.id} style={{ fontSize: '.82rem', display: 'flex', gap: '.3rem', alignItems: 'flex-start' }}>
                            <span style={{ flexShrink: 0 }}>{PRIORITY_DOT[p.priority] || '⚪'}</span>
                            <span>
                              <strong>{p.name}</strong>
                              {p.category && p.category !== 'altro' && (
                                <span style={{ color: '#888', marginLeft: '.3rem' }}>
                                  · {CAT_LABEL[p.category] || p.category}
                                </span>
                              )}
                            </span>
                          </li>
                        ))}
                        {places.length > 10 && (
                          <li style={{ fontSize: '.78rem', color: '#888' }}>+{places.length - 10} altre mete</li>
                        )}
                      </ul>
                    </>
                  )}
                </Popup>
              </Marker>
            ))}
            {showPlaces && placeMarkers.map(({ place, pos, color }) => (
              <Marker key={`p-${place.id}`} position={pos} icon={placeIcon(color)}>
                <Popup maxWidth={260} minWidth={160}>
                  <div style={{ fontWeight: 700, fontSize: '.95rem', color, marginBottom: '.25rem' }}>
                    <span style={{ marginRight: '.3rem' }}>{PRIORITY_DOT[place.priority] || '⚪'}</span>
                    {place.name}
                  </div>
                  <div style={{ fontSize: '.75rem', color: '#888', marginBottom: place.maps_link ? '.4rem' : 0 }}>
                    {CAT_LABEL[place.category] || place.category}
                    {place.city && ` · ${place.city}`}
                  </div>
                  {place.maps_link && (
                    <a href={place.maps_link} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '.78rem', color: '#2563eb', textDecoration: 'none' }}>
                      Apri in Google Maps ↗
                    </a>
                  )}
                </Popup>
              </Marker>
            ))}
            {activePositions.length > 0 && (
              <FitBounds positions={activePositions} singleZoom={showPlaces ? 14 : 11} />
            )}
          </MapContainer>
        </div>
      )}

      {cities.length > 0 && markers.length < cities.length && !loading && (
        <div style={{ marginTop: '.75rem', fontSize: '.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          {cities.length - markers.length} {cities.length - markers.length === 1 ? 'città non trovata' : 'città non trovate'} sulla mappa
        </div>
      )}

    </div>
  )
}
