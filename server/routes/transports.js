const router = require('express').Router({ mergeParams: true });
const { pool } = require('../db/init');
const { isSafeUrl, parseNumber, randomFileToken } = require('../utils/security');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// I biglietti vivono nella stessa cartella degli allegati: serviti con
// Content-Disposition: attachment + X-Content-Type-Options: nosniff (vedi index.js)
const TICKET_DIR = path.join(__dirname, '../uploads/attachments');
if (!fs.existsSync(TICKET_DIR)) fs.mkdirSync(TICKET_DIR, { recursive: true });

const ALLOWED_TICKET_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.heif']);

const ticketUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TICKET_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `ticket-${Date.now()}-${randomFileToken()}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_TICKET_EXT.has(ext)) return cb(new Error('Sono ammessi solo PDF o immagini'));
    cb(null, true);
  },
});

// Rimuove un file biglietto dal disco verificando che resti dentro TICKET_DIR (anti path-traversal)
function unlinkTicket(filePath) {
  if (!filePath) return;
  const fullPath = path.resolve(__dirname, '..', '.' + filePath);
  if (fullPath.startsWith(TICKET_DIR + path.sep)) {
    try { fs.unlinkSync(fullPath); } catch {}
  }
}

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

async function cityBelongsToTrip(cityId, tripId) {
  const r = await pool.query('SELECT id FROM trip_cities WHERE id=$1 AND trip_id=$2', [cityId, tripId]);
  return r.rows.length > 0;
}

async function dayBelongsToTrip(dayId, tripId) {
  const r = await pool.query('SELECT id FROM trip_days WHERE id=$1 AND trip_id=$2', [dayId, tripId]);
  return r.rows.length > 0;
}

const VALID_MODES = ['volo', 'treno', 'bus', 'auto', 'traghetto', 'metro', 'apiedi', 'altro'];
const MODE_LABEL = { volo: 'Volo', treno: 'Treno', bus: 'Bus', auto: 'Auto', traghetto: 'Traghetto', metro: 'Metro', apiedi: 'A piedi', altro: 'Trasporto' };

// Mantiene allineata la voce di budget collegata a un trasporto.
// cost>0 → crea/aggiorna la spesa (categoria 'trasporti'); cost nullo/0 → la elimina.
async function syncBudgetEntry(transportId, tripId, f) {
  const existing = await pool.query(
    'SELECT id FROM budget_entries WHERE transport_id=$1 AND trip_id=$2',
    [transportId, tripId]
  );
  const hasCost = f.cost != null && !isNaN(f.cost) && f.cost > 0;

  if (!hasCost) {
    if (existing.rows.length) {
      await pool.query('DELETE FROM budget_entries WHERE transport_id=$1 AND trip_id=$2', [transportId, tripId]);
    }
    return;
  }

  const tratta = [f.from_place, f.to_place].filter(Boolean).join(' → ') || 'spostamento';
  const description = `${MODE_LABEL[f.mode] || 'Trasporto'}: ${tratta}`;
  const entryDate = f.depart_date || new Date().toISOString().split('T')[0];

  if (existing.rows.length) {
    await pool.query(
      'UPDATE budget_entries SET amount=$1, description=$2, entry_date=$3 WHERE id=$4',
      [f.cost, description, entryDate, existing.rows[0].id]
    );
  } else {
    await pool.query(
      `INSERT INTO budget_entries (trip_id, amount, category, description, entry_date, transport_id)
       VALUES ($1,$2,'trasporti',$3,$4,$5)`,
      [tripId, f.cost, description, entryDate, transportId]
    );
  }
}

// Estrae e valida i campi dal body; verifica i riferimenti annidati (IDOR). Ritorna { fields } o { error }.
async function buildFields(body, tripId) {
  const mode = body.mode || 'treno';
  if (!VALID_MODES.includes(mode)) return { error: 'Mezzo non valido' };

  const fromCityId = body.from_city_id ? parseInt(body.from_city_id) : null;
  const toCityId = body.to_city_id ? parseInt(body.to_city_id) : null;
  const dayId = body.day_id ? parseInt(body.day_id) : null;

  if (fromCityId && !await cityBelongsToTrip(fromCityId, tripId)) return { error: 'Città di partenza non trovata' };
  if (toCityId && !await cityBelongsToTrip(toCityId, tripId)) return { error: 'Città di arrivo non trovata' };
  if (dayId && !await dayBelongsToTrip(dayId, tripId)) return { error: 'Giorno non trovato' };

  const cost = parseNumber(body.cost, { field: 'Costo', min: 0 });
  if (cost.error) return { error: cost.error };

  if (!isSafeUrl(body.link)) return { error: 'Link non valido' };

  return {
    mode,
    from_place: body.from_place || null,
    to_place: body.to_place || null,
    from_city_id: fromCityId,
    to_city_id: toCityId,
    depart_date: body.depart_date || null,
    depart_time: body.depart_time || null,
    arrive_date: body.arrive_date || null,
    arrive_time: body.arrive_time || null,
    cost: cost.value,
    carrier: body.carrier || null,
    booking_ref: body.booking_ref || null,
    seat: body.seat || null,
    link: body.link || null,
    notes: body.notes || null,
    day_id: dayId,
  };
}

// GET /api/trips/:id/transports
router.get('/', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id);
  if (!role) return res.status(403).json({ error: 'Accesso negato' });
  try {
    const result = await pool.query(
      `SELECT t.*, COALESCE(fc.name_en, fc.name) AS from_city_name, COALESCE(tcc.name_en, tcc.name) AS to_city_name
       FROM transports t
       LEFT JOIN trip_cities fc ON fc.id = t.from_city_id
       LEFT JOIN trip_cities tcc ON tcc.id = t.to_city_id
       WHERE t.trip_id=$1
       ORDER BY t.depart_date NULLS LAST, t.depart_time NULLS LAST, t.sort_order, t.created_at`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore recupero trasporti' });
  }
});

// POST /api/trips/:id/transports
router.post('/', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });

  if (!(req.body.from_place && req.body.from_place.trim()) && !(req.body.to_place && req.body.to_place.trim()))
    return res.status(400).json({ error: 'Indica almeno partenza o arrivo' });

  const f = await buildFields(req.body, req.params.id);
  if (f.error) return res.status(400).json({ error: f.error });

  try {
    const result = await pool.query(
      `INSERT INTO transports
        (trip_id, mode, from_place, to_place, from_city_id, to_city_id,
         depart_date, depart_time, arrive_date, arrive_time,
         cost, carrier, booking_ref, seat, link, notes, day_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [req.params.id, f.mode, f.from_place, f.to_place, f.from_city_id, f.to_city_id,
       f.depart_date, f.depart_time, f.arrive_date, f.arrive_time,
       f.cost, f.carrier, f.booking_ref, f.seat, f.link, f.notes, f.day_id, req.user.id]
    );
    await syncBudgetEntry(result.rows[0].id, req.params.id, f);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore creazione trasporto' });
  }
});

// PUT /api/trips/:id/transports/:transportId
router.put('/:transportId', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });

  const f = await buildFields(req.body, req.params.id);
  if (f.error) return res.status(400).json({ error: f.error });

  try {
    const result = await pool.query(
      `UPDATE transports SET
        mode=$1, from_place=$2, to_place=$3, from_city_id=$4, to_city_id=$5,
        depart_date=$6, depart_time=$7, arrive_date=$8, arrive_time=$9,
        cost=$10, carrier=$11, booking_ref=$12, seat=$13, link=$14, notes=$15, day_id=$16
       WHERE id=$17 AND trip_id=$18 RETURNING *`,
      [f.mode, f.from_place, f.to_place, f.from_city_id, f.to_city_id,
       f.depart_date, f.depart_time, f.arrive_date, f.arrive_time,
       f.cost, f.carrier, f.booking_ref, f.seat, f.link, f.notes, f.day_id,
       req.params.transportId, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Trasporto non trovato' });
    await syncBudgetEntry(req.params.transportId, req.params.id, f);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiornamento trasporto' });
  }
});

// DELETE /api/trips/:id/transports/:transportId
router.delete('/:transportId', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });
  try {
    const result = await pool.query(
      'DELETE FROM transports WHERE id=$1 AND trip_id=$2 RETURNING ticket_path',
      [req.params.transportId, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Trasporto non trovato' });
    unlinkTicket(result.rows[0].ticket_path);
    res.json({ message: 'Trasporto eliminato' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore eliminazione trasporto' });
  }
});

// POST /api/trips/:id/transports/:transportId/ticket  (carica biglietto PDF/immagine)
router.post('/:transportId/ticket', ticketUpload.single('file'), async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) {
    if (req.file) unlinkTicket(`/uploads/attachments/${req.file.filename}`);
    return res.status(403).json({ error: 'Permesso insufficiente' });
  }
  if (!req.file) return res.status(400).json({ error: 'Nessun file' });
  try {
    const existing = await pool.query(
      'SELECT ticket_path FROM transports WHERE id=$1 AND trip_id=$2',
      [req.params.transportId, req.params.id]
    );
    if (!existing.rows.length) {
      unlinkTicket(`/uploads/attachments/${req.file.filename}`);
      return res.status(404).json({ error: 'Trasporto non trovato' });
    }
    // Sostituisce il biglietto precedente, se presente
    unlinkTicket(existing.rows[0].ticket_path);

    const result = await pool.query(
      'UPDATE transports SET ticket_path=$1, ticket_name=$2 WHERE id=$3 AND trip_id=$4 RETURNING *',
      [`/uploads/attachments/${req.file.filename}`, req.file.originalname, req.params.transportId, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore caricamento biglietto' });
  }
});

// DELETE /api/trips/:id/transports/:transportId/ticket  (rimuove il biglietto)
router.delete('/:transportId/ticket', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });
  try {
    const existing = await pool.query(
      'SELECT ticket_path FROM transports WHERE id=$1 AND trip_id=$2',
      [req.params.transportId, req.params.id]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Trasporto non trovato' });
    unlinkTicket(existing.rows[0].ticket_path);
    const result = await pool.query(
      'UPDATE transports SET ticket_path=NULL, ticket_name=NULL WHERE id=$1 AND trip_id=$2 RETURNING *',
      [req.params.transportId, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore eliminazione biglietto' });
  }
});

module.exports = router;
