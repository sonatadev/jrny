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

// GET /api/trips/:id/days
router.get('/', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id);
  if (!role) return res.status(403).json({ error: 'Accesso negato' });

  try {
    const days = await pool.query(
      `SELECT td.*, tc.name as city_name, tc.color as city_color
       FROM trip_days td
       LEFT JOIN trip_cities tc ON tc.id = td.city_id
       WHERE td.trip_id=$1 ORDER BY td.date`,
      [req.params.id]
    );

    const activities = await pool.query(`
      SELECT da.*, td.date as day_date
      FROM day_activities da
      JOIN trip_days td ON td.id = da.day_id
      WHERE td.trip_id=$1
      ORDER BY da.day_id, da.slot, da.sort_order, da.time
    `, [req.params.id]);

    const actMap = {};
    for (const a of activities.rows) {
      if (!actMap[a.day_id]) actMap[a.day_id] = [];
      actMap[a.day_id].push(a);
    }

    res.json(days.rows.map(d => ({ ...d, activities: actMap[d.id] || [] })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore recupero giorni' });
  }
});

// PUT /api/trips/:id/days/:dayId  (aggiorna city_area, notes)
router.put('/:dayId', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });

  const { city_area, notes } = req.body;
  const cityId = Object.prototype.hasOwnProperty.call(req.body, 'city_id')
    ? (req.body.city_id ? parseInt(req.body.city_id) : null)
    : undefined;

  try {
    let query, params;
    if (cityId !== undefined) {
      query = 'UPDATE trip_days SET city_area=COALESCE($1,city_area), notes=COALESCE($2,notes), city_id=$3 WHERE id=$4 AND trip_id=$5 RETURNING *';
      params = [city_area, notes, cityId, req.params.dayId, req.params.id];
    } else {
      query = 'UPDATE trip_days SET city_area=COALESCE($1,city_area), notes=COALESCE($2,notes) WHERE id=$3 AND trip_id=$4 RETURNING *';
      params = [city_area, notes, req.params.dayId, req.params.id];
    }
    const result = await pool.query(query, params);
    if (!result.rows.length) return res.status(404).json({ error: 'Giorno non trovato' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiornamento giorno' });
  }
});

// POST /api/trips/:id/days/:dayId/slots  (aggiunge attività a uno slot)
router.post('/:dayId/slots', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });

  const { slot, name, time, duration, category, notes, wishlist_place_id } = req.body;
  if (!slot || !name) return res.status(400).json({ error: 'Slot e nome obbligatori' });

  const validSlots = ['mattina', 'pomeriggio', 'sera', 'notte'];
  if (!validSlots.includes(slot)) return res.status(400).json({ error: 'Slot non valido' });

  try {
    // Verifica che il giorno appartenga al viaggio
    const dayCheck = await pool.query(
      'SELECT id FROM trip_days WHERE id=$1 AND trip_id=$2',
      [req.params.dayId, req.params.id]
    );
    if (!dayCheck.rows.length) return res.status(404).json({ error: 'Giorno non trovato' });

    const result = await pool.query(
      `INSERT INTO day_activities (day_id, slot, name, time, duration, category, notes, wishlist_place_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.dayId, slot, name, time || null, duration || null, category || 'altro', notes, wishlist_place_id || null]
    );

    // Se viene da wishlist, marca come slottato
    if (wishlist_place_id) {
      await pool.query(
        'UPDATE wishlist_places SET is_slotted=true, day_id=$1, slot=$2 WHERE id=$3',
        [req.params.dayId, slot, wishlist_place_id]
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiunta attività' });
  }
});

// PATCH /api/trips/:id/days/:dayId/activities/reorder
router.patch('/:dayId/activities/reorder', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });

  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order deve essere un array' });

  try {
    for (const { id, sort_order } of order) {
      await pool.query(
        'UPDATE day_activities SET sort_order=$1 WHERE id=$2 AND day_id=$3',
        [sort_order, id, req.params.dayId]
      );
    }
    res.json({ message: 'Ordine aggiornato' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiornamento ordine' });
  }
});

// PATCH /api/trips/:id/days/:dayId/activities/:actId/complete
router.patch('/:dayId/activities/:actId/complete', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id);
  if (!role) return res.status(403).json({ error: 'Accesso negato' });
  try {
    const result = await pool.query(
      'UPDATE day_activities SET completed=$1 WHERE id=$2 AND day_id=$3 RETURNING *',
      [!!req.body.completed, req.params.actId, req.params.dayId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Attività non trovata' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiornamento' });
  }
});

// PUT /api/trips/:id/days/:dayId/activities/:actId
router.put('/:dayId/activities/:actId', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });

  const { slot, name, time, duration, category, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE day_activities SET
        slot=COALESCE($1,slot), name=COALESCE($2,name), time=COALESCE($3,time),
        duration=COALESCE($4,duration), category=COALESCE($5,category), notes=COALESCE($6,notes)
       WHERE id=$7 AND day_id=$8 RETURNING *`,
      [slot, name, time, duration, category, notes, req.params.actId, req.params.dayId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Attività non trovata' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiornamento attività' });
  }
});

// DELETE /api/trips/:id/days/:dayId/activities/:actId
router.delete('/:dayId/activities/:actId', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });

  try {
    // Se l'attività era da wishlist, de-slotta il posto
    const act = await pool.query('SELECT wishlist_place_id FROM day_activities WHERE id=$1', [req.params.actId]);
    if (act.rows.length && act.rows[0].wishlist_place_id) {
      await pool.query(
        'UPDATE wishlist_places SET is_slotted=false, day_id=NULL, slot=NULL WHERE id=$1',
        [act.rows[0].wishlist_place_id]
      );
    }
    await pool.query('DELETE FROM day_activities WHERE id=$1 AND day_id=$2', [req.params.actId, req.params.dayId]);
    res.json({ message: 'Attività eliminata' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore eliminazione attività' });
  }
});

module.exports = router;
