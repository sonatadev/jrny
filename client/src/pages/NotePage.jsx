import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useEditor, EditorContent, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extensions'
import Layout from '../components/Layout'
import Icon from '../components/Icon'
import CustomSelect from '../components/CustomSelect'
import { getNote, getTrip, getCities, updateNote, uploadImage } from '../js/api'

const NOTE_PALETTE = ['#f59e0b', '#c26b4a', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#ef4444', '#6b7280']

/* ─── Toolbar ──────────────────────────────────────────────────────────────── */
function Toolbar({ editor, onPickImage, uploading }) {
  // Subscribe to selection/state so active buttons stay in sync
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'), italic: e.isActive('italic'),
      underline: e.isActive('underline'), strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      h2: e.isActive('heading', { level: 2 }),
      bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'),
    }),
  })
  const Btn = ({ active, title, onClick, children, style }) => (
    <button type="button" title={title}
      className={`btn btn-ghost btn-icon btn-sm${active ? ' active' : ''}`}
      style={{ ...(active ? { background: 'var(--surface)', color: 'var(--primary)' } : {}), ...style }}
      onMouseDown={e => e.preventDefault()} onClick={onClick}>{children}</button>
  )
  return (
    <div className="note-editor-toolbar">
      <Btn title="Grassetto" active={state.bold} style={{ fontWeight: 800 }}
        onClick={() => editor.chain().focus().toggleBold().run()}>B</Btn>
      <Btn title="Corsivo" active={state.italic} style={{ fontStyle: 'italic' }}
        onClick={() => editor.chain().focus().toggleItalic().run()}>i</Btn>
      <Btn title="Sottolineato" active={state.underline} style={{ textDecoration: 'underline' }}
        onClick={() => editor.chain().focus().toggleUnderline().run()}>U</Btn>
      <Btn title="Barrato" active={state.strike} style={{ textDecoration: 'line-through' }}
        onClick={() => editor.chain().focus().toggleStrike().run()}>S</Btn>
      <Btn title="Evidenzia" active={state.highlight}
        onClick={() => editor.chain().focus().toggleHighlight().run()}>
        <span style={{ background: 'rgba(245,158,11,.5)', borderRadius: 3, padding: '0 .25em' }}>H</span></Btn>
      <span className="note-editor-sep" />
      <Btn title="Titolo" active={state.h2} style={{ fontWeight: 800 }}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Btn>
      <Btn title="Elenco puntato" active={state.bullet}
        onClick={() => editor.chain().focus().toggleBulletList().run()}><Icon name="list" size={15} /></Btn>
      <Btn title="Elenco numerato" active={state.ordered}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        style={{ fontWeight: 700, fontSize: '.72rem' }}>1.</Btn>
      <span className="note-editor-sep" />
      <Btn title="Inserisci immagine" onClick={onPickImage}>
        {uploading ? <span className="spinner spinner-sm" /> : <Icon name="image" size={15} />}</Btn>
    </div>
  )
}

/* ─── NotePage ─────────────────────────────────────────────────────────────── */
export default function NotePage() {
  const { id, noteId } = useParams()
  const navigate = useNavigate()

  const [meta, setMeta] = useState(null)   // { title, scope, city_id, participant_user_id, color }
  const [cities, setCities] = useState([])
  const [participants, setParticipants] = useState([])
  const [role, setRole] = useState(null)
  const [loadErr, setLoadErr] = useState('')
  const [status, setStatus] = useState('idle') // idle | saving | saved
  const [uploading, setUploading] = useState(false)

  const canEdit = role === 'admin' || role === 'editor'

  const editorRef = useRef(null)
  const metaRef = useRef(null)            // latest meta for debounced/flush saves
  const saveTimer = useRef(null)
  const contentSet = useRef(false)
  const fileRef = useRef(null)

  // Carica immagine sul server e la inserisce come nodo (solo URL /uploads, niente base64)
  const uploadAndInsert = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const { data } = await uploadImage(file)
      if (data?.url && data.url.startsWith('/uploads/'))
        editorRef.current?.chain().focus().setImage({ src: data.url }).run()
    } catch { /* ignora errori di upload */ } finally { setUploading(false) }
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight,
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder: 'Scrivi la tua nota… (incolla immagini direttamente)' }),
    ],
    content: '',
    editorProps: {
      attributes: { class: 'note-prosemirror' },
      handlePaste: (_view, event) => {
        const img = Array.from(event.clipboardData?.files || []).find(f => f.type.startsWith('image/'))
        if (img) { event.preventDefault(); uploadAndInsert(img); return true }
        return false
      },
      handleDrop: (_view, event) => {
        const img = Array.from(event.dataTransfer?.files || []).find(f => f.type.startsWith('image/'))
        if (img) { event.preventDefault(); uploadAndInsert(img); return true }
        return false
      },
    },
    onUpdate: () => scheduleSave(),
  })
  editorRef.current = editor

  // Save helpers ----------------------------------------------------------------
  const doSave = useCallback(async () => {
    const m = metaRef.current
    if (!m || !editorRef.current) return
    // Rispecchia la validazione del modale: scope con riferimento obbligatorio
    if (m.scope === 'city' && !m.city_id) return
    if (m.scope === 'participant' && !m.participant_user_id) return
    setStatus('saving')
    try {
      await updateNote(id, noteId, {
        title: m.title,
        body: editorRef.current.getHTML(),
        scope: m.scope,
        color: m.color,
        city_id: m.scope === 'city' ? m.city_id : null,
        participant_user_id: m.scope === 'participant' ? m.participant_user_id : null,
      })
      setStatus('saved')
    } catch { setStatus('idle') }
  }, [id, noteId])

  // Stabile (non dipende da canEdit): l'onUpdate dell'editor cattura questa closure una
  // sola volta, quindi leggiamo lo stato modificabile a runtime da editor.isEditable.
  const scheduleSave = useCallback(() => {
    if (!editorRef.current?.isEditable) return
    setStatus('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(doSave, 800)
  }, [doSave])

  function patchMeta(patch) {
    setMeta(m => {
      const next = { ...m, ...patch }
      metaRef.current = next
      return next
    })
    scheduleSave()
  }

  // Load ------------------------------------------------------------------------
  useEffect(() => {
    let alive = true
    Promise.all([getNote(id, noteId), getTrip(id), getCities(id)])
      .then(([n, t, c]) => {
        if (!alive) return
        const m = {
          title: n.data.title || '',
          scope: n.data.scope || 'general',
          city_id: n.data.city_id || '',
          participant_user_id: n.data.participant_user_id || '',
          color: n.data.color || NOTE_PALETTE[0],
          body: n.data.body || '',
        }
        metaRef.current = m
        setMeta(m)
        setParticipants(t.data.participants || [])
        setRole(t.data.my_role)
        setCities(c.data || [])
      })
      .catch(() => { if (alive) setLoadErr('Nota non trovata o accesso negato.') })
    return () => { alive = false }
  }, [id, noteId])

  // Inietta il contenuto nell'editor una volta (quando editor + dati pronti)
  useEffect(() => {
    if (editor && meta && !contentSet.current) {
      editor.commands.setContent(meta.body || '', { emitUpdate: false })
      editor.setEditable(canEdit)
      contentSet.current = true
    }
  }, [editor, meta, canEdit])

  useEffect(() => { if (editor) editor.setEditable(canEdit) }, [editor, canEdit])

  // Flush in sospeso all'uscita dalla pagina
  useEffect(() => () => {
    clearTimeout(saveTimer.current)
    if (canEdit && contentSet.current) doSave()
  }, [canEdit, doSave])

  function onPickImage() { fileRef.current?.click() }
  function onFileChange(e) {
    const f = e.target.files?.[0]
    if (f) uploadAndInsert(f)
    e.target.value = ''
  }

  if (loadErr) {
    return (
      <Layout title="Nota" backTo={`/trips/${id}`}>
        <div className="empty-state"><div>{loadErr}</div></div>
      </Layout>
    )
  }

  const statusText = status === 'saving' ? 'Salvataggio…' : status === 'saved' ? 'Salvato' : ''

  return (
    <Layout title="Nota" backTo={`/trips/${id}`}>
      <div className="note-page">
        {!meta ? (
          <div className="page-loading"><div className="spinner" /></div>
        ) : (
          <>
            {/* Metadati */}
            <div className="note-page-head card" style={{ borderLeft: `4px solid ${meta.color || '#f59e0b'}` }}>
              <input className="note-title-input" placeholder="Titolo della nota"
                value={meta.title} disabled={!canEdit}
                onChange={e => patchMeta({ title: e.target.value })} />

              {canEdit && (
                <>
                  <div className="act-slot-row" style={{ marginTop: '.6rem' }}>
                    {['general', 'city', 'participant'].map(s => (
                      <button key={s} type="button"
                        className={`act-slot-pill${meta.scope === s ? ' active' : ''}`}
                        style={meta.scope === s ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : {}}
                        onClick={() => patchMeta({ scope: s })}>
                        {s === 'general' ? 'Generale' : s === 'city' ? 'Città' : 'Partecipante'}
                      </button>
                    ))}
                  </div>

                  {meta.scope === 'city' && (
                    <div className="form-group" style={{ marginTop: '.6rem', marginBottom: 0 }}>
                      {cities.length > 0 ? (
                        <CustomSelect value={String(meta.city_id || '')} onChange={v => patchMeta({ city_id: v })}
                          placeholder="— Scegli città —"
                          options={[{ value: '', label: '— Scegli città —' }, ...cities.map(c => ({ value: String(c.id), label: c.name }))]} />
                      ) : (
                        <div className="day-no-cities-hint">Nessuna città definita.</div>
                      )}
                    </div>
                  )}

                  {meta.scope === 'participant' && (
                    <div className="form-group" style={{ marginTop: '.6rem', marginBottom: 0 }}>
                      <CustomSelect value={String(meta.participant_user_id || '')} onChange={v => patchMeta({ participant_user_id: v })}
                        placeholder="— Scegli partecipante —"
                        options={[{ value: '', label: '— Scegli partecipante —' }, ...participants.map(p => ({ value: String(p.user_id || p.id), label: p.name }))]} />
                    </div>
                  )}

                  <div className="city-color-dots" style={{ marginTop: '.7rem' }}>
                    {NOTE_PALETTE.map(c => (
                      <button key={c} type="button"
                        className={`city-color-dot${meta.color === c ? ' active' : ''}`}
                        style={{ background: c }} onClick={() => patchMeta({ color: c })} />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Editor */}
            <div className="note-editor card">
              {canEdit && editor && (
                <Toolbar editor={editor} onPickImage={onPickImage} uploading={uploading} />
              )}
              <EditorContent editor={editor} />
            </div>

            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFileChange} />

            <div className="note-page-status">
              {statusText && <span>{statusText}</span>}
              {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => { clearTimeout(saveTimer.current); doSave().then(() => navigate(`/trips/${id}`)) }}>Fatto</button>}
              {!canEdit && <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/trips/${id}`)}>Indietro</button>}
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
