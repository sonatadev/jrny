const router = require('express').Router({ mergeParams: true });
const { pool } = require('../db/init');

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

// Verifica che la città appartenga al viaggio (previene IDOR)
async function cityBelongsToTrip(cityId, tripId) {
  const r = await pool.query('SELECT id FROM trip_cities WHERE id=$1 AND trip_id=$2', [cityId, tripId]);
  return r.rows.length > 0;
}

// Verifica che l'utente sia un partecipante del viaggio (previene IDOR)
async function userIsParticipant(userId, tripId) {
  const r = await pool.query('SELECT 1 FROM trip_participants WHERE trip_id=$1 AND user_id=$2', [tripId, userId]);
  return r.rows.length > 0;
}

const VALID_SCOPES = ['general', 'city', 'participant'];

// La categoria è libera (definita dall'utente): stringa ripulita ≤50 caratteri, o null.
function resolveCategory(value) {
  if (value == null) return null;
  const v = String(value).trim();
  return v ? v.slice(0, 50) : null;
}

// Normalizza lo scope e verifica i riferimenti annidati; ritorna { cityId, participantId } o un errore.
async function resolveScope(body, tripId) {
  const scope = body.scope || 'general';
  if (!VALID_SCOPES.includes(scope)) return { error: 'Scope non valido' };

  let cityId = null, participantId = null;
  if (scope === 'city') {
    cityId = body.city_id ? parseInt(body.city_id) : null;
    if (!cityId) return { error: 'Città obbligatoria per una nota di città' };
    if (!await cityBelongsToTrip(cityId, tripId)) return { error: 'Città non trovata' };
  } else if (scope === 'participant') {
    participantId = body.participant_user_id ? parseInt(body.participant_user_id) : null;
    if (!participantId) return { error: 'Partecipante obbligatorio per una nota personale' };
    if (!await userIsParticipant(participantId, tripId)) return { error: 'Partecipante non trovato' };
  }
  return { scope, cityId, participantId };
}

// GET /api/trips/:id/notes
router.get('/', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id);
  if (!role) return res.status(403).json({ error: 'Accesso negato' });
  try {
    const result = await pool.query(
      `SELECT nc.*, tc.name AS city_name, tc.color AS city_color,
              pu.name AS participant_name, au.name AS author_name
       FROM note_cards nc
       LEFT JOIN trip_cities tc ON tc.id = nc.city_id
       LEFT JOIN users pu ON pu.id = nc.participant_user_id
       LEFT JOIN users au ON au.id = nc.created_by
       WHERE nc.trip_id=$1
       ORDER BY nc.sort_order, nc.created_at`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore recupero note' });
  }
});

// GET /api/trips/:id/notes/:noteId — singola nota (per la pagina dedicata)
router.get('/:noteId', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id);
  if (!role) return res.status(403).json({ error: 'Accesso negato' });
  try {
    const result = await pool.query(
      `SELECT nc.*, tc.name AS city_name, tc.color AS city_color,
              pu.name AS participant_name, au.name AS author_name
       FROM note_cards nc
       LEFT JOIN trip_cities tc ON tc.id = nc.city_id
       LEFT JOIN users pu ON pu.id = nc.participant_user_id
       LEFT JOIN users au ON au.id = nc.created_by
       WHERE nc.id=$1 AND nc.trip_id=$2`,
      [req.params.noteId, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Nota non trovata' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore recupero nota' });
  }
});

// POST /api/trips/:id/notes
router.post('/', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });

  const { title, body, color } = req.body;
  const kind = req.body.kind === 'todo' ? 'todo' : 'note';
  // Una nota-lista può nascere col solo titolo (le voci si aggiungono dopo);
  // una nota normale richiede titolo o testo.
  if (kind !== 'todo' && !(title && title.trim()) && !(body && body.trim()))
    return res.status(400).json({ error: 'Titolo o testo obbligatorio' });
  if (kind === 'todo' && !(title && title.trim()))
    return res.status(400).json({ error: 'Titolo obbligatorio' });

  const s = await resolveScope(req.body, req.params.id);
  if (s.error) return res.status(400).json({ error: s.error });
  const category = resolveCategory(req.body.category);

  try {
    const result = await pool.query(
      `INSERT INTO note_cards (trip_id, title, body, scope, city_id, participant_user_id, color, kind, category, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.params.id, title || null, body || null, s.scope, s.cityId, s.participantId, color || '#f59e0b', kind, category, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore creazione nota' });
  }
});

// PUT /api/trips/:id/notes/:noteId
router.put('/:noteId', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });

  const { title, body, color } = req.body;
  const s = await resolveScope(req.body, req.params.id);
  if (s.error) return res.status(400).json({ error: s.error });
  const category = resolveCategory(req.body.category);

  try {
    const result = await pool.query(
      `UPDATE note_cards SET
        title=$1, body=$2, scope=$3, city_id=$4, participant_user_id=$5,
        color=COALESCE($6,color), category=$7, updated_at=NOW()
       WHERE id=$8 AND trip_id=$9 RETURNING *`,
      [title || null, body || null, s.scope, s.cityId, s.participantId, color || null, category, req.params.noteId, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Nota non trovata' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiornamento nota' });
  }
});

// DELETE /api/trips/:id/notes/:noteId
router.delete('/:noteId', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });
  try {
    const result = await pool.query(
      'DELETE FROM note_cards WHERE id=$1 AND trip_id=$2 RETURNING id',
      [req.params.noteId, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Nota non trovata' });
    res.json({ message: 'Nota eliminata' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore eliminazione nota' });
  }
});

module.exports = router;
