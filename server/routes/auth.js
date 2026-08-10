const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/init');
const crypto = require('crypto');
const { isValidEmail, rateLimit, validatePassword } = require('../utils/security');
const { setMediaCookie, clearMediaCookie } = require('../middleware/mediaAuth');
const { sendPasswordResetEmail, sendSecurityNotice } = require('../utils/email');

// Costo bcrypt: 12 invece di 10 (~4x più lento da forzare, ancora pochi ms
// per login legittimo). Le password esistenti restano a 10 finché non cambiano.
const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_MINUTES = 60;

// Limita i tentativi di autenticazione per mitigare brute-force e abusi
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

// Il limite per IP non protegge un singolo account da tentativi distribuiti:
// questo conta i tentativi per indirizzo email, ovunque arrivino.
const perAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Troppi tentativi per questo account, riprova fra qualche minuto',
  key: req => `login:${String(req.body?.email || '').trim().toLowerCase()}`,
});

// La registrazione rivela se un indirizzo è già noto ("Email già registrata"):
// serve per l'usabilità, ma con un limite basso enumerare diventa impraticabile.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Troppe registrazioni da questa rete, riprova più tardi',
});

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Firma un JWT includendo la versione del token (per la revoca lato server)
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, tv: user.token_version || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

router.post('/register', registerLimiter, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Nome, email e password obbligatori' });
  if (!isValidEmail(email))
    return res.status(400).json({ error: 'Email non valida' });
  const pwError = validatePassword(password, { email });
  if (pwError) return res.status(400).json({ error: pwError });

  try {
    const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'Email già registrata' });

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id, name, email, avatar_url, theme, mode, token_version',
      [name, email, hash]
    );
    const user = result.rows[0];

    // Nessuna accettazione automatica degli inviti: registrarsi con un
    // indirizzo invitato non prova di possederlo. L'invito si riscatta solo
    // aprendo il link ricevuto via email (POST /api/trips/invitations/claim/:token).

    const token = signToken(user);
    // Cookie per la lettura di foto e immagini delle note (<img src> non può
    // portare un header Authorization): vedi middleware/mediaAuth.js
    setMediaCookie(req, res, token);
    // token_version non fa parte del profilo pubblico restituito al client
    delete user.token_version;
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

router.post('/login', authLimiter, perAccountLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email e password obbligatori' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Credenziali non valide' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenziali non valide' });

    const token = signToken(user);
    setMediaCookie(req, res, token);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url, theme: user.theme, mode: user.mode } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// POST /api/auth/forgot — avvia il recupero password.
// Risponde sempre allo stesso modo: dire "questa email non esiste" darebbe a
// chiunque un oracolo per sapere chi è registrato.
router.post('/forgot', authLimiter, async (req, res) => {
  const { email } = req.body;
  const generic = { message: 'Se l\'indirizzo è registrato, riceverai un\'email con le istruzioni.' };
  if (!email || !isValidEmail(email)) return res.json(generic);

  try {
    const r = await pool.query('SELECT id, name FROM users WHERE email=$1', [email]);
    if (!r.rows.length) return res.json(generic);
    const user = r.rows[0];

    // Un solo token valido alla volta per utente
    await pool.query('DELETE FROM password_resets WHERE user_id=$1', [user.id]);

    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1,$2, NOW() + ($3 || ' minutes')::interval)`,
      [user.id, hashResetToken(token), String(RESET_TOKEN_MINUTES)]
    );

    const appUrl = process.env.APP_URL || 'http://localhost:8090';
    sendPasswordResetEmail({
      to: email, name: user.name,
      resetUrl: `${appUrl}/reset-password/${token}`,
      minutes: RESET_TOKEN_MINUTES,
    }).catch(err => console.error('[email] errore invio reset:', err.message));

    res.json(generic);
  } catch (err) {
    console.error(err);
    res.json(generic);
  }
});

// POST /api/auth/reset — completa il recupero password
router.post('/reset', authLimiter, async (req, res) => {
  const { token, password } = req.body;
  if (!token || typeof token !== 'string')
    return res.status(400).json({ error: 'Token mancante' });

  try {
    const r = await pool.query(
      `SELECT pr.id, pr.user_id, u.email
         FROM password_resets pr JOIN users u ON u.id = pr.user_id
        WHERE pr.token_hash = $1 AND pr.expires_at > NOW()`,
      [hashResetToken(token)]
    );
    if (!r.rows.length) return res.status(400).json({ error: 'Link non valido o scaduto' });
    const { id, user_id, email } = r.rows[0];

    const pwError = validatePassword(password, { email });
    if (pwError) return res.status(400).json({ error: pwError });

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    // token_version+1 chiude tutte le sessioni aperte: se qualcuno era già
    // entrato con la vecchia password, il reset lo butta fuori.
    await pool.query(
      'UPDATE users SET password_hash=$1, token_version=token_version+1 WHERE id=$2',
      [hash, user_id]
    );
    await pool.query('DELETE FROM password_resets WHERE id=$1', [id]);

    sendSecurityNotice({
      to: email,
      subject: 'La password del tuo account jrny è stata reimpostata',
      message: 'La password del tuo account è appena stata reimpostata tramite il link di recupero. Se non sei stato tu, contatta subito chi gestisce l\'istanza.',
    }).catch(err => console.error('[email] errore invio avviso:', err.message));

    res.json({ message: 'Password aggiornata, ora puoi accedere' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// POST /api/auth/logout — invalida il cookie dei media.
// Il JWT resta valido fino alla scadenza (è stateless): serve solo a non
// lasciare sul dispositivo un cookie che dà accesso alle immagini.
router.post('/logout', (req, res) => {
  clearMediaCookie(req, res);
  res.json({ message: 'Sessione chiusa' });
});

module.exports = router;
