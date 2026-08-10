const router = require('express').Router({ mergeParams: true });
const { pool } = require('../db/init');
const { imageFileFilter, imageFilename } = require('../utils/security');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const NOTE_IMG_DIR = path.join(__dirname, '../uploads/note-images');
if (!fs.existsSync(NOTE_IMG_DIR)) fs.mkdirSync(NOTE_IMG_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, NOTE_IMG_DIR),
  filename: (req, file, cb) => cb(null, imageFilename('noteimg', file.originalname)),
});

const upload = multer({
  storage,
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

async function checkAccess(tripId, userId, minRole = 'viewer') {
  const res = await pool.query(
    'SELECT role FROM trip_participants WHERE trip_id=$1 AND user_id=$2',
    [tripId, userId]
  );
  if (!res.rows.length) return null;
  const role = res.rows[0].role;
  if (minRole === 'editor' && role === 'viewer') return null;
  if (minRole === 'admin' && role !== 'admin') return null;
  return role;
}

// GET /api/trips/:id/note-images
router.get('/', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id);
  if (!role) return res.status(403).json({ error: 'Accesso negato' });
  try {
    const result = await pool.query(
      `SELECT ni.*, u.name AS uploader_name
       FROM note_images ni
       LEFT JOIN users u ON u.id = ni.uploaded_by
       WHERE ni.trip_id = $1
       ORDER BY ni.sort_order, ni.created_at`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore recupero immagini' });
  }
});

// POST /api/trips/:id/note-images
router.post('/', upload.single('image'), async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(403).json({ error: 'Permesso insufficiente' });
  }
  if (!req.file) return res.status(400).json({ error: 'Nessuna immagine' });

  const { label } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO note_images (trip_id, url, label, uploaded_by)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, `/uploads/note-images/${req.file.filename}`, label || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore caricamento immagine' });
  }
});

// PUT /api/trips/:id/note-images/:imageId — aggiorna l'etichetta (collaborativo: qualsiasi editor)
router.put('/:imageId', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });
  const { label } = req.body;
  try {
    const result = await pool.query(
      'UPDATE note_images SET label=$1 WHERE id=$2 AND trip_id=$3 RETURNING *',
      [label || null, req.params.imageId, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Immagine non trovata' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiornamento immagine' });
  }
});

// DELETE /api/trips/:id/note-images/:imageId
router.delete('/:imageId', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });
  try {
    const img = await pool.query(
      'SELECT url, uploaded_by FROM note_images WHERE id=$1 AND trip_id=$2',
      [req.params.imageId, req.params.id]
    );
    if (!img.rows.length) return res.status(404).json({ error: 'Immagine non trovata' });

    if (role !== 'admin' && img.rows[0].uploaded_by !== req.user.id) {
      return res.status(403).json({ error: 'Puoi eliminare solo le tue immagini' });
    }

    // Risolvi il path e verifica che resti dentro la cartella (anti path-traversal)
    const fullPath = path.resolve(__dirname, '..', '.' + img.rows[0].url);
    if (fullPath.startsWith(NOTE_IMG_DIR + path.sep)) {
      try { fs.unlinkSync(fullPath); } catch {}
    }

    await pool.query('DELETE FROM note_images WHERE id=$1', [req.params.imageId]);
    res.json({ message: 'Immagine eliminata' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore eliminazione immagine' });
  }
});

module.exports = router;
