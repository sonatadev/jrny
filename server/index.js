require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { initDb } = require('./db/init');
const authMiddleware = require('./middleware/auth');

const app = express();

// Dietro al reverse proxy (nginx) — necessario perché req.ip sia l'IP reale del client
app.set('trust proxy', 1);

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

// Header di sicurezza per i file statici: impedisce il MIME-sniffing (XSS via upload)
function uploadStatic(dir, { forceDownload = false } = {}) {
  return express.static(dir, {
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Per gli allegati forza il download invece dell'esecuzione inline (HTML/SVG)
      if (forceDownload) res.setHeader('Content-Disposition', 'attachment');
    },
  });
}

// Uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', uploadStatic(uploadsDir));

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `cover-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo immagini consentite'));
  }
});

// Route pubbliche
app.use('/api/auth', require('./routes/auth'));
app.use('/api/share', require('./routes/public'));

// Upload immagine (protetto)
app.post('/api/upload', authMiddleware, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nessun file caricato' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// Route protette
app.use('/api/trips', authMiddleware, require('./routes/trips'));
app.use('/api/trips/:id/days', authMiddleware, require('./routes/days'));
app.use('/api/trips/:id/wishlist', authMiddleware, require('./routes/wishlist'));
app.use('/api/trips/:id/budget', authMiddleware, require('./routes/budget'));
app.use('/api/trips/:id/packing', authMiddleware, require('./routes/packing'));
app.use('/api/trips/:id/cities', authMiddleware, require('./routes/cities'));
app.use('/api/trips/:id/attachments', authMiddleware, require('./routes/attachments'));
app.use('/uploads/attachments', uploadStatic(path.join(__dirname, 'uploads/attachments'), { forceDownload: true }));
app.use('/api/trips/:id/photos', authMiddleware, require('./routes/photos'));
app.use('/uploads/photos', uploadStatic(path.join(__dirname, 'uploads/photos')));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3090;

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Server in ascolto su porta ${PORT}`));
  })
  .catch(err => {
    console.error('Impossibile inizializzare il database:', err);
    process.exit(1);
  });
