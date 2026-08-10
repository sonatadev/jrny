const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/init');
const { isValidEmail, rateLimit, validatePassword } = require('../utils/security');
const { setMediaCookie } = require('../middleware/mediaAuth');
const { sendSecurityNotice } = require('../utils/email');

// Limita i tentativi di verifica della password attuale (bruteforce da sessione valida)
const passwordLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

const PROFILE_COLS = 'id, name, email, first_name, last_name, phone, age, avatar_url, theme, mode';
const VALID_THEMES = ['sunset', 'ocean', 'forest', 'rose'];
const VALID_MODES = ['light', 'dark'];

// GET /api/users/me
router.get('/me', async (req, res) => {
  try {
    const r = await pool.query(`SELECT ${PROFILE_COLS} FROM users WHERE id=$1`, [req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Utente non trovato' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore recupero profilo' });
  }
});

// PUT /api/users/me
router.put('/me', async (req, res) => {
  const { first_name, last_name, email, phone, age, avatar_url } = req.body;

  if (email !== undefined && !isValidEmail(email))
    return res.status(400).json({ error: 'Email non valida' });

  let ageVal = null;
  if (age !== undefined && age !== null && age !== '') {
    ageVal = parseInt(age);
    if (isNaN(ageVal) || ageVal > 120)
      return res.status(400).json({ error: 'Età non valida' });
    // Art. 8 GDPR: in Italia il consenso digitale è valido dai 14 anni.
    // Sotto quella soglia servirebbe il consenso di chi esercita la
    // responsabilità genitoriale, che questa app non è in grado di raccogliere.
    if (ageVal < 14)
      return res.status(400).json({ error: 'Per usare jrny devi avere almeno 14 anni' });
  }

  // name resta sincronizzato come "Nome Cognome" (fallback al name esistente)
  const fullName = [first_name, last_name].filter(s => s && s.trim()).join(' ').trim();

  try {
    if (email) {
      const dup = await pool.query('SELECT id FROM users WHERE email=$1 AND id<>$2', [email, req.user.id]);
      if (dup.rows.length) return res.status(409).json({ error: 'Email già in uso' });
    }

    const result = await pool.query(
      `UPDATE users SET
        first_name = $1,
        last_name  = $2,
        phone      = $3,
        age        = $4,
        avatar_url = $5,
        email      = COALESCE($6, email),
        name       = COALESCE(NULLIF($7, ''), name)
       WHERE id = $8
       RETURNING ${PROFILE_COLS}`,
      [
        first_name || null,
        last_name || null,
        phone || null,
        ageVal,
        avatar_url || null,
        email || null,
        fullName,
        req.user.id,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiornamento profilo' });
  }
});

// PUT /api/users/me/appearance  (solo preferenze estetiche, aggiornamento parziale)
router.put('/me/appearance', async (req, res) => {
  const { theme, mode } = req.body;
  if (theme !== undefined && !VALID_THEMES.includes(theme))
    return res.status(400).json({ error: 'Tema non valido' });
  if (mode !== undefined && !VALID_MODES.includes(mode))
    return res.status(400).json({ error: 'Modalità non valida' });

  try {
    const result = await pool.query(
      `UPDATE users SET
        theme = COALESCE($1, theme),
        mode  = COALESCE($2, mode)
       WHERE id = $3
       RETURNING theme, mode`,
      [theme || null, mode || null, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore aggiornamento preferenze' });
  }
});

// PUT /api/users/me/password  (cambio password)
router.put('/me/password', passwordLimiter, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error: 'Password attuale e nuova obbligatorie' });
  const pwError = validatePassword(new_password, { email: req.user.email });
  if (pwError) return res.status(400).json({ error: pwError });

  try {
    const r = await pool.query('SELECT name, email, password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Utente non trovato' });

    const valid = await bcrypt.compare(current_password, r.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Password attuale errata' });

    const hash = await bcrypt.hash(new_password, 12);
    // Incrementa token_version → revoca tutti i JWT esistenti (anche su altri dispositivi)
    const upd = await pool.query(
      'UPDATE users SET password_hash=$1, token_version=token_version+1 WHERE id=$2 RETURNING token_version',
      [hash, req.user.id]
    );
    // Rilascia un token fresco così la sessione corrente non viene disconnessa
    const token = jwt.sign(
      { id: req.user.id, email: r.rows[0].email, name: r.rows[0].name, tv: upd.rows[0].token_version },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    // Il vecchio cookie porta un token con token_version superata: va sostituito
    setMediaCookie(req, res, token);

    // Avviso all'indirizzo dell'account: se il cambio non è suo, deve saperlo.
    sendSecurityNotice({
      to: r.rows[0].email,
      subject: 'La password del tuo account jrny è stata cambiata',
      message: 'La password del tuo account è appena stata modificata dalle impostazioni. Se non sei stato tu, usa "Password dimenticata?" per riprendere il controllo dell\'account.',
    }).catch(err => console.error('[email] errore invio avviso:', err.message));

    res.json({ message: 'Password aggiornata', token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore cambio password' });
  }
});

module.exports = router;
