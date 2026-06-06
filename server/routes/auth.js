const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/init');
const { isValidEmail, rateLimit } = require('../utils/security');

// Limita i tentativi di autenticazione per mitigare brute-force e abusi
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

router.post('/register', authLimiter, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Nome, email e password obbligatori' });
  if (!isValidEmail(email))
    return res.status(400).json({ error: 'Email non valida' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password minimo 6 caratteri' });

  try {
    const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'Email già registrata' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id, name, email',
      [name, email, hash]
    );
    const user = result.rows[0];

    // Auto-accetta inviti pendenti per questa email
    const invites = await pool.query(
      'SELECT trip_id, role FROM trip_invitations WHERE invited_email=$1', [email]
    );
    for (const inv of invites.rows) {
      await pool.query(
        'INSERT INTO trip_participants (trip_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [inv.trip_id, user.id, inv.role]
      );
    }
    await pool.query('DELETE FROM trip_invitations WHERE invited_email=$1', [email]);

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email e password obbligatori' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Credenziali non valide' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenziali non valide' });

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

module.exports = router;
