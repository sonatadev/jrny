const jwt = require('jsonwebtoken');
const { pool } = require('../db/init');

module.exports = async function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'Token mancante' });

  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token non valido o scaduto' });
  }

  // Revoca: confronta la versione del token con quella corrente dell'utente.
  // Il cambio password incrementa token_version → i vecchi JWT non sono più validi.
  try {
    const r = await pool.query('SELECT token_version FROM users WHERE id=$1', [payload.id]);
    if (!r.rows.length) return res.status(401).json({ error: 'Token non valido o scaduto' });
    if ((payload.tv || 0) !== r.rows[0].token_version)
      return res.status(401).json({ error: 'Sessione scaduta, accedi di nuovo' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Errore interno del server' });
  }

  req.user = payload;
  next();
};
