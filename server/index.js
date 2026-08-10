require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { initDb } = require('./db/init');
const authMiddleware = require('./middleware/auth');
const { mediaAuth } = require('./middleware/mediaAuth');
const { imageFileFilter, imageFilename } = require('./utils/security');
const { uploadLimiter } = require('./utils/storage');

// Fail-fast sui segreti: il repository è pubblico, quindi ogni valore preso da
// .env.example è noto a chiunque. Un JWT_SECRET di default permette di firmare
// token per qualsiasi utente → nessun avvio con segreti deboli.
const WEAK_SECRETS = new Set([
  'cambia_questo_secret_con_stringa_random_lunga',
  'changeme', 'secret', 'password', 'jwt_secret',
]);
const JWT_SECRET = process.env.JWT_SECRET || '';
if (JWT_SECRET.length < 32 || WEAK_SECRETS.has(JWT_SECRET.toLowerCase())) {
  console.error(
    'FATALE: JWT_SECRET mancante, di default o più corto di 32 caratteri.\n' +
    'Generane uno nuovo con: openssl rand -hex 32'
  );
  process.exit(1);
}
if (/:(changeme|password|postgres)@/i.test(process.env.DATABASE_URL || '')) {
  console.error('FATALE: DATABASE_URL usa una password di default. Cambiala prima di avviare.');
  process.exit(1);
}

const app = express();

// Catena di proxy: NPM → nginx del client → server. Con trust proxy=1 Express
// risolveva req.ip all'IP di NPM (uguale per tutti), rendendo globale — invece
// che per-IP — ogni rate limit. Due hop = due proxy da scartare.
app.set('trust proxy', 2);

// CORS ristretto all'origine dell'app (configurabile via env, anche lista separata da virgola)
const allowedOrigins = (process.env.CORS_ORIGIN || process.env.APP_URL || 'http://localhost:8090')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    // Consenti richieste senza Origin (curl, app mobile, same-origin) e quelle in whitelist.
    // Per le origini non consentite non emette header CORS: il browser blocca senza generare un 500.
    cb(null, !origin || allowedOrigins.includes(origin));
  },
}));
app.use(express.json({ limit: '1mb' }));

// Header di sicurezza per le risposte API. I documenti dell'app li ricevono da
// nginx (client/security-headers.conf); qui coprono le risposte JSON, che non
// devono essere né incorniciate, né indicizzate, né conservate in cache.
app.use('/api', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

// Header di sicurezza per i file statici: impedisce il MIME-sniffing (XSS via upload)
function uploadStatic(dir, { forceDownload = false } = {}) {
  return express.static(dir, {
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Contenuto caricato dagli utenti: nessuno script, nessun frame, nessuna
      // risorsa esterna. Neutralizza anche un eventuale file attivo già a disco.
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('X-Frame-Options', 'DENY');
      // Per gli allegati forza il download invece dell'esecuzione inline (HTML/SVG)
      if (forceDownload) res.setHeader('Content-Disposition', 'attachment');
    },
  });
}

// Uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── Accesso ai file caricati ────────────────────────────────────────────────
// L'ordine dei mount conta: il mount generico /uploads servirebbe anche le
// sottocartelle, quindi ogni percorso protetto va dichiarato PRIMA di esso.

// Allegati e biglietti possono contenere dati personali: NON sono pubblici.
// Vengono serviti solo dall'endpoint autenticato GET /api/files/attachment/:filename,
// che verifica login + appartenenza al viaggio. Qui blocchiamo l'accesso diretto.
app.use('/uploads/attachments', (req, res) => res.status(404).end());

// Foto del viaggio e immagini delle note: leggibili solo dai partecipanti,
// verificati file per file tramite il cookie di sessione (vedi mediaAuth).
app.use('/uploads/photos', mediaAuth('trip_photos'), uploadStatic(path.join(uploadsDir, 'photos')));
app.use('/uploads/note-images', mediaAuth('note_images'), uploadStatic(path.join(uploadsDir, 'note-images')));

// Restano pubbliche solo le copertine dei viaggi (`cover-*`), che compaiono
// nelle pagine di condivisione pubblica e non hanno quindi un lettore autenticato.
app.use('/uploads', uploadStatic(uploadsDir));

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, imageFilename('cover', file.originalname)),
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

// Route pubbliche
app.use('/api/auth', require('./routes/auth'));
app.use('/api/share', require('./routes/public'));

// Upload immagine (protetto)
app.post('/api/upload', authMiddleware, uploadLimiter, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nessun file caricato' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// Route protette
app.use('/api/users', authMiddleware, require('./routes/users'));
// Diritti GDPR: esportazione e cancellazione dell'account
app.use('/api/users/me', authMiddleware, require('./routes/account'));
// Download autenticato di allegati e biglietti (verifica appartenenza al viaggio)
app.use('/api/files', authMiddleware, require('./routes/files'));
app.use('/api/trips', authMiddleware, require('./routes/trips'));
app.use('/api/trips/:id/days', authMiddleware, require('./routes/days'));
app.use('/api/trips/:id/wishlist', authMiddleware, require('./routes/wishlist'));
app.use('/api/trips/:id/budget', authMiddleware, require('./routes/budget'));
app.use('/api/trips/:id/packing', authMiddleware, require('./routes/packing'));
app.use('/api/trips/:id/cities', authMiddleware, require('./routes/cities'));
app.use('/api/trips/:id/attachments', authMiddleware, require('./routes/attachments'));
app.use('/api/trips/:id/photos', authMiddleware, require('./routes/photos'));
app.use('/api/trips/:id/notes', authMiddleware, require('./routes/notes'));
app.use('/api/trips/:id/checklist', authMiddleware, require('./routes/checklist'));
app.use('/api/trips/:id/note-images', authMiddleware, require('./routes/note_images'));
app.use('/api/trips/:id/transports', authMiddleware, require('./routes/transports'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Error handler globale: traduce gli errori (in particolare quelli di multer:
// file troppo grande, tipo non consentito) in JSON pulito invece della pagina
// HTML con stack trace del gestore di default di Express.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File troppo grande' : 'Upload non valido';
    return res.status(400).json({ error: msg });
  }
  // Errori sollevati dai fileFilter (es. "Solo immagini consentite")
  if (err && /consentit|ammessi|immagini|PDF/i.test(err.message || '')) {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Errore interno del server' });
});

const PORT = process.env.PORT || 3090;

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Server in ascolto su porta ${PORT}`));
  })
  .catch(err => {
    console.error('Impossibile inizializzare il database:', err);
    process.exit(1);
  });
