const router = require('express').Router();
const { pool } = require('../db/init');
const crypto = require('crypto');
const { sendInviteEmail } = require('../utils/email');
const { isValidRole, isValidEmail, rateLimit } = require('../utils/security');

const joinLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Troppi tentativi, riprova più tardi' });

// Durata dei link generati
const INVITE_LINK_DAYS = 7;
const SHARE_LINK_DAYS = 90;
const INVITATION_DAYS = 14;

// Join via invite link (must be before /:id routes)
// Rate limit per IP: il token è di 24 byte, ma un endpoint di ricerca token
// senza limiti resta un invito a tentare.
router.post('/join/:token', joinLimiter, async (req, res) => {
  try {
    const tripRes = await pool.query(
      'SELECT id, title FROM trips WHERE invite_token=$1 AND (invite_token_expires_at IS NULL OR invite_token_expires_at > NOW())',
      [req.params.token]
    );
    if (!tripRes.rows.length) return res.status(404).json({ error: 'Link non valido o scaduto' });
    const { id: tripId, title } = tripRes.rows[0];
    await pool.query(
      'INSERT INTO trip_participants (trip_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [tripId, req.user.id, 'editor']
    );
    res.json({ tripId, title });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore durante il join' });
  }
});

// POST /api/trips/invitations/claim/:token — riscatta un invito ricevuto via email.
// Il possesso del token È la prova di accesso alla casella: non serve che
// l'email dell'account corrisponda a quella invitata (ci si può registrare
// con un altro indirizzo e riscattare comunque il proprio invito).
router.post('/invitations/claim/:token', joinLimiter, async (req, res) => {
  try {
    const inv = await pool.query(
      `SELECT ti.id, ti.trip_id, ti.role, t.title
         FROM trip_invitations ti JOIN trips t ON t.id = ti.trip_id
        WHERE ti.token = $1 AND (ti.expires_at IS NULL OR ti.expires_at > NOW())`,
      [req.params.token]
    );
    if (!inv.rows.length) return res.status(404).json({ error: 'Invito non valido o scaduto' });
    const { id, trip_id, role, title } = inv.rows[0];

    await pool.query(
      'INSERT INTO trip_participants (trip_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [trip_id, req.user.id, role || 'editor']
    );
    // Consumato: il token non è riutilizzabile
    await pool.query('DELETE FROM trip_invitations WHERE id=$1', [id]);

    res.json({ tripId: trip_id, title });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore durante l\'accettazione dell\'invito' });
  }
});

// Ottieni tutti i viaggi dell'utente (come admin o partecipante)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT t.*, u.name as creator_name,
        (SELECT COUNT(*) FROM trip_participants WHERE trip_id = t.id) as participant_count
      FROM trips t
      LEFT JOIN users u ON u.id = t.created_by
      LEFT JOIN trip_participants tp ON tp.trip_id = t.id AND tp.user_id = $1
      WHERE t.created_by = $1 OR tp.user_id = $1
      ORDER BY t.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nel recupero viaggi' });
  }
});

// Crea nuovo viaggio
router.post('/', async (req, res) => {
  const { title, description, destination, start_date, end_date, cover_image, status, total_budget, invited_emails } = req.body;
  if (!title || !destination || !start_date || !end_date)
    return res.status(400).json({ error: 'Titolo, destinazione e date obbligatori' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const trip = await client.query(
      `INSERT INTO trips (title, description, destination, start_date, end_date, cover_image, status, total_budget, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [title, description, destination, start_date, end_date, cover_image, status || 'pianificazione', total_budget || 0, req.user.id]
    );
    const tripId = trip.rows[0].id;

    // Aggiungi creatore come admin
    await client.query(
      'INSERT INTO trip_participants (trip_id, user_id, role) VALUES ($1,$2,$3)',
      [tripId, req.user.id, 'admin']
    );

    // Genera giorni automaticamente
    const start = new Date(start_date);
    const end = new Date(end_date);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      await client.query(
        'INSERT INTO trip_days (trip_id, date) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [tripId, dateStr]
      );
    }

    // Gestisci inviti email
    const pendingEmails = [];
    if (invited_emails && Array.isArray(invited_emails)) {
      for (const email of invited_emails) {
        if (!isValidEmail(email)) continue;
        const userRes = await client.query('SELECT id FROM users WHERE email=$1', [email]);
        if (userRes.rows.length) {
          await client.query(
            'INSERT INTO trip_participants (trip_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
            [tripId, userRes.rows[0].id, 'editor']
          );
        } else {
          // Token recapitato solo via email: è l'unica prova di possesso
          // della casella, ora che la registrazione non accetta più da sola.
          const inviteToken = crypto.randomBytes(24).toString('hex');
          await client.query(
            `INSERT INTO trip_invitations (trip_id, invited_email, role, token, expires_at)
             VALUES ($1,$2,$3,$4, NOW() + ($5 || ' days')::interval)
             ON CONFLICT (trip_id, invited_email)
             DO UPDATE SET token=$4, expires_at=NOW() + ($5 || ' days')::interval`,
            [tripId, email, 'editor', inviteToken, String(INVITATION_DAYS)]
          );
          pendingEmails.push({ email, inviteToken });
        }
      }
    }

    await client.query('COMMIT');

    // Fuori dalla transazione: un errore SMTP non deve annullare il viaggio
    const appUrl = process.env.APP_URL || 'http://localhost:8090';
    for (const { email, inviteToken } of pendingEmails) {
      sendInviteEmail({
        to: email, inviterName: req.user.name, tripTitle: title, appUrl,
        claimUrl: `${appUrl}/invito/${inviteToken}`, isNewUser: true,
      }).catch(err => console.error('[email] errore invio:', err.message));
    }
    res.status(201).json(trip.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Errore nella creazione del viaggio' });
  } finally {
    client.release();
  }
});

// Ottieni singolo viaggio
router.get('/:id', async (req, res) => {
  try {
    const trip = await pool.query(`
      SELECT t.*, u.name as creator_name,
        tp.role as my_role
      FROM trips t
      LEFT JOIN users u ON u.id = t.created_by
      LEFT JOIN trip_participants tp ON tp.trip_id = t.id AND tp.user_id = $2
      WHERE t.id = $1
    `, [req.params.id, req.user.id]);

    if (!trip.rows.length) return res.status(404).json({ error: 'Viaggio non trovato' });
    if (!trip.rows[0].my_role) return res.status(403).json({ error: 'Accesso negato' });

    const participants = await pool.query(`
      SELECT tp.role, u.id, u.name, u.email
      FROM trip_participants tp
      JOIN users u ON u.id = tp.user_id
      WHERE tp.trip_id = $1
    `, [req.params.id]);

    const invitations = await pool.query(
      'SELECT invited_email, role FROM trip_invitations WHERE trip_id=$1',
      [req.params.id]
    );

    res.json({ ...trip.rows[0], participants: participants.rows, pending_invitations: invitations.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nel recupero viaggio' });
  }
});

// Aggiorna viaggio
router.put('/:id', async (req, res) => {
  try {
    const perm = await pool.query(
      'SELECT role FROM trip_participants WHERE trip_id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!perm.rows.length || perm.rows[0].role === 'viewer')
      return res.status(403).json({ error: 'Permesso insufficiente' });

    const { title, description, destination, start_date, end_date, cover_image, status, total_budget } = req.body;
    const result = await pool.query(
      `UPDATE trips SET
        title=COALESCE($1,title), description=COALESCE($2,description),
        destination=COALESCE($3,destination), start_date=COALESCE($4,start_date),
        end_date=COALESCE($5,end_date), cover_image=COALESCE($6,cover_image),
        status=COALESCE($7,status), total_budget=COALESCE($8,total_budget)
       WHERE id=$9 RETURNING *`,
      [title, description, destination, start_date, end_date, cover_image, status, total_budget, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiornamento viaggio' });
  }
});

// Elimina viaggio
router.delete('/:id', async (req, res) => {
  try {
    const perm = await pool.query(
      'SELECT role FROM trip_participants WHERE trip_id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!perm.rows.length || perm.rows[0].role !== 'admin')
      return res.status(403).json({ error: 'Solo l\'admin può eliminare il viaggio' });

    await pool.query('DELETE FROM trips WHERE id=$1', [req.params.id]);
    res.json({ message: 'Viaggio eliminato' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore eliminazione viaggio' });
  }
});

// Invita partecipante
router.post('/:id/invite', async (req, res) => {
  const { email } = req.body;
  const role = req.body.role || 'editor';
  if (!email) return res.status(400).json({ error: 'Email obbligatoria' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Email non valida' });
  if (!isValidRole(role)) return res.status(400).json({ error: 'Ruolo non valido' });

  try {
    const perm = await pool.query(
      'SELECT role FROM trip_participants WHERE trip_id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!perm.rows.length || perm.rows[0].role === 'viewer')
      return res.status(403).json({ error: 'Permesso insufficiente' });
    // Solo un admin può assegnare il ruolo admin (evita escalation da parte di un editor)
    if (role === 'admin' && perm.rows[0].role !== 'admin')
      return res.status(403).json({ error: 'Solo un admin può assegnare il ruolo admin' });

    const tripRes = await pool.query('SELECT title FROM trips WHERE id=$1', [req.params.id]);
    const tripTitle = tripRes.rows[0]?.title || 'il viaggio';
    const appUrl = process.env.APP_URL || 'http://localhost:8090';

    const userRes = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (userRes.rows.length) {
      await pool.query(
        'INSERT INTO trip_participants (trip_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (trip_id, user_id) DO UPDATE SET role=$3',
        [req.params.id, userRes.rows[0].id, role || 'editor']
      );
      sendInviteEmail({ to: email, inviterName: req.user.name, tripTitle, appUrl, isNewUser: false })
        .catch(err => console.error('[email] errore invio:', err.message));
    } else {
      // Ripulisce gli inviti scaduti di questo viaggio: non devono restare
      // indirizzi di terzi in archivio a tempo indeterminato.
      await pool.query(
        'DELETE FROM trip_invitations WHERE trip_id=$1 AND expires_at IS NOT NULL AND expires_at < NOW()',
        [req.params.id]
      );

      const inviteToken = crypto.randomBytes(24).toString('hex');
      await pool.query(
        `INSERT INTO trip_invitations (trip_id, invited_email, role, token, expires_at)
         VALUES ($1,$2,$3,$4, NOW() + ($5 || ' days')::interval)
         ON CONFLICT (trip_id, invited_email)
         DO UPDATE SET role=$3, token=$4, expires_at=NOW() + ($5 || ' days')::interval`,
        [req.params.id, email, role || 'editor', inviteToken, String(INVITATION_DAYS)]
      );
      sendInviteEmail({
        to: email, inviterName: req.user.name, tripTitle, appUrl,
        claimUrl: `${appUrl}/invito/${inviteToken}`, isNewUser: true,
      }).catch(err => console.error('[email] errore invio:', err.message));
    }

    res.json({ message: 'Invito inviato' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore invito' });
  }
});

// Aggiorna ruolo partecipante
router.put('/:id/participants/:userId', async (req, res) => {
  const { role } = req.body;
  if (!isValidRole(role)) return res.status(400).json({ error: 'Ruolo non valido' });
  try {
    const perm = await pool.query(
      'SELECT role FROM trip_participants WHERE trip_id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!perm.rows.length || perm.rows[0].role !== 'admin')
      return res.status(403).json({ error: 'Solo l\'admin può cambiare ruoli' });

    // Impedisci di rimuovere l'ultimo admin del viaggio (lascerebbe il viaggio senza admin)
    if (role !== 'admin') {
      const target = await pool.query(
        'SELECT role FROM trip_participants WHERE trip_id=$1 AND user_id=$2',
        [req.params.id, req.params.userId]
      );
      if (target.rows.length && target.rows[0].role === 'admin') {
        const admins = await pool.query(
          "SELECT COUNT(*) FROM trip_participants WHERE trip_id=$1 AND role='admin'",
          [req.params.id]
        );
        if (parseInt(admins.rows[0].count) <= 1)
          return res.status(400).json({ error: 'Non puoi rimuovere l\'ultimo admin del viaggio' });
      }
    }

    await pool.query(
      'UPDATE trip_participants SET role=$1 WHERE trip_id=$2 AND user_id=$3',
      [role, req.params.id, req.params.userId]
    );
    res.json({ message: 'Ruolo aggiornato' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiornamento ruolo' });
  }
});

// DELETE /:id/participants/:userId — rimuovi partecipante non-admin
router.delete('/:id/participants/:userId', async (req, res) => {
  try {
    const perm = await pool.query(
      'SELECT role FROM trip_participants WHERE trip_id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!perm.rows.length || perm.rows[0].role !== 'admin')
      return res.status(403).json({ error: "Solo l'admin può rimuovere partecipanti" });

    const target = await pool.query(
      'SELECT role FROM trip_participants WHERE trip_id=$1 AND user_id=$2',
      [req.params.id, req.params.userId]
    );
    if (!target.rows.length) return res.status(404).json({ error: 'Partecipante non trovato' });
    if (target.rows[0].role === 'admin') return res.status(400).json({ error: 'Non puoi rimuovere un admin' });

    await pool.query(
      'DELETE FROM trip_participants WHERE trip_id=$1 AND user_id=$2',
      [req.params.id, req.params.userId]
    );
    res.json({ message: 'Partecipante rimosso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore rimozione partecipante' });
  }
});

// DELETE /:id/invitations/:invitedEmail — cancella invito pendente
router.delete('/:id/invitations/:invitedEmail', async (req, res) => {
  try {
    const perm = await pool.query(
      'SELECT role FROM trip_participants WHERE trip_id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!perm.rows.length || perm.rows[0].role === 'viewer')
      return res.status(403).json({ error: 'Permesso insufficiente' });

    await pool.query(
      'DELETE FROM trip_invitations WHERE trip_id=$1 AND invited_email=$2',
      [req.params.id, decodeURIComponent(req.params.invitedEmail)]
    );
    res.json({ message: 'Invito cancellato' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore cancellazione invito' });
  }
});

// Version endpoint for real-time polling
router.get('/:id/version', async (req, res) => {
  try {
    const perm = await pool.query(
      'SELECT role FROM trip_participants WHERE trip_id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!perm.rows.length) return res.status(403).json({ error: 'Accesso negato' });

    const result = await pool.query(`
      SELECT GREATEST(
        (SELECT MAX(created_at) FROM day_activities da JOIN trip_days td ON td.id=da.day_id WHERE td.trip_id=$1),
        (SELECT MAX(created_at) FROM wishlist_places WHERE trip_id=$1),
        (SELECT MAX(created_at) FROM budget_entries WHERE trip_id=$1),
        (SELECT MAX(created_at) FROM packing_items WHERE trip_id=$1),
        (SELECT MAX(created_at) FROM trip_attachments WHERE trip_id=$1),
        (SELECT MAX(created_at) FROM trip_photos WHERE trip_id=$1),
        (SELECT GREATEST(MAX(created_at), MAX(updated_at)) FROM note_cards WHERE trip_id=$1),
        (SELECT GREATEST(MAX(created_at), MAX(updated_at)) FROM checklist_items WHERE trip_id=$1),
        (SELECT MAX(created_at) FROM transports WHERE trip_id=$1),
        (SELECT created_at FROM trips WHERE id=$1)
      ) AS v
    `, [req.params.id]);
    res.json({ version: result.rows[0]?.v?.getTime?.() || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore' });
  }
});

// Generate invite link
router.post('/:id/invite-link', async (req, res) => {
  try {
    const perm = await pool.query(
      'SELECT role FROM trip_participants WHERE trip_id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!perm.rows.length || perm.rows[0].role === 'viewer')
      return res.status(403).json({ error: 'Permesso insufficiente' });

    const token = crypto.randomBytes(24).toString('hex');
    const upd = await pool.query(
      `UPDATE trips SET invite_token=$1, invite_token_expires_at = NOW() + ($3 || ' days')::interval
       WHERE id=$2 RETURNING invite_token_expires_at`,
      [token, req.params.id, String(INVITE_LINK_DAYS)]
    );
    const appUrl = process.env.APP_URL || 'http://localhost:8090';
    res.json({ link: `${appUrl}/join/${token}`, expires_at: upd.rows[0].invite_token_expires_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore generazione link' });
  }
});

// Revoke invite link
router.delete('/:id/invite-link', async (req, res) => {
  try {
    const perm = await pool.query(
      'SELECT role FROM trip_participants WHERE trip_id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!perm.rows.length || perm.rows[0].role === 'viewer')
      return res.status(403).json({ error: 'Permesso insufficiente' });

    await pool.query('UPDATE trips SET invite_token=NULL, invite_token_expires_at=NULL WHERE id=$1', [req.params.id]);
    res.json({ message: 'Link revocato' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore revoca link' });
  }
});

// Toggle public share link
router.post('/:id/share', async (req, res) => {
  try {
    const perm = await pool.query(
      'SELECT role FROM trip_participants WHERE trip_id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!perm.rows.length || perm.rows[0].role === 'viewer')
      return res.status(403).json({ error: 'Permesso insufficiente' });

    const tripRes = await pool.query('SELECT share_token FROM trips WHERE id=$1', [req.params.id]);
    const existing = tripRes.rows[0]?.share_token;
    const appUrl = process.env.APP_URL || 'http://localhost:8090';

    if (existing) {
      await pool.query('UPDATE trips SET share_token=NULL, share_token_expires_at=NULL WHERE id=$1', [req.params.id]);
      res.json({ token: null, link: null });
    } else {
      const token = crypto.randomBytes(24).toString('hex');
      const upd = await pool.query(
        `UPDATE trips SET share_token=$1, share_token_expires_at = NOW() + ($3 || ' days')::interval
         WHERE id=$2 RETURNING share_token_expires_at`,
        [token, req.params.id, String(SHARE_LINK_DAYS)]
      );
      res.json({ token, link: `${appUrl}/share/${token}`, expires_at: upd.rows[0].share_token_expires_at });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore condivisione' });
  }
});

// PATCH /:id/notes — save trip notepad
router.patch('/:id/notes', async (req, res) => {
  try {
    const perm = await pool.query(
      'SELECT role FROM trip_participants WHERE trip_id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!perm.rows.length || perm.rows[0].role === 'viewer')
      return res.status(403).json({ error: 'Permesso insufficiente' });
    await pool.query('UPDATE trips SET trip_notes=$1 WHERE id=$2', [req.body.notes ?? null, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore salvataggio note' });
  }
});

// Clone trip (admin only)
router.post('/:id/clone', async (req, res) => {
  try {
    const perm = await pool.query(
      'SELECT role FROM trip_participants WHERE trip_id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!perm.rows.length || perm.rows[0].role !== 'admin')
      return res.status(403).json({ error: "Solo l'admin può duplicare il viaggio" });

    const orig = await pool.query('SELECT * FROM trips WHERE id=$1', [req.params.id]);
    if (!orig.rows.length) return res.status(404).json({ error: 'Viaggio non trovato' });
    const t = orig.rows[0];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const newTrip = await client.query(
        `INSERT INTO trips (title, description, destination, start_date, end_date, cover_image, status, total_budget, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [t.title + ' (Copia)', t.description, t.destination, t.start_date, t.end_date, t.cover_image, 'pianificazione', t.total_budget, req.user.id]
      );
      const newId = newTrip.rows[0].id;

      await client.query('INSERT INTO trip_participants (trip_id, user_id, role) VALUES ($1,$2,$3)', [newId, req.user.id, 'admin']);

      // Clone cities
      const cities = await client.query('SELECT * FROM trip_cities WHERE trip_id=$1 ORDER BY sort_order', [req.params.id]);
      const cityIdMap = {};
      for (const c of cities.rows) {
        const nc = await client.query(
          'INSERT INTO trip_cities (trip_id, name, color, sort_order, lat, lon) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
          [newId, c.name, c.color, c.sort_order, c.lat, c.lon]
        );
        cityIdMap[c.id] = nc.rows[0].id;
      }

      // Clone days
      const days = await client.query('SELECT * FROM trip_days WHERE trip_id=$1 ORDER BY date', [req.params.id]);
      const dayIdMap = {};
      for (const d of days.rows) {
        const nd = await client.query(
          'INSERT INTO trip_days (trip_id, date, city_area, notes, city_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
          [newId, d.date, d.city_area, d.notes, d.city_id ? (cityIdMap[d.city_id] ?? null) : null]
        );
        dayIdMap[d.id] = nd.rows[0].id;
      }

      // Clone activities (without completion state)
      const activities = await client.query(
        'SELECT da.* FROM day_activities da JOIN trip_days td ON td.id=da.day_id WHERE td.trip_id=$1',
        [req.params.id]
      );
      for (const a of activities.rows) {
        await client.query(
          'INSERT INTO day_activities (day_id, slot, name, time, duration, category, notes, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [dayIdMap[a.day_id], a.slot, a.name, a.time, a.duration, a.category, a.notes, a.sort_order]
        );
      }

      // Clone wishlist (unslotted)
      const wishlist = await client.query('SELECT * FROM wishlist_places WHERE trip_id=$1', [req.params.id]);
      for (const w of wishlist.rows) {
        await client.query(
          `INSERT INTO wishlist_places (trip_id, name, city, category, notes, maps_link, priority, photo_url, photos, added_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [newId, w.name, w.city, w.category, w.notes, w.maps_link, w.priority, w.photo_url, w.photos, req.user.id]
        );
      }

      // Clone packing items (unchecked)
      const packing = await client.query('SELECT * FROM packing_items WHERE trip_id=$1', [req.params.id]);
      for (const p of packing.rows) {
        await client.query('INSERT INTO packing_items (trip_id, name, category) VALUES ($1,$2,$3)', [newId, p.name, p.category]);
      }

      await client.query('COMMIT');
      res.status(201).json(newTrip.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore duplicazione viaggio' });
  }
});

module.exports = router;
