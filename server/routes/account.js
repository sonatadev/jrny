'use strict';

// Diritti dell'interessato (GDPR art. 15/17/20): esportazione e cancellazione
// dell'account. Prima non esisteva alcun modo di ottenere i propri dati né di
// farsi cancellare: entrambi sono obblighi, non funzionalità opzionali.

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { pool } = require('../db/init');
const { rateLimit } = require('../utils/security');
const { clearMediaCookie } = require('../middleware/mediaAuth');

const UPLOADS_DIR = path.join(__dirname, '../uploads');

// Operazioni pesanti e irreversibili: poche all'ora bastano.
const accountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Troppe richieste, riprova fra un\'ora',
  key: req => `account:${req.user?.id || req.ip}`,
});

// Rimuove un file caricato, verificando che resti dentro uploads/
function removeUpload(storedPath) {
  if (!storedPath || typeof storedPath !== 'string') return;
  const full = path.resolve(UPLOADS_DIR, '.' + storedPath.replace(/^\/uploads/, ''));
  if (!full.startsWith(UPLOADS_DIR + path.sep)) return;
  try { fs.unlinkSync(full); } catch { /* già assente */ }
}

// GET /api/users/me/export — tutti i dati dell'utente in JSON.
// Include il contenuto dei viaggi a cui partecipa, perché è il materiale che
// ha contribuito a creare, ma NON le email degli altri partecipanti: sono
// dati personali di terzi e non rientrano nella sua portabilità.
router.get('/export', accountLimiter, async (req, res) => {
  try {
    const me = await pool.query(
      `SELECT id, name, email, first_name, last_name, phone, age, avatar_url,
              theme, mode, created_at
         FROM users WHERE id=$1`,
      [req.user.id]
    );
    if (!me.rows.length) return res.status(404).json({ error: 'Utente non trovato' });

    const trips = await pool.query(
      `SELECT t.id, t.title, t.description, t.destination, t.start_date, t.end_date,
              t.status, t.total_budget, t.trip_notes, t.created_at, tp.role AS mio_ruolo
         FROM trips t
         JOIN trip_participants tp ON tp.trip_id = t.id AND tp.user_id = $1
        ORDER BY t.created_at`,
      [req.user.id]
    );

    const viaggi = [];
    for (const trip of trips.rows) {
      const [days, wishlist, budget, packing, checklist, notes, transports, photos, attachments, participants] =
        await Promise.all([
          pool.query(
            `SELECT td.date, td.city_area, td.notes,
                    COALESCE(json_agg(json_build_object(
                      'slot', da.slot, 'nome', da.name, 'ora', da.time,
                      'durata', da.duration, 'categoria', da.category, 'note', da.notes
                    ) ORDER BY da.sort_order) FILTER (WHERE da.id IS NOT NULL), '[]') AS attivita
               FROM trip_days td
               LEFT JOIN day_activities da ON da.day_id = td.id
              WHERE td.trip_id=$1 GROUP BY td.id ORDER BY td.date`, [trip.id]),
          pool.query(
            `SELECT name, city, category, notes, maps_link, priority, lat, lon, created_at,
                    (added_by = $2) AS aggiunto_da_me
               FROM wishlist_places WHERE trip_id=$1 ORDER BY created_at`, [trip.id, req.user.id]),
          pool.query(
            `SELECT description, amount, category, paid_by_name, created_at,
                    (paid_by_user_id = $2) AS pagato_da_me
               FROM budget_entries WHERE trip_id=$1 ORDER BY created_at`, [trip.id, req.user.id]),
          pool.query('SELECT name, category, checked FROM packing_items WHERE trip_id=$1', [trip.id]),
          pool.query(
            `SELECT text, done, created_at, (created_by = $2) AS creato_da_me
               FROM checklist_items WHERE trip_id=$1 ORDER BY created_at`, [trip.id, req.user.id]),
          pool.query(
            `SELECT title, body, kind, category, scope, created_at, updated_at,
                    (created_by = $2) AS creata_da_me
               FROM note_cards WHERE trip_id=$1 ORDER BY created_at`, [trip.id, req.user.id]),
          pool.query(
            `SELECT mode, from_place, to_place, depart_date, depart_time,
                    arrive_date, arrive_time, carrier, cost, booking_ref, seat, link
               FROM transports WHERE trip_id=$1 ORDER BY depart_date`, [trip.id]),
          pool.query(
            `SELECT url, caption, created_at, (uploaded_by = $2) AS caricata_da_me
               FROM trip_photos WHERE trip_id=$1 ORDER BY created_at`, [trip.id, req.user.id]),
          pool.query(
            `SELECT name, file_path, file_size, mime_type, created_at,
                    (uploaded_by = $2) AS caricato_da_me
               FROM trip_attachments WHERE trip_id=$1 ORDER BY created_at`, [trip.id, req.user.id]),
          // Solo i nomi: le email degli altri non sono dati di questo utente
          pool.query(
            `SELECT u.name, tp.role FROM trip_participants tp
               JOIN users u ON u.id = tp.user_id WHERE tp.trip_id=$1`, [trip.id]),
        ]);

      viaggi.push({
        ...trip,
        partecipanti: participants.rows,
        giorni: days.rows,
        wishlist: wishlist.rows,
        budget: budget.rows,
        bagaglio: packing.rows,
        checklist: checklist.rows,
        note: notes.rows,
        trasporti: transports.rows,
        foto: photos.rows,
        allegati: attachments.rows,
      });
    }

    const dump = {
      esportato_il: new Date().toISOString(),
      nota: 'I file (foto, allegati, biglietti) non sono inclusi in questo JSON: scaricali dall\'app finché l\'account è attivo.',
      profilo: me.rows[0],
      viaggi,
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="jrny-dati-${req.user.id}.json"`);
    res.send(JSON.stringify(dump, null, 2));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore durante l\'esportazione' });
  }
});

// DELETE /api/users/me — cancellazione dell'account.
// Richiede la password: senza, un token rubato basterebbe a distruggere
// l'account della vittima.
router.delete('/', accountLimiter, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password richiesta per confermare' });

  try {
    const r = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Utente non trovato' });
    if (!await bcrypt.compare(password, r.rows[0].password_hash))
      return res.status(401).json({ error: 'Password errata' });

    // Viaggi in cui è l'unico admin: se restano altri partecipanti il viaggio
    // deve sopravvivere, quindi si promuove qualcun altro; se è rimasto solo
    // lui, il viaggio (e i suoi file) vanno eliminati con l'account.
    const adminTrips = await pool.query(
      `SELECT tp.trip_id FROM trip_participants tp
        WHERE tp.user_id = $1 AND tp.role = 'admin'
          AND NOT EXISTS (
            SELECT 1 FROM trip_participants o
             WHERE o.trip_id = tp.trip_id AND o.user_id <> $1 AND o.role = 'admin')`,
      [req.user.id]
    );

    const tripsToDelete = [];
    for (const { trip_id } of adminTrips.rows) {
      const heir = await pool.query(
        `SELECT user_id FROM trip_participants
          WHERE trip_id=$1 AND user_id<>$2
          ORDER BY CASE role WHEN 'editor' THEN 0 ELSE 1 END, user_id
          LIMIT 1`,
        [trip_id, req.user.id]
      );
      if (heir.rows.length) {
        await pool.query(
          "UPDATE trip_participants SET role='admin' WHERE trip_id=$1 AND user_id=$2",
          [trip_id, heir.rows[0].user_id]
        );
      } else {
        tripsToDelete.push(trip_id);
      }
    }

    // File dei viaggi che stiamo per eliminare: il DB va in cascade, il disco no.
    for (const tripId of tripsToDelete) {
      const [photos, attachments, noteImages, tickets] = await Promise.all([
        pool.query('SELECT url FROM trip_photos WHERE trip_id=$1', [tripId]),
        pool.query('SELECT file_path FROM trip_attachments WHERE trip_id=$1', [tripId]),
        pool.query('SELECT url FROM note_images WHERE trip_id=$1', [tripId]),
        pool.query('SELECT ticket_path FROM transports WHERE trip_id=$1 AND ticket_path IS NOT NULL', [tripId]),
      ]);
      photos.rows.forEach(r => removeUpload(r.url));
      attachments.rows.forEach(r => removeUpload(r.file_path));
      noteImages.rows.forEach(r => removeUpload(r.url));
      tickets.rows.forEach(r => removeUpload(r.ticket_path));
      await pool.query('DELETE FROM trips WHERE id=$1', [tripId]);
    }

    // Inviti ancora pendenti verso il suo indirizzo
    await pool.query('DELETE FROM trip_invitations WHERE invited_email=$1', [req.user.email]);
    // L'utente: partecipazioni, voti e token di reset seguono in cascade
    await pool.query('DELETE FROM users WHERE id=$1', [req.user.id]);

    clearMediaCookie(req, res);
    res.json({
      message: 'Account eliminato',
      viaggi_eliminati: tripsToDelete.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore durante la cancellazione dell\'account' });
  }
});

module.exports = router;
