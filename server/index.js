require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { initDb } = require('./db/init');
const authMiddleware = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json());

// Uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

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
app.use('/uploads/attachments', express.static(path.join(__dirname, 'uploads/attachments')));
app.use('/api/trips/:id/photos', authMiddleware, require('./routes/photos'));
app.use('/uploads/photos', express.static(path.join(__dirname, 'uploads/photos')));

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
