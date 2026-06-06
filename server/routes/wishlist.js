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
  return role;
}

// GET /api/trips/:id/wishlist
router.get('/', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id);
  if (!role) return res.status(403).json({ error: 'Accesso negato' });

  const { category, city } = req.query;
  try {
    let q = `
      SELECT w.*, u.name as added_by_name, td.date as slotted_date,
        (SELECT COUNT(*) FROM wishlist_votes WHERE place_id=w.id) AS vote_count,
        EXISTS(SELECT 1 FROM wishlist_votes WHERE place_id=w.id AND user_id=$2) AS my_vote
      FROM wishlist_places w
      LEFT JOIN users u ON u.id = w.added_by
      LEFT JOIN trip_days td ON td.id = w.day_id
      WHERE w.trip_id=$1
    `;
    const params = [req.params.id, req.user.id];
    if (category) { params.push(category); q += ` AND w.category=$${params.length}`; }
    if (city) { params.push(`%${city}%`); q += ` AND w.city ILIKE $${params.length}`; }
    q += ' ORDER BY w.priority, w.created_at';

    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore recupero wishlist' });
  }
});

// POST /api/trips/:id/wishlist
router.post('/', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });

  const { name, city, category, notes, maps_link, priority } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obbligatorio' });

  try {
    const result = await pool.query(
      `INSERT INTO wishlist_places (trip_id, name, city, category, notes, maps_link, priority, added_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.id, name, city, category || 'altro', notes, maps_link, priority || 2, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiunta posto' });
  }
});

// POST /api/trips/:id/wishlist/import
router.post('/import', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });

  const { maps_url } = req.body;
  if (!maps_url) return res.status(400).json({ error: 'URL obbligatorio' });

  const { scrapeGoogleMaps } = require('../utils/scrapeGoogleMaps');
  const tripId = req.params.id;

  let placeData;
  try {
    placeData = await scrapeGoogleMaps(maps_url.trim());
  } catch (err) {
    const msg = err.message || 'Errore durante il recupero dei dati';
    return res.status(422).json({ error: msg });
  }

  console.log('[Maps Import] Extracted:', JSON.stringify(placeData));

  try {
    // Ensure city exists in trip_cities if we got one
    if (placeData.city) {
      const cityExists = await pool.query(
        'SELECT id FROM trip_cities WHERE trip_id=$1 AND LOWER(name)=LOWER($2)',
        [tripId, placeData.city]
      );
      if (!cityExists.rows.length) {
        const countRes = await pool.query('SELECT COUNT(*) FROM trip_cities WHERE trip_id=$1', [tripId]);
        const sort_order = parseInt(countRes.rows[0].count);
        await pool.query(
          'INSERT INTO trip_cities (trip_id, name, color, sort_order) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
          [tripId, placeData.city, '#c26b4a', sort_order]
        );
        console.log('[Maps Import] Created city:', placeData.city);
      }
    }

    // Idempotent upsert: if same name exists in this trip, update metadata
    const existing = await pool.query(
      'SELECT * FROM wishlist_places WHERE trip_id=$1 AND LOWER(name)=LOWER($2)',
      [tripId, placeData.name]
    );

    const photosArr = placeData.photos?.length > 0 ? placeData.photos : null;

    let place;
    if (existing.rows.length > 0) {
      const r = await pool.query(
        `UPDATE wishlist_places SET
           city=COALESCE($1, city),
           notes=COALESCE($2, notes),
           maps_link=$3,
           photo_url=COALESCE($4, photo_url),
           photos=COALESCE($5, photos)
         WHERE id=$6 RETURNING *`,
        [placeData.city, placeData.notes, placeData.maps_link,
         placeData.photo_url, photosArr, existing.rows[0].id]
      );
      place = { ...r.rows[0], _already_existed: true };
    } else {
      const r = await pool.query(
        `INSERT INTO wishlist_places
           (trip_id, name, city, category, notes, maps_link, photo_url, photos, priority, added_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [tripId, placeData.name, placeData.city, placeData.category,
         placeData.notes, placeData.maps_link, placeData.photo_url, photosArr, 2, req.user.id]
      );
      place = r.rows[0];
    }

    res.status(201).json(place);
  } catch (err) {
    console.error('[Maps Import] DB error:', err);
    res.status(500).json({ error: 'Errore durante il salvataggio' });
  }
});

// PUT /api/trips/:id/wishlist/:placeId
router.put('/:placeId', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });

  const { name, city, category, notes, maps_link, priority, day_id, slot, is_slotted } = req.body;

  try {
    // Verifica che il posto appartenga al viaggio
    const check = await pool.query(
      'SELECT id FROM wishlist_places WHERE id=$1 AND trip_id=$2',
      [req.params.placeId, req.params.id]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'Posto non trovato' });

    // Se stiamo slottando, verifica che il giorno esista
    if (day_id !== undefined && day_id !== null) {
      const dayCheck = await pool.query(
        'SELECT id FROM trip_days WHERE id=$1 AND trip_id=$2',
        [day_id, req.params.id]
      );
      if (!dayCheck.rows.length) return res.status(400).json({ error: 'Giorno non valido' });
    }

    const result = await pool.query(
      `UPDATE wishlist_places SET
        name=COALESCE($1,name), city=COALESCE($2,city), category=COALESCE($3,category),
        notes=COALESCE($4,notes), maps_link=COALESCE($5,maps_link), priority=COALESCE($6,priority),
        day_id=$7, slot=$8,
        is_slotted=COALESCE($9,is_slotted)
       WHERE id=$10 RETURNING *`,
      [name, city, category, notes, maps_link, priority,
       day_id !== undefined ? day_id : null,
       slot !== undefined ? slot : null,
       is_slotted,
       req.params.placeId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiornamento posto' });
  }
});

// DELETE /api/trips/:id/wishlist/:placeId
router.delete('/:placeId', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id, 'editor');
  if (!role) return res.status(403).json({ error: 'Permesso insufficiente' });

  try {
    await pool.query(
      'DELETE FROM wishlist_places WHERE id=$1 AND trip_id=$2',
      [req.params.placeId, req.params.id]
    );
    res.json({ message: 'Posto rimosso dalla wishlist' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore rimozione posto' });
  }
});

// POST /api/trips/:id/wishlist/:placeId/vote  (toggle)
router.post('/:placeId/vote', async (req, res) => {
  const role = await checkAccess(req.params.id, req.user.id);
  if (!role) return res.status(403).json({ error: 'Accesso negato' });
  try {
    // Verifica che il posto appartenga a questo viaggio (evita IDOR su placeId di altri viaggi)
    const placeCheck = await pool.query(
      'SELECT id FROM wishlist_places WHERE id=$1 AND trip_id=$2',
      [req.params.placeId, req.params.id]
    );
    if (!placeCheck.rows.length) return res.status(404).json({ error: 'Posto non trovato' });

    const existing = await pool.query(
      'SELECT 1 FROM wishlist_votes WHERE place_id=$1 AND user_id=$2',
      [req.params.placeId, req.user.id]
    );
    if (existing.rows.length) {
      await pool.query('DELETE FROM wishlist_votes WHERE place_id=$1 AND user_id=$2', [req.params.placeId, req.user.id]);
    } else {
      await pool.query('INSERT INTO wishlist_votes (place_id, user_id) VALUES ($1,$2)', [req.params.placeId, req.user.id]);
    }
    const count = await pool.query('SELECT COUNT(*) FROM wishlist_votes WHERE place_id=$1', [req.params.placeId]);
    res.json({ voted: !existing.rows.length, vote_count: parseInt(count.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore voto' });
  }
});

module.exports = router;
