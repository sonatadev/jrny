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
      'SELECT * FROM trip_cities WHERE trip_id=$1 ORDER BY sort_order, id',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore recupero città' });
  }
});

router.post('/', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obbligatorio' });
  try {
    const countRes = await pool.query('SELECT COUNT(*) FROM trip_cities WHERE trip_id=$1', [req.params.id]);
    const sort_order = parseInt(countRes.rows[0].count);
    const result = await pool.query(
      'INSERT INTO trip_cities (trip_id, name, color, sort_order) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.id, name, color || '#c26b4a', sort_order]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore creazione città' });
  }
});

router.put('/:cityId', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });
  const { name, color, lat, lon, name_en } = req.body;
  try {
    const result = await pool.query(
      'UPDATE trip_cities SET name=COALESCE($1,name), color=COALESCE($2,color), lat=COALESCE($3,lat), lon=COALESCE($4,lon), name_en=COALESCE($5,name_en) WHERE id=$6 AND trip_id=$7 RETURNING *',
      [name ?? null, color ?? null, lat ?? null, lon ?? null, name_en ?? null, req.params.cityId, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Città non trovata' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiornamento città' });
  }
});

router.delete('/:cityId', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });
  try {
    await pool.query('DELETE FROM trip_cities WHERE id=$1 AND trip_id=$2', [req.params.cityId, req.params.id]);
    res.json({ message: 'Città eliminata' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore eliminazione città' });
  }
});

module.exports = router;
