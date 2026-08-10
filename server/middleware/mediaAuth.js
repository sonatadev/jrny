'use strict';

const jwt = require('jsonwebtoken');
const path = require('path');
const { pool } = require('../db/init');

// Foto e immagini delle note sono dati personali: prima erano servite da
// express.static senza alcun controllo, protette solo dall'imprevedibilità del
// nome file (URL pubblica e permanente, sopravvissuta a cancellazioni e
// rimozioni di partecipanti).
//
// Non basta un endpoint API: le immagini sono renderizzate con <img src> anche
// dentro il contenuto HTML delle note, dove non possiamo iniettare un header
// Authorization. Serve quindi un cookie con Path=/uploads, che il browser
// allega da solo a ogni richiesta di immagine, e una verifica di appartenenza
// al viaggio fatta per singolo file.
const MEDIA_COOKIE = 'jrny_media';
const MEDIA_MAX_AGE = 7 * 24 * 3600; // allineato alla durata del JWT

function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function readToken(req) {
  const header = req.headers['authorization'];
  if (header) return header.startsWith('Bearer ') ? header.slice(7) : header;
  return parseCookies(req.headers.cookie)[MEDIA_COOKIE] || null;
}

function setMediaCookie(req, res, token) {
  const parts = [
    `${MEDIA_COOKIE}=${token}`,
    'Path=/uploads',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${MEDIA_MAX_AGE}`,
  ];
  // In produzione l'app è dietro TLS su NPM; req.secure legge X-Forwarded-Proto
  // grazie a trust proxy. In HTTP locale il flag va omesso o il cookie sparisce.
  if (req.secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function clearMediaCookie(req, res) {
  res.append('Set-Cookie', `${MEDIA_COOKIE}=; Path=/uploads; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// `table` proviene solo da costanti nostre (mai dall'input): trip_photos o note_images.
function mediaAuth(table) {
  return async (req, res, next) => {
    const token = readToken(req);
    if (!token) return res.status(401).json({ error: 'Autenticazione richiesta' });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Sessione non valida' });
    }

    const filename = path.basename(req.path);
    if (!/^[\w.\-]+$/.test(filename)) return res.status(400).json({ error: 'Nome file non valido' });

    const storedPath = `${req.baseUrl}/${filename}`;
    try {
      // Un'unica query: appartenenza al viaggio + token non revocato.
      const r = await pool.query(
        `SELECT 1
           FROM ${table} m
           JOIN trip_participants tp ON tp.trip_id = m.trip_id AND tp.user_id = $2
           JOIN users u ON u.id = $2 AND u.token_version = $3
          WHERE m.url = $1`,
        [storedPath, payload.id, payload.tv || 0]
      );
      // 404 anche quando il file esiste ma non sei del viaggio: non confermare
      // l'esistenza di media altrui.
      if (!r.rows.length) return res.status(404).json({ error: 'File non trovato' });
      res.setHeader('Cache-Control', 'private, max-age=300');
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Errore interno del server' });
    }
  };
}

module.exports = { mediaAuth, setMediaCookie, clearMediaCookie, MEDIA_COOKIE };
