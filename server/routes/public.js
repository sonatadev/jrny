const router = require('express').Router();
const { pool } = require('../db/init');

router.get('/:token', async (req, res) => {
  try {
    const tripRes = await pool.query('SELECT * FROM trips WHERE share_token=$1', [req.params.token]);
    if (!tripRes.rows.length) return res.status(404).json({ error: 'Link non valido o scaduto' });
    const t = tripRes.rows[0];

    const [daysRes, wishlistRes, participantsRes] = await Promise.all([
      pool.query(`
        SELECT td.*, tc.name AS city_name, tc.color AS city_color,
          COALESCE(
            json_agg(
              json_build_object(
                'id', da.id, 'slot', da.slot, 'name', da.name,
                'time', da.time, 'duration', da.duration,
                'category', da.category, 'notes', da.notes
              ) ORDER BY da.sort_order, da.id
            ) FILTER (WHERE da.id IS NOT NULL),
            '[]'
          ) AS activities
        FROM trip_days td
        LEFT JOIN trip_cities tc ON tc.id = td.city_id
        LEFT JOIN day_activities da ON da.day_id = td.id
        WHERE td.trip_id = $1
        GROUP BY td.id, tc.name, tc.color
        ORDER BY td.date
      `, [t.id]),
      pool.query(
        'SELECT name, city, category, priority, maps_link, notes FROM wishlist_places WHERE trip_id=$1 ORDER BY priority, name',
        [t.id]
      ),
      pool.query(
        'SELECT u.name FROM trip_participants tp JOIN users u ON u.id=tp.user_id WHERE tp.trip_id=$1',
        [t.id]
      ),
    ]);

    res.json({
      trip: {
        id: t.id, title: t.title, destination: t.destination,
        start_date: t.start_date, end_date: t.end_date,
        cover_image: t.cover_image, description: t.description, status: t.status,
      },
      days: daysRes.rows,
      wishlist: wishlistRes.rows,
      participants: participantsRes.rows.map(r => r.name),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore' });
  }
});

module.exports = router;
