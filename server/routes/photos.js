const router = require('express').Router({ mergeParams: true });
const { pool } = require('../db/init');
const { randomFileToken } = require('../utils/security');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const PHOTOS_DIR = path.join(__dirname, '../uploads/photos');
if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PHOTOS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `photo-${Date.now()}-${randomFileToken()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo immagini consentite'));
  },
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

router.get('/', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id);
  if (!role) return res.status(403).json({ error: 'Accesso negato' });
  try {
    const result = await pool.query(
      `SELECT tp.*, u.name AS uploader_name, td.date AS day_date, da.name AS activity_name
       FROM trip_photos tp
       LEFT JOIN users u ON u.id = tp.uploaded_by
       LEFT JOIN trip_days td ON td.id = tp.day_id
       LEFT JOIN day_activities da ON da.id = tp.activity_id
       WHERE tp.trip_id = $1
       ORDER BY td.date, tp.created_at`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore recupero foto' });
  }
});

router.post('/', upload.single('image'), async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(403).json({ error: 'Permesso insufficiente' });
  }
  if (!req.file) return res.status(400).json({ error: 'Nessuna immagine' });

  const { day_id, activity_id, caption } = req.body;
  if (!day_id) return res.status(400).json({ error: 'day_id obbligatorio' });

  try {
    const dayCheck = await pool.query(
      'SELECT id FROM trip_days WHERE id=$1 AND trip_id=$2',
      [day_id, req.params.id]
    );
    if (!dayCheck.rows.length) return res.status(404).json({ error: 'Giorno non trovato' });

    const result = await pool.query(
      `INSERT INTO trip_photos (trip_id, day_id, activity_id, url, caption, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        req.params.id,
        parseInt(day_id),
        activity_id ? parseInt(activity_id) : null,
        `/uploads/photos/${req.file.filename}`,
        caption || null,
        req.user.id,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore caricamento foto' });
  }
});

router.delete('/:photoId', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });
  try {
    const photo = await pool.query(
      'SELECT url, uploaded_by FROM trip_photos WHERE id=$1 AND trip_id=$2',
      [req.params.photoId, req.params.id]
    );
    if (!photo.rows.length) return res.status(404).json({ error: 'Foto non trovata' });

    if (role !== 'admin' && photo.rows[0].uploaded_by !== req.user.id) {
      return res.status(403).json({ error: 'Puoi eliminare solo le tue foto' });
    }

    // Risolvi il path e verifica che resti dentro la cartella foto (anti path-traversal)
    const fullPath = path.resolve(__dirname, '..', '.' + photo.rows[0].url);
    if (fullPath.startsWith(PHOTOS_DIR + path.sep)) {
      try { fs.unlinkSync(fullPath); } catch {}
    }

    await pool.query('DELETE FROM trip_photos WHERE id=$1', [req.params.photoId]);
    res.json({ message: 'Foto eliminata' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore eliminazione foto' });
  }
});

module.exports = router;
