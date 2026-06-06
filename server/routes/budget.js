const router = require('express').Router({ mergeParams: true });
const { pool } = require('../db/init');
const { parseNumber } = require('../utils/security');

async function checkAccess(tripId, userId, minRole = 'viewer') {
  const res = await pool.query(
    'SELECT role FROM trip_participants WHERE trip_id=$1 AND user_id=$2',
    [tripId, userId]
  );
  if (!res.rows.length) return null;
  const role = res.rows[0].role;
  if (minRole === 'editor' && role === 'viewer') return null;
  return role;
}

// GET /api/trips/:id/budget
router.get('/', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id);
  if (!role) return res.status(403).json({ error: 'Accesso negato' });

  try {
    const tripRes = await pool.query('SELECT total_budget FROM trips WHERE id=$1', [req.params.id]);
    if (!tripRes.rows.length) return res.status(404).json({ error: 'Viaggio non trovato' });

    const entries = await pool.query(`
      SELECT be.*, u.name as paid_by_user_name
      FROM budget_entries be
      LEFT JOIN users u ON u.id = be.paid_by_user_id
      WHERE be.trip_id=$1
      ORDER BY be.entry_date DESC, be.created_at DESC
    `, [req.params.id]);

    // Totale per categoria
    const byCategory = {};
    let totalSpent = 0;
    for (const e of entries.rows) {
      byCategory[e.category] = (byCategory[e.category] || 0) + parseFloat(e.amount);
      totalSpent += parseFloat(e.amount);
    }

    // Totale per partecipante
    const byParticipant = {};
    for (const e of entries.rows) {
      const key = e.paid_by_user_name || e.paid_by_name || 'Sconosciuto';
      byParticipant[key] = (byParticipant[key] || 0) + parseFloat(e.amount);
    }

    res.json({
      total_budget: parseFloat(tripRes.rows[0].total_budget),
      total_spent: totalSpent,
      remaining: parseFloat(tripRes.rows[0].total_budget) - totalSpent,
      by_category: byCategory,
      by_participant: byParticipant,
      entries: entries.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore recupero budget' });
  }
});

// PUT /api/trips/:id/budget/total  (aggiorna budget totale)
router.put('/total', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });

  const tot = parseNumber(req.body.total_budget, { field: 'Budget', min: 0, allowNull: false });
  if (tot.error) return res.status(400).json({ error: tot.error });

  try {
    await pool.query('UPDATE trips SET total_budget=$1 WHERE id=$2', [tot.value, req.params.id]);
    res.json({ total_budget: tot.value });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiornamento budget' });
  }
});

// POST /api/trips/:id/budget  (aggiunge spesa)
router.post('/', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });

  const { category, description, paid_by_user_id, paid_by_name, entry_date } = req.body;
  if (!category) return res.status(400).json({ error: 'Importo e categoria obbligatori' });
  const amt = parseNumber(req.body.amount, { field: 'Importo', min: 0, allowNull: false });
  if (amt.error) return res.status(400).json({ error: amt.error });

  try {
    const result = await pool.query(
      `INSERT INTO budget_entries (trip_id, amount, category, description, paid_by_user_id, paid_by_name, entry_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, amt.value, category, description, paid_by_user_id || null, paid_by_name || null, entry_date || new Date().toISOString().split('T')[0]]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiunta spesa' });
  }
});

// PUT /api/trips/:id/budget/:entryId
router.put('/:entryId', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });

  const { category, description, paid_by_user_id, paid_by_name, entry_date } = req.body;
  const amt = parseNumber(req.body.amount, { field: 'Importo', min: 0 });
  if (amt.error) return res.status(400).json({ error: amt.error });
  try {
    const linked = await pool.query(
      'SELECT transport_id FROM budget_entries WHERE id=$1 AND trip_id=$2',
      [req.params.entryId, req.params.id]
    );
    if (linked.rows.length && linked.rows[0].transport_id)
      return res.status(400).json({ error: 'Voce gestita dai Trasporti: modificala dalla sezione Trasporti' });

    const result = await pool.query(
      `UPDATE budget_entries SET
        amount=COALESCE($1,amount), category=COALESCE($2,category),
        description=COALESCE($3,description), paid_by_user_id=COALESCE($4,paid_by_user_id),
        paid_by_name=COALESCE($5,paid_by_name), entry_date=COALESCE($6,entry_date)
       WHERE id=$7 AND trip_id=$8 RETURNING *`,
      [amt.value, category, description, paid_by_user_id, paid_by_name, entry_date, req.params.entryId, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Spesa non trovata' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiornamento spesa' });
  }
});

// DELETE /api/trips/:id/budget/:entryId
router.delete('/:entryId', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });

  try {
    const linked = await pool.query(
      'SELECT transport_id FROM budget_entries WHERE id=$1 AND trip_id=$2',
      [req.params.entryId, req.params.id]
    );
    if (linked.rows.length && linked.rows[0].transport_id)
      return res.status(400).json({ error: 'Voce gestita dai Trasporti: eliminala dalla sezione Trasporti' });

    await pool.query('DELETE FROM budget_entries WHERE id=$1 AND trip_id=$2', [req.params.entryId, req.params.id]);
    res.json({ message: 'Spesa eliminata' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore eliminazione spesa' });
  }
});

module.exports = router;
