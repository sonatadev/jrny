const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const { pool } = require('../db/init');

// Cartella fisica di allegati e biglietti (NON più servita staticamente: vedi index.js)
const ATTACH_DIR = path.join(__dirname, '../uploads/attachments');

// I nomi file generati sono del tipo `att-...` / `ticket-...`: niente separatori di path.
// Rifiuta qualsiasi cosa che non sia un basename semplice (anti path-traversal).
const SAFE_NAME = /^[\w.\-]+$/;

// Verifica che l'utente sia un partecipante del viaggio
async function isParticipant(tripId, userId) {
  const r = await pool.query(
    'SELECT 1 FROM trip_participants WHERE trip_id=$1 AND user_id=$2',
    [tripId, userId]
  );
  return r.rows.length > 0;
}

// GET /api/files/attachment/:filename
// Serve un allegato o un biglietto solo se l'utente appartiene al viaggio che lo possiede.
router.get('/attachment/:filename', async (req, res) => {
  const filename = req.params.filename;
  if (!SAFE_NAME.test(filename)) return res.status(400).json({ error: 'Nome file non valido' });

  const storedPath = `/uploads/attachments/${filename}`;
  try {
    // Risale al viaggio proprietario: prima fra gli allegati, poi fra i biglietti dei trasporti.
    let tripId = null;
    let downloadName = filename;

    const att = await pool.query(
      'SELECT trip_id, name FROM trip_attachments WHERE file_path=$1',
      [storedPath]
    );
    if (att.rows.length) {
      tripId = att.rows[0].trip_id;
      downloadName = att.rows[0].name || filename;
    } else {
      const tk = await pool.query(
        'SELECT trip_id, ticket_name FROM transports WHERE ticket_path=$1',
        [storedPath]
      );
      if (tk.rows.length) {
        tripId = tk.rows[0].trip_id;
        downloadName = tk.rows[0].ticket_name || filename;
      }
    }

    if (tripId === null) return res.status(404).json({ error: 'File non trovato' });
    if (!await isParticipant(tripId, req.user.id))
      return res.status(403).json({ error: 'Accesso negato' });

    // Doppia verifica anti path-traversal: il path risolto deve restare dentro ATTACH_DIR
    const fullPath = path.join(ATTACH_DIR, filename);
    if (!fullPath.startsWith(ATTACH_DIR + path.sep) || !fs.existsSync(fullPath))
      return res.status(404).json({ error: 'File non trovato' });

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.download(fullPath, downloadName);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore recupero file' });
  }
});

module.exports = router;
