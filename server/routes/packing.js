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

router.get('/', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id);
  if (!role) return res.status(403).json({ error: 'Accesso negato' });
  try {
    const result = await pool.query(
      'SELECT * FROM packing_items WHERE trip_id=$1 ORDER BY category, id',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore recupero packing list' });
  }
});

router.post('/', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });
  const { name, category, assigned_to_name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obbligatorio' });
  try {
    const result = await pool.query(
      'INSERT INTO packing_items (trip_id, name, category, assigned_to_name) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.id, name, category || 'altro', assigned_to_name || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiunta elemento' });
  }
});

router.put('/:itemId', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });
  const { name, category, checked, assigned_to_name } = req.body;
  try {
    const result = await pool.query(
      `UPDATE packing_items SET
        name=COALESCE($1,name), category=COALESCE($2,category),
        checked=COALESCE($3,checked), assigned_to_name=COALESCE($4,assigned_to_name)
       WHERE id=$5 AND trip_id=$6 RETURNING *`,
      [name, category, checked, assigned_to_name, req.params.itemId, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Elemento non trovato' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiornamento elemento' });
  }
});

router.delete('/:itemId', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });
  try {
    await pool.query('DELETE FROM packing_items WHERE id=$1 AND trip_id=$2', [req.params.itemId, req.params.id]);
    res.json({ message: 'Elemento eliminato' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore eliminazione elemento' });
  }
});

module.exports = router;
