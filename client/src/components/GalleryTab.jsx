import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import Icon from './Icon'
import { useConfirm } from './ConfirmModal'
import { deleteTripPhoto } from '../js/api'

export default function GalleryTab({ wishlist, photos = [], tripId, myRole, onRefresh }) {
  const [section, setSection] = useState('viaggio')
  const [lightbox, setLightbox] = useState(null)
  const { confirm: doConfirm, modal: confirmModal } = useConfirm()

  const canEdit = myRole === 'admin' || myRole === 'editor'

  const photosByDay = useMemo(() => {
    const map = {}
    for (const p of photos) {
      if (!map[p.day_id]) map[p.day_id] = { date: p.day_date, photos: [] }
      map[p.day_id].photos.push(p)
    }
    return Object.values(map).sort((a, b) => new Date(a.date) - new Date(b.date))
  }, [photos])

  const wishlistPhotos = useMemo(() => wishlist.flatMap(place => {
    const imgs = place.photos?.length > 0 ? place.photos : place.photo_url ? [place.photo_url] : []
    return imgs.filter(Boolean).map(url => ({ url, name: place.name, category: place.category }))
  }), [wishlist])

  async function handleDeletePhoto(photo) {
    const ok = await doConfirm({ message: 'Eliminare questa foto?', confirmLabel: 'Elimina', danger: true })
    if (!ok) return
    try {
      await deleteTripPhoto(tripId, photo.id)
      onRefresh()
    } catch {}
  }

  const travelLightboxPhotos = photos
  const wishlistLightboxPhotos = wishlistPhotos

  return (
    <div>
      <div style={{ display: 'flex', gap: '.4rem', marginBottom: '1rem' }}>
        <button
          className={`btn btn-sm ${section === 'viaggio' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSection('viaggio')}
        >
          <Icon name="image" size={13} /> Foto viaggio
          {photos.length > 0 && <span style={{ marginLeft: '.3rem', opacity: .7 }}>({photos.length})</span>}
        </button>
        <button
          className={`btn btn-sm ${section === 'mete' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSection('mete')}
        >
          <Icon name="star" size={13} /> Foto mete
          {wishlistPhotos.length > 0 && <span style={{ marginLeft: '.3rem', opacity: .7 }}>({wishlistPhotos.length})</span>}
        </button>
      </div>

      {section === 'viaggio' && (
        <>
          {photos.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><Icon name="image" size={28} color="var(--primary)" /></div>
              <div>Nessuna foto del viaggio</div>
              <div style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginTop: '.4rem' }}>
                Vai all'itinerario, apri un giorno e usa "Aggiungi foto"
              </div>
            </div>
          ) : (
            photosByDay.map((group, gi) => (
              <div key={gi} style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.5rem' }}>
                  {format(parseISO(group.date), 'EEEE d MMMM', { locale: it })}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '.5rem' }}>
                  {group.photos.map(p => {
                    const globalIdx = travelLightboxPhotos.findIndex(x => x.id === p.id)
                    return (
                      <div
                        key={p.id}
                        style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '1/1', background: 'var(--surface)', boxShadow: 'var(--shadow)', cursor: 'pointer' }}
                      >
                        <img
                          src={p.url} alt={p.caption || ''}
                          loading="lazy"
                          onClick={() => setLightbox({ type: 'viaggio', idx: globalIdx })}
                          onError={e => { e.target.parentElement.style.display = 'none' }}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                        {canEdit && (
                          <button
                            onClick={e => { e.stopPropagation(); handleDeletePhoto(p) }}
                            style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,.55)', border: 'none', cursor: 'pointer', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '.7rem' }}
                          >✕</button>
                        )}
                        {(p.caption || p.activity_name) && (
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,.65))', padding: '.3rem .4rem .35rem' }}>
                            <div style={{ fontSize: '.65rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.caption || p.activity_name}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
          {photos.length > 0 && (
            <div style={{ marginTop: '.5rem', fontSize: '.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              {photos.length} {photos.length === 1 ? 'foto' : 'foto'} in {photosByDay.length} {photosByDay.length === 1 ? 'giorno' : 'giorni'}
            </div>
          )}
        </>
      )}

      {section === 'mete' && (
        <>
          {wishlistPhotos.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><Icon name="image" size={28} color="var(--primary)" /></div>
              <div>Nessuna foto</div>
              <div style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginTop: '.4rem' }}>
                Aggiungi mete dalla wishlist con foto per vederle qui
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '.5rem' }}>
                {wishlistPhotos.map((p, i) => (
                  <div
                    key={i}
                    onClick={() => setLightbox({ type: 'mete', idx: i })}
                    style={{ position: 'relative', cursor: 'pointer', borderRadius: 10, overflow: 'hidden', aspectRatio: '1/1', background: 'var(--surface)', boxShadow: 'var(--shadow)' }}
                  >
                    <img
                      src={p.url} alt={p.name} loading="lazy"
                      onError={e => { e.target.parentElement.style.display = 'none' }}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform .2s' }}
                      onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.05)' }}
                      onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)' }}
                    />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,.6))', padding: '.35rem .5rem .4rem' }}>
                      <div style={{ fontSize: '.68rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '.75rem', fontSize: '.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                {wishlistPhotos.length} foto da {new Set(wishlistPhotos.map(p => p.name)).size} mete
              </div>
            </>
          )}
        </>
      )}

      {lightbox && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,.15)', border: 'none', cursor: 'pointer', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.1rem' }}
          >✕</button>

          {lightbox.type === 'viaggio' && (() => {
            const p = travelLightboxPhotos[lightbox.idx]
            if (!p) return null
            return (
              <>
                <img src={p.url} alt={p.caption || ''} onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,.6)' }} />
                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                  {p.caption && <div style={{ color: '#fff', fontWeight: 600, fontSize: '.95rem' }}>{p.caption}</div>}
                  {p.activity_name && <div style={{ color: 'rgba(255,255,255,.55)', fontSize: '.8rem', marginTop: '.25rem' }}>📍 {p.activity_name}</div>}
                  {p.uploader_name && <div style={{ color: 'rgba(255,255,255,.4)', fontSize: '.75rem', marginTop: '.2rem' }}>📷 {p.uploader_name}</div>}
                </div>
                {travelLightboxPhotos.length > 1 && (
                  <div style={{ display: 'flex', gap: '.75rem', marginTop: '1rem' }}>
                    <button onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, idx: (l.idx - 1 + travelLightboxPhotos.length) % travelLightboxPhotos.length })) }} style={{ background: 'rgba(255,255,255,.15)', border: 'none', cursor: 'pointer', borderRadius: 8, padding: '.4rem .9rem', color: '#fff', fontSize: '1.2rem' }}>‹</button>
                    <span style={{ color: 'rgba(255,255,255,.5)', fontSize: '.85rem', alignSelf: 'center' }}>{lightbox.idx + 1} / {travelLightboxPhotos.length}</span>
                    <button onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, idx: (l.idx + 1) % travelLightboxPhotos.length })) }} style={{ background: 'rgba(255,255,255,.15)', border: 'none', cursor: 'pointer', borderRadius: 8, padding: '.4rem .9rem', color: '#fff', fontSize: '1.2rem' }}>›</button>
                  </div>
                )}
              </>
            )
          })()}

          {lightbox.type === 'mete' && (() => {
            const p = wishlistLightboxPhotos[lightbox.idx]
            if (!p) return null
            return (
              <>
                <img src={p.url} alt={p.name} onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,.6)' }} />
                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: '1rem' }}>{p.name}</div>
                  {p.category && <div style={{ color: 'rgba(255,255,255,.55)', fontSize: '.8rem', marginTop: '.2rem' }}>{p.category}</div>}
                </div>
                {wishlistLightboxPhotos.length > 1 && (
                  <div style={{ display: 'flex', gap: '.75rem', marginTop: '1rem' }}>
                    <button onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, idx: (l.idx - 1 + wishlistLightboxPhotos.length) % wishlistLightboxPhotos.length })) }} style={{ background: 'rgba(255,255,255,.15)', border: 'none', cursor: 'pointer', borderRadius: 8, padding: '.4rem .9rem', color: '#fff', fontSize: '1.2rem' }}>‹</button>
                    <span style={{ color: 'rgba(255,255,255,.5)', fontSize: '.85rem', alignSelf: 'center' }}>{lightbox.idx + 1} / {wishlistLightboxPhotos.length}</span>
                    <button onClick={e => { e.stopPropagation(); setLightbox(l => ({ ...l, idx: (l.idx + 1) % wishlistLightboxPhotos.length })) }} style={{ background: 'rgba(255,255,255,.15)', border: 'none', cursor: 'pointer', borderRadius: 8, padding: '.4rem .9rem', color: '#fff', fontSize: '1.2rem' }}>›</button>
                  </div>
                )}
              </>
            )
          })()}
        </div>,
        document.body
      )}

      {confirmModal}
    </div>
  )
}
