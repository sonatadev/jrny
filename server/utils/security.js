'use strict';

const crypto = require('crypto');
const path = require('path');

// Token casuale crittograficamente sicuro (hex) per i nomi file degli upload.
// Sostituisce Math.random() (predicibile) → i filename non sono indovinabili.
function randomFileToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

// Upload di immagini: allowlist esplicita di estensione E mime type.
// Il vecchio filtro `mimetype.startsWith('image/')` accettava image/svg+xml:
// un SVG servito inline dallo stesso origin esegue script, quindi permetteva
// XSS persistente e furto del token JWT da localStorage.
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.heif', '.avif']);
const IMAGE_MIME = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'image/heic', 'image/heif', 'image/avif',
]);

function imageFileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  if (!IMAGE_EXT.has(ext) || !IMAGE_MIME.has(mime))
    return cb(new Error('Sono ammesse solo immagini (png, jpg, webp, gif, heic)'));
  cb(null, true);
}

// Nome file generato: l'estensione arriva sempre dall'allowlist, mai dall'input.
function imageFilename(prefix, originalname) {
  const ext = path.extname(originalname || '').toLowerCase();
  return `${prefix}-${Date.now()}-${randomFileToken()}${IMAGE_EXT.has(ext) ? ext : '.bin'}`;
}

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

// Accetta solo URL http/https assoluti; blocca schemi pericolosi (javascript:, data:, ecc.)
// usati come href/src lato client. Ritorna true anche per null/'' (campo opzionale, gestito a parte).
function isSafeUrl(value) {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Valida e tronca un numero finito; ritorna { value } oppure { error }.
function parseNumber(raw, { field = 'Valore', min = -Infinity, max = Infinity, allowNull = true } = {}) {
  if (raw === undefined || raw === null || raw === '') {
    if (allowNull) return { value: null };
    return { error: `${field} obbligatorio` };
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return { error: `${field} non valido` };
  return { value: n };
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
// `key` permette di limitare per utente invece che per IP (utile dietro NAT,
// e per gli upload, dove il costo è per account e non per indirizzo).
function rateLimit({ windowMs = 15 * 60 * 1000, max = 10, message = 'Troppe richieste, riprova più tardi', key = null } = {}) {
  const hits = new Map(); // chiave -> { count, resetAt }

  // Pulizia periodica delle entry scadute per evitare leak di memoria
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [id, rec] of hits) {
      if (rec.resetAt <= now) hits.delete(id);
    }
  }, windowMs);
  if (cleanup.unref) cleanup.unref();

  return (req, res, next) => {
    const id = key ? key(req) : (req.ip || req.connection?.remoteAddress || 'unknown');
    const now = Date.now();
    let rec = hits.get(id);
    if (!rec || rec.resetAt <= now) {
      rec = { count: 0, resetAt: now + windowMs };
      hits.set(id, rec);
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

module.exports = {
  VALID_ROLES, isValidRole, isValidEmail, isSafeUrl, parseNumber, escapeHtml,
  rateLimit, randomFileToken, imageFileFilter, imageFilename, IMAGE_EXT,
};
