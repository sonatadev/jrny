const router = require('express').Router();
const { pool } = require('../db/init');
const { rateLimit } = require('../utils/security');

// Endpoint pubblico e non autenticato: senza limite sarebbe l'unico punto
// dell'app dove provare token a raffica non costa nulla.
const shareLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: 'Troppe richieste, riprova più tardi' });

router.get('/:token', shareLimiter, async (req, res) => {
  try {
    const tripRes = await pool.query(
      'SELECT * FROM trips WHERE share_token=$1 AND (share_token_expires_at IS NULL OR share_token_expires_at > NOW())',
      [req.params.token]
    );
    if (!tripRes.rows.length) return res.status(404).json({ error: 'Link non valido o scaduto' });
    const t = tripRes.rows[0];

    const [daysRes, wishlistRes, participantsRes, transportsRes] = await Promise.all([
      pool.query(`
        SELECT td.*, COALESCE(tc.name_en, tc.name) AS city_name, tc.color AS city_color,
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
        GROUP BY td.id, tc.name_en, tc.name, tc.color
        ORDER BY td.date
      `, [t.id]),
      // Le note dei luoghi possono contenere appunti personali → escluse dallo share pubblico
      pool.query(
        `SELECT wp.name, COALESCE(tc.name_en, wp.city) AS city, wp.category, wp.priority, wp.maps_link
         FROM wishlist_places wp
         LEFT JOIN trip_cities tc ON tc.trip_id = wp.trip_id AND LOWER(tc.name) = LOWER(wp.city)
         WHERE wp.trip_id=$1 ORDER BY wp.priority, wp.name`,
        [t.id]
      ),
      pool.query(
        'SELECT u.name FROM trip_participants tp JOIN users u ON u.id=tp.user_id WHERE tp.trip_id=$1',
        [t.id]
      ),
      // Solo campi non sensibili: niente costo, prenotazione, posto, link o biglietto
      pool.query(`
        SELECT tr.mode, tr.from_place, tr.to_place,
               COALESCE(fc.name_en, fc.name) AS from_city_name, COALESCE(tcc.name_en, tcc.name) AS to_city_name,
               tr.depart_date, tr.depart_time, tr.arrive_date, tr.arrive_time, tr.carrier
        FROM transports tr
        LEFT JOIN trip_cities fc ON fc.id = tr.from_city_id
        LEFT JOIN trip_cities tcc ON tcc.id = tr.to_city_id
        WHERE tr.trip_id = $1
        ORDER BY tr.depart_date NULLS LAST, tr.depart_time NULLS LAST, tr.sort_order, tr.created_at
      `, [t.id]),
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
      transports: transportsRes.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore' });
  }
});

module.exports = router;
