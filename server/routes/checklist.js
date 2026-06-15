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

// Verifica che l'utente sia un partecipante del viaggio (previene IDOR sull'assegnatario)
async function userIsParticipant(userId, tripId) {
  const r = await pool.query('SELECT 1 FROM trip_participants WHERE trip_id=$1 AND user_id=$2', [tripId, userId]);
  return r.rows.length > 0;
}

// Verifica che la nota-lista appartenga al viaggio e sia di tipo 'todo' (previene IDOR)
async function todoNoteBelongsToTrip(noteId, tripId) {
  const r = await pool.query(`SELECT id FROM note_cards WHERE id=$1 AND trip_id=$2 AND kind='todo'`, [noteId, tripId]);
  return r.rows.length > 0;
}

// Normalizza/valida l'assegnatario: null oppure un partecipante del viaggio.
async function resolveAssignee(value, tripId) {
  if (value === undefined || value === null || value === '') return { assignedTo: null };
  const id = parseInt(value);
  if (!Number.isInteger(id)) return { error: 'Assegnatario non valido' };
  if (!await userIsParticipant(id, tripId)) return { error: 'Assegnatario non trovato' };
  return { assignedTo: id };
}

// GET /api/trips/:id/checklist — tutte le voci del viaggio (board + liste)
router.get('/', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id);
  if (!role) return res.status(403).json({ error: 'Accesso negato' });
  try {
    const result = await pool.query(
      `SELECT ci.*, au.name AS assignee_name
       FROM checklist_items ci
       LEFT JOIN users au ON au.id = ci.assigned_to
       WHERE ci.trip_id=$1
       ORDER BY ci.note_id NULLS FIRST, ci.sort_order, ci.created_at`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore recupero checklist' });
  }
});

// POST /api/trips/:id/checklist — nuova voce { text, note_id?, assigned_to? }
router.post('/', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });

  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Testo obbligatorio' });
  if (text.length > 500) return res.status(400).json({ error: 'Testo troppo lungo (max 500)' });

  let noteId = null;
  if (req.body.note_id) {
    noteId = parseInt(req.body.note_id);
    if (!Number.isInteger(noteId) || !await todoNoteBelongsToTrip(noteId, req.params.id))
      return res.status(400).json({ error: 'Lista non trovata' });
  }

  const a = await resolveAssignee(req.body.assigned_to, req.params.id);
  if (a.error) return res.status(400).json({ error: a.error });

  try {
    const result = await pool.query(
      `INSERT INTO checklist_items (trip_id, note_id, text, assigned_to, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, noteId, text, a.assignedTo, req.user.id]
    );
    // Restituisce anche il nome dell'assegnatario per coerenza con la GET
    const row = result.rows[0];
    if (row.assigned_to) {
      const u = await pool.query('SELECT name FROM users WHERE id=$1', [row.assigned_to]);
      row.assignee_name = u.rows[0]?.name || null;
    } else {
      row.assignee_name = null;
    }
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore creazione voce' });
  }
});

// PUT /api/trips/:id/checklist/:itemId — { text?, done?, assigned_to?, sort_order? }
router.put('/:itemId', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });

  const existing = await pool.query('SELECT * FROM checklist_items WHERE id=$1 AND trip_id=$2', [req.params.itemId, req.params.id]);
  if (!existing.rows.length) return res.status(404).json({ error: 'Voce non trovata' });
  const cur = existing.rows[0];

  let text = cur.text;
  if (req.body.text !== undefined) {
    text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Testo obbligatorio' });
    if (text.length > 500) return res.status(400).json({ error: 'Testo troppo lungo (max 500)' });
  }

  const done = req.body.done !== undefined ? !!req.body.done : cur.done;
  const sortOrder = req.body.sort_order !== undefined ? parseInt(req.body.sort_order) || 0 : cur.sort_order;

  let assignedTo = cur.assigned_to;
  if (req.body.assigned_to !== undefined) {
    const a = await resolveAssignee(req.body.assigned_to, req.params.id);
    if (a.error) return res.status(400).json({ error: a.error });
    assignedTo = a.assignedTo;
  }

  try {
    const result = await pool.query(
      `UPDATE checklist_items SET text=$1, done=$2, assigned_to=$3, sort_order=$4, updated_at=NOW()
       WHERE id=$5 AND trip_id=$6 RETURNING *`,
      [text, done, assignedTo, sortOrder, req.params.itemId, req.params.id]
    );
    const row = result.rows[0];
    if (row.assigned_to) {
      const u = await pool.query('SELECT name FROM users WHERE id=$1', [row.assigned_to]);
      row.assignee_name = u.rows[0]?.name || null;
    } else {
      row.assignee_name = null;
    }
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiornamento voce' });
  }
});

// DELETE /api/trips/:id/checklist/:itemId
router.delete('/:itemId', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });
  try {
    const result = await pool.query(
      'DELETE FROM checklist_items WHERE id=$1 AND trip_id=$2 RETURNING id',
      [req.params.itemId, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Voce non trovata' });
    res.json({ message: 'Voce eliminata' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore eliminazione voce' });
  }
});

module.exports = router;
