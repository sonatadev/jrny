'use strict';

const fs = require('fs');
const { pool } = require('../db/init');
const { rateLimit } = require('./security');

// Gli endpoint di upload non avevano né limiti di frequenza né un tetto
// complessivo: con 20 MB a file e nessun conteggio, un account qualsiasi
// poteva riempire il disco della VM, che è condivisa con le altre app.

// Quota per viaggio (default 1 GB), configurabile.
const QUOTA_BYTES = Math.max(1, parseInt(process.env.TRIP_STORAGE_QUOTA_MB || '1024', 10)) * 1024 * 1024;

// Limite per utente, non per IP: il costo è dell'account.
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 120,
  message: 'Troppi caricamenti in poco tempo, riprova più tardi',
  key: req => `upload:${req.user?.id || req.ip}`,
});

// Somma dello spazio già occupato dal viaggio: allegati, biglietti, foto e
// immagini delle note.
async function tripStorageUsed(tripId) {
  const r = await pool.query(
    `SELECT
       COALESCE((SELECT SUM(file_size) FROM trip_attachments WHERE trip_id = $1), 0) +
       COALESCE((SELECT SUM(file_size) FROM trip_photos      WHERE trip_id = $1), 0) +
       COALESCE((SELECT SUM(file_size) FROM note_images      WHERE trip_id = $1), 0) +
       COALESCE((SELECT SUM(ticket_size) FROM transports     WHERE trip_id = $1), 0) AS used`,
    [tripId]
  );
  return parseInt(r.rows[0].used, 10) || 0;
}

// Da chiamare dopo multer (che ha già scritto il file su disco) e prima
// dell'INSERT. Se la quota è superata cancella il file e risponde 413.
// Ritorna true se si può proseguire.
async function enforceQuota(tripId, file, res) {
  if (!file) return true;
  try {
    const used = await tripStorageUsed(tripId);
    if (used + file.size > QUOTA_BYTES) {
      try { fs.unlinkSync(file.path); } catch {}
      res.status(413).json({
        error: `Spazio esaurito per questo viaggio (limite ${Math.round(QUOTA_BYTES / 1024 / 1024)} MB). Elimina qualche file per liberarne.`,
      });
      return false;
    }
    return true;
  } catch (err) {
    console.error(err);
    try { fs.unlinkSync(file.path); } catch {}
    res.status(500).json({ error: 'Errore interno del server' });
    return false;
  }
}

module.exports = { uploadLimiter, enforceQuota, tripStorageUsed, QUOTA_BYTES };
