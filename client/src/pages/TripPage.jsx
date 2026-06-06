import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import ParticlesBg from '../components/ParticlesBg'
import Icon from '../components/Icon'
import { useConfirm } from '../components/ConfirmModal'
import InfoTab from '../components/InfoTab'
import ItineraryTab from '../components/ItineraryTab'
import WishlistTab from '../components/WishlistTab'
import CitiesTab from '../components/CitiesTab'
import BudgetTab from '../components/BudgetTab'
import PianoTab from '../components/PianoTab'
import PackingTab from '../components/PackingTab'
import MapTab from '../components/MapTab'
import WeatherTab from '../components/WeatherTab'
import GalleryTab from '../components/GalleryTab'
import NotesTab from '../components/NotesTab'
import TransportsTab from '../components/TransportsTab'
import { getTrip, getDays, getWishlist, getBudget, deleteTrip, getCities, getTripVersion, getTripPhotos, getNotes, getNoteImages, getTransports } from '../js/api'
import { format, parseISO, differenceInDays } from 'date-fns'
import { it } from 'date-fns/locale'

const TABS = [
  { key: 'info',       label: 'Info',       short: 'Info',   icon: 'info' },
  { key: 'itinerario', label: 'Itinerario', short: 'Giorni', icon: 'itinerary' },
  { key: 'piano',      label: 'Piano',      short: 'Piano',  icon: 'notes' },
  { key: 'mete',       label: 'Mete',       short: 'Mete',   icon: 'star' },
  { key: 'budget',     label: 'Budget',     short: 'Budget', icon: 'euro' },
  { key: 'packing',    label: 'Zaino',      short: 'Zaino',  icon: 'backpack' },
  { key: 'trasporti',  label: 'Trasporti',  short: 'Trasp.', icon: 'plane' },
  { key: 'note',       label: 'Note',       short: 'Note',   icon: 'notes' },
  { key: 'mappa',      label: 'Mappa',      short: 'Mappa',  icon: 'map' },
]

const PRIMARY_NAV = ['info', 'itinerario', 'mete', 'mappa']
const MORE_NAV    = ['piano', 'budget', 'packing', 'trasporti', 'note']

// Sotto-viste consolidate dentro una tab (riduce il numero di destinazioni top-level)
const SUBTABS = {
  info:       [{ key: 'panoramica', label: 'Panoramica', icon: 'info' }, { key: 'meteo', label: 'Meteo', icon: 'cloud' }],
  itinerario: [{ key: 'giorni',     label: 'Giorni',     icon: 'itinerary' }, { key: 'foto', label: 'Foto', icon: 'image' }],
  mappa:      [{ key: 'mappa',      label: 'Mappa',      icon: 'map' }, { key: 'citta', label: 'Città', icon: 'pin' }],
}

export default function TripPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState('info')
  const [subView, setSubView] = useState(null)
  const [moreOpen, setMoreOpen] = useState(false)

  // Cambia tab azzerando la sotto-vista (torna al primo sub di default)
  const selectTab = (key) => { setTab(key); setSubView(null) }
  const [trip, setTrip] = useState(null)
  const [days, setDays] = useState([])
  const [wishlist, setWishlist] = useState([])
  const [budget, setBudget] = useState(null)
  const [cities, setCities] = useState([])
  const [photos, setPhotos] = useState([])
  const [notes, setNotes] = useState([])
  const [noteImages, setNoteImages] = useState([])
  const [transports, setTransports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { confirm: doConfirm, modal: confirmModal } = useConfirm()
  const versionRef = useRef(null)

  const loadAll = useCallback(async () => {
    try {
      const [tripRes, daysRes, wlRes, budRes, citiesRes, photosRes, notesRes, noteImagesRes, transportsRes] = await Promise.all([
        getTrip(id), getDays(id), getWishlist(id), getBudget(id), getCities(id), getTripPhotos(id), getNotes(id), getNoteImages(id), getTransports(id)
      ])
      setTrip(tripRes.data)
      setDays(daysRes.data)
      setWishlist(wlRes.data)
      setBudget(budRes.data)
      setCities(citiesRes.data)
      setPhotos(photosRes.data)
      setNotes(notesRes.data)
      setNoteImages(noteImagesRes.data)
      setTransports(transportsRes.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Errore nel caricamento del viaggio')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadAll() }, [loadAll])

  // Real-time polling: refresh when collaborators make changes
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const { data } = await getTripVersion(id)
        if (versionRef.current !== null && data.version !== versionRef.current) {
          loadAll()
        }
        versionRef.current = data.version
      } catch {}
    }, 20000)
    return () => clearInterval(interval)
  }, [id, loadAll])

  async function handleDelete() {
    const ok = await doConfirm({
      message: `Eliminare "${trip.title}"? L'azione è irreversibile.`,
      confirmLabel: 'Elimina viaggio', danger: true,
    })
    if (!ok) return
    await deleteTrip(id)
    navigate('/')
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>
  if (error) return (
    <Layout backTo="/">
      <div className="alert alert-error"><Icon name="warning" size={16} />{error}</div>
    </Layout>
  )
  if (!trip) return null

  const myRole    = trip.my_role
  const start     = parseISO(trip.start_date)
  const end       = parseISO(trip.end_date)
  const totalDays = differenceInDays(end, start) + 1
  const daysUntil = differenceInDays(start, new Date())

  const subTabs = SUBTABS[tab]
  const sub = subView || subTabs?.[0]?.key

  return (
    <Layout title={trip.title} backTo="/">
      <div className="trip-header">
        <div className="trip-header-cover">
          {trip.cover_image
            ? <img src={trip.cover_image} alt={trip.title} onError={e => e.target.style.display='none'} />
            : null}
          <div style={{ position: 'absolute', inset: 0 }}>
            <ParticlesBg count={14} color="rgba(255,255,255,.5)" />
          </div>
          <div className="trip-header-overlay">
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div className="trip-header-title">{trip.title}</div>
              <div className="trip-header-sub">
                <Icon name="pin" size={14} color="rgba(255,255,255,.85)" />
                {trip.destination}
              </div>
            </div>
          </div>
        </div>
        <div className="trip-header-body">
          <div className="trip-meta-item">
            <Icon name="calendar" size={15} color="var(--text-muted)" />
            {format(start, 'd MMM', { locale: it })} — {format(end, 'd MMM yyyy', { locale: it })}
          </div>
          <div className="trip-meta-item">
            <Icon name="people" size={15} color="var(--text-muted)" />
            {trip.participants?.length || 0} persone
          </div>
          <div className="trip-meta-item">
            <Icon name="euro" size={15} color="var(--text-muted)" />
            Budget: €{parseFloat(trip.total_budget || 0).toFixed(0)}
          </div>
          {daysUntil > 0 && (
            <div className="trip-meta-item" style={{ color: 'var(--primary)', fontWeight: 700 }}>
              <Icon name="plane" size={15} color="var(--primary)" />
              {daysUntil} giorni alla partenza
            </div>
          )}
          {daysUntil === 0 && (
            <div className="trip-meta-item" style={{ color: 'var(--secondary)', fontWeight: 700 }}>
              Partenza oggi!
            </div>
          )}
          {myRole === 'admin' && (
            <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={handleDelete}>
              <Icon name="trash" size={14} /> Elimina viaggio
            </button>
          )}
        </div>
      </div>

      <div className="card trip-tab-card">
        <div className="tabs">
          {TABS.map(t => (
            <button key={t.key} className={`tab-btn ${tab === t.key ? 'active' : ''}`} onClick={() => selectTab(t.key)}>
              <Icon name={t.icon} size={15} color={tab === t.key ? 'var(--primary)' : 'var(--text-muted)'} />
              {t.label}
            </button>
          ))}
        </div>

        <div key={tab} className="trip-tab-content">
          {subTabs && (
            <div className="subtabs" role="tablist">
              {subTabs.map(s => (
                <button key={s.key} role="tab" aria-selected={sub === s.key}
                  className={`subtab-btn ${sub === s.key ? 'active' : ''}`}
                  onClick={() => setSubView(s.key)}>
                  <Icon name={s.icon} size={14} color={sub === s.key ? 'var(--primary)' : 'var(--text-muted)'} />
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {tab === 'info' && sub === 'panoramica' && (
            <InfoTab trip={trip} myRole={myRole} onTripUpdated={loadAll} days={days} />
          )}
          {tab === 'info' && sub === 'meteo' && <WeatherTab trip={trip} />}

          {tab === 'itinerario' && sub === 'giorni' && (
            <ItineraryTab tripId={id} days={days} myRole={myRole} onRefresh={loadAll}
              wishlist={wishlist} cities={cities} onCitiesRefresh={loadAll} photos={photos}
              transports={transports} />
          )}
          {tab === 'itinerario' && sub === 'foto' && (
            <GalleryTab wishlist={wishlist} photos={photos} tripId={id} myRole={myRole} onRefresh={loadAll} />
          )}

          {tab === 'piano' && (
            <PianoTab tripId={id} wishlist={wishlist} days={days} myRole={myRole} onRefresh={loadAll} />
          )}
          {tab === 'mete' && (
            <WishlistTab tripId={id} wishlist={wishlist} days={days} myRole={myRole}
              onRefresh={loadAll} cities={cities} />
          )}
          {tab === 'budget' && (
            <BudgetTab tripId={id} budget={budget} participants={trip.participants} myRole={myRole} onRefresh={loadAll} />
          )}
          {tab === 'packing' && (
            <PackingTab tripId={id} myRole={myRole} participants={trip.participants} />
          )}
          {tab === 'trasporti' && (
            <TransportsTab tripId={id} transports={transports} cities={cities} days={days}
              myRole={myRole} onRefresh={loadAll} />
          )}
          {tab === 'note' && (
            <NotesTab tripId={id} notes={notes} noteImages={noteImages} cities={cities} participants={trip.participants}
              myRole={myRole} onRefresh={loadAll} />
          )}

          {tab === 'mappa' && sub === 'mappa' && (
            <MapTab tripId={id} cities={cities} wishlist={wishlist} trip={trip} />
          )}
          {tab === 'mappa' && sub === 'citta' && (
            <CitiesTab tripId={id} cities={cities} wishlist={wishlist} myRole={myRole} onRefresh={loadAll} />
          )}
        </div>
      </div>

      {confirmModal}

      {/* Bottom navigation — mobile */}
      <nav className="bottom-nav" aria-label="Navigazione principale">
        {TABS.filter(t => PRIMARY_NAV.includes(t.key)).map(t => (
          <button key={t.key} className={`bottom-nav-item${tab === t.key ? ' active' : ''}`}
            onClick={() => selectTab(t.key)}>
            <Icon name={t.icon} size={22} color={tab === t.key ? 'var(--primary)' : 'var(--text-light)'} />
            <span>{t.short}</span>
          </button>
        ))}
        <button
          className={`bottom-nav-item${MORE_NAV.includes(tab) ? ' active' : ''}`}
          onClick={() => setMoreOpen(true)}
        >
          <Icon name="more" size={22} color={MORE_NAV.includes(tab) ? 'var(--primary)' : 'var(--text-light)'} />
          <span>Altro</span>
        </button>
      </nav>

      {/* More drawer */}
      {moreOpen && (
        <>
          <div className="more-drawer-backdrop" onClick={() => setMoreOpen(false)} />
          <div className="more-drawer">
            <div className="more-drawer-handle" />
            <div className="more-drawer-grid">
              {TABS.filter(t => MORE_NAV.includes(t.key)).map(t => (
                <button
                  key={t.key}
                  className={`more-drawer-item${tab === t.key ? ' active' : ''}`}
                  onClick={() => { selectTab(t.key); setMoreOpen(false) }}
                >
                  <div className="more-drawer-icon">
                    <Icon name={t.icon} size={26} color={tab === t.key ? 'var(--primary)' : 'var(--text-muted)'} />
                  </div>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </Layout>
  )
}
