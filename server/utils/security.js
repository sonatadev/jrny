'use strict';

// Ruoli validi per i partecipanti a un viaggio
const VALID_ROLES = ['admin', 'editor', 'viewer'];

function isValidRole(role) {
  return typeof role === 'string' && VALID_ROLES.includes(role);
}

// Validazione email semplice ma robusta (no spazi, una @, un dominio con punto)
function isValidEmail(email) {
  return typeof email === 'string' &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Escape dei caratteri HTML pericolosi (per interpolazione in template email/HTML)
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Rate limiter in-memory, senza dipendenze esterne.
// Limita il numero di richieste per IP in una finestra temporale.
function rateLimit({ windowMs = 15 * 60 * 1000, max = 10, message = 'Troppe richieste, riprova più tardi' } = {}) {
  const hits = new Map(); // ip -> { count, resetAt }

  // Pulizia periodica delle entry scadute per evitare leak di memoria
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of hits) {
      if (rec.resetAt <= now) hits.delete(ip);
    }
  }, windowMs);
  if (cleanup.unref) cleanup.unref();

  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    let rec = hits.get(ip);
    if (!rec || rec.resetAt <= now) {
      rec = { count: 0, resetAt: now + windowMs };
      hits.set(ip, rec);
    }
    rec.count++;
    if (rec.count > max) {
      const retryAfter = Math.ceil((rec.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

module.exports = { VALID_ROLES, isValidRole, isValidEmail, escapeHtml, rateLimit };
