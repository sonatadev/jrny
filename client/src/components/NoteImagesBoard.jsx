import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'
import { useAuth } from '../js/auth'
import { useConfirm } from './ConfirmModal'
import { uploadNoteImage, updateNoteImageLabel, deleteNoteImage } from '../js/api'

/* Bacheca immagini di pianificazione: incolla screenshot o carica file, con etichetta. */
export default function NoteImagesBoard({ tripId, images = [], myRole, onRefresh }) {
  const { user } = useAuth()
  const canEdit = myRole === 'admin' || myRole === 'editor'
  const isAdmin = myRole === 'admin'
  const currentUserId = user?.id

  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [lightbox, setLightbox] = useState(null) // indice dell'immagine aperta, o null
  const fileRef = useRef(null)
  const { confirm: doConfirm, modal: confirmModal } = useConfirm()

  // Lightbox: blocca lo scroll e abilita navigazione/chiusura da tastiera
  useEffect(() => {
    if (lightbox === null) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e) {
      if (e.key === 'Escape') setLightbox(null)
      else if (e.key === 'ArrowLeft') setLightbox(i => (i - 1 + images.length) % images.length)
      else if (e.key === 'ArrowRight') setLightbox(i => (i + 1) % images.length)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [lightbox, images.length])

  const uploadFiles = useCallback(async (fileList) => {
    const imgs = Array.from(fileList || []).filter(f => f.type.startsWith('image/'))
    if (!imgs.length) return
    setUploading(true)
    try {
      for (const f of imgs) await uploadNoteImage(tripId, f)
      onRefresh()
    } catch { /* ignora errori singoli */ } finally { setUploading(false) }
  }, [tripId, onRefresh])

  // Incolla uno screenshot dagli appunti (ignora se il focus è su un campo di testo)
  useEffect(() => {
    if (!canEdit) return
    function onPaste(e) {
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const files = Array.from(e.clipboardData?.files || []).filter(f => f.type.startsWith('image/'))
      if (files.length) { e.preventDefault(); uploadFiles(files) }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [canEdit, uploadFiles])

  // Drag & drop dei file dall'explorer del sistema
  function onDragOver(e) {
    if (!canEdit) return
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (!dragOver) setDragOver(true)
  }
  function onDragLeave(e) {
    if (!canEdit) return
    // Ignora i passaggi sui figli: si esce solo quando si lascia davvero il contenitore
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false)
  }
  function onDrop(e) {
    if (!canEdit) return
    e.preventDefault()
    setDragOver(false)
    uploadFiles(e.dataTransfer.files)
  }

  async function saveLabel(img, value) {
    const next = (value || '').trim()
    if (next === (img.label || '')) return
    try { await updateNoteImageLabel(tripId, img.id, next); onRefresh() } catch {}
  }

  async function handleDelete(img) {
    const ok = await doConfirm({ message: 'Eliminare questa immagine?', confirmLabel: 'Elimina', danger: true })
    if (!ok) return
    try { await deleteNoteImage(tripId, img.id); onRefresh() } catch {}
  }

  return (
    <div className="note-images-section">
      <div className="note-images-head">
        <span className="note-images-title">
          <Icon name="image" size={15} color="var(--primary)" /> Immagini
        </span>
        {canEdit && (
          <button className="btn btn-secondary btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <span className="spinner spinner-sm" /> : <Icon name="upload" size={14} />}
            {uploading ? ' Carico...' : ' Carica'}
          </button>
        )}
      </div>

      {canEdit && (
        <div className="note-images-hint">
          Trascina i file qui dall'esplora risorse, incolla uno screenshot (Ctrl/Cmd+V) oppure usa <strong>Carica</strong>. Aggiungi un'etichetta sotto ogni immagine.
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" multiple hidden
        onChange={e => { uploadFiles(e.target.files); e.target.value = '' }} />

      <div className={`note-images-drop${dragOver ? ' dragover' : ''}${canEdit ? '' : ' no-drop'}`}
        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        {images.length === 0 ? (
          <div className="empty-state" style={{ padding: '1.5rem 1rem' }}>
            <div className="empty-icon"><Icon name="image" size={26} color="var(--primary)" /></div>
            <div>Nessuna immagine</div>
            {canEdit && <div style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginTop: '.3rem' }}>Trascina qui screenshot e ispirazioni per la pianificazione.</div>}
          </div>
        ) : (
          <div className="note-images-grid">
            {images.map((img, idx) => {
              const canDelete = canEdit && (isAdmin || img.uploaded_by === currentUserId)
              return (
                <div key={img.id} className="note-image-card">
                  <button type="button" className="note-image-thumb" title="Apri" onClick={() => setLightbox(idx)}>
                    <img src={img.url} alt={img.label || ''} loading="lazy" />
                    {canDelete && (
                      <span className="note-image-del" title="Elimina" role="button"
                        onClick={e => { e.stopPropagation(); handleDelete(img) }}>
                        <Icon name="trash" size={13} color="#fff" />
                      </span>
                    )}
                  </button>
                  {canEdit ? (
                    <input className="note-image-label" placeholder="Etichetta…"
                      defaultValue={img.label || ''}
                      onBlur={e => saveLabel(img, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} />
                  ) : (
                    img.label && <div className="note-image-label-ro">{img.label}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {dragOver && <div className="note-images-dropmsg"><Icon name="upload" size={20} color="var(--primary)" /> Rilascia le immagini qui</div>}
      </div>

      {lightbox !== null && images[lightbox] && createPortal(
        <div className="ni-lightbox" onClick={() => setLightbox(null)}>
          <button className="ni-lightbox-close" onClick={() => setLightbox(null)} aria-label="Chiudi">✕</button>
          <img className="ni-lightbox-img" src={images[lightbox].url} alt={images[lightbox].label || ''}
            onClick={e => e.stopPropagation()} />
          {(images[lightbox].label || images[lightbox].uploader_name) && (
            <div className="ni-lightbox-meta" onClick={e => e.stopPropagation()}>
              {images[lightbox].label && <div className="ni-lightbox-label">{images[lightbox].label}</div>}
              {images[lightbox].uploader_name && <div className="ni-lightbox-by">{images[lightbox].uploader_name}</div>}
            </div>
          )}
          {images.length > 1 && (
            <div className="ni-lightbox-nav" onClick={e => e.stopPropagation()}>
              <button onClick={() => setLightbox(i => (i - 1 + images.length) % images.length)} aria-label="Precedente">‹</button>
              <span>{lightbox + 1} / {images.length}</span>
              <button onClick={() => setLightbox(i => (i + 1) % images.length)} aria-label="Successiva">›</button>
            </div>
          )}
        </div>,
        document.body
      )}

      {confirmModal}
    </div>
  )
}
