const router = require('express').Router({ mergeParams: true });
const { pool } = require('../db/init');
const { randomFileToken } = require('../utils/security');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ATTACH_DIR = path.join(__dirname, '../uploads/attachments');
if (!fs.existsSync(ATTACH_DIR)) fs.mkdirSync(ATTACH_DIR, { recursive: true });

// Estensioni eseguibili/attive che non devono mai essere accettate come allegato
const BLOCKED_EXT = new Set([
  '.html', '.htm', '.xhtml', '.shtml', '.svg', '.js', '.mjs', '.php', '.phtml',
  '.exe', '.bat', '.cmd', '.sh', '.com', '.scr', '.msi', '.jar', '.htaccess',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ATTACH_DIR),
  filename: (req, file, cb) => {
    // Normalizza l'estensione e neutralizza quelle pericolose
    let ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXT.has(ext)) ext = '.bin';
    cb(null, `att-${Date.now()}-${randomFileToken()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXT.has(ext)) return cb(new Error('Tipo di file non consentito'));
    cb(null, true);
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
      `SELECT ta.*, u.name AS uploader_name
       FROM trip_attachments ta
       LEFT JOIN users u ON u.id = ta.uploaded_by
       WHERE ta.trip_id = $1
       ORDER BY ta.created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore recupero allegati' });
  }
});

router.post('/', upload.single('file'), async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });
  if (!req.file) return res.status(400).json({ error: 'Nessun file' });
  try {
    const result = await pool.query(
      `INSERT INTO trip_attachments (trip_id, name, file_path, file_size, mime_type, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        req.params.id,
        req.file.originalname,
        `/uploads/attachments/${req.file.filename}`,
        req.file.size,
        req.file.mimetype,
        req.user.id,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore caricamento file' });
  }
});

router.delete('/:attId', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });
  try {
    const att = await pool.query(
      'SELECT file_path FROM trip_attachments WHERE id=$1 AND trip_id=$2',
      [req.params.attId, req.params.id]
    );
    if (!att.rows.length) return res.status(404).json({ error: 'File non trovato' });

    // Risolvi il path e verifica che resti dentro la cartella allegati (anti path-traversal)
    const fullPath = path.resolve(__dirname, '..', '.' + att.rows[0].file_path);
    if (fullPath.startsWith(ATTACH_DIR + path.sep)) {
      try { fs.unlinkSync(fullPath); } catch {}
    }

    await pool.query('DELETE FROM trip_attachments WHERE id=$1', [req.params.attId]);
    res.json({ message: 'File eliminato' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore eliminazione file' });
  }
});

module.exports = router;
