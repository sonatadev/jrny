'use strict';

// Import di un luogo da un link Google Maps.
//
// Questo modulo NON scarica né analizza le pagine di Google. In passato lo
// faceva: fingeva un User-Agent Chrome, si portava dietro i cookie per
// superare il consent wall e leggeva og:title/og:description/ld+json. Sono
// esattamente le pratiche vietate dai Termini di Google (accesso automatizzato,
// scraping, aggiramento di un controllo), oltre che fragili.
//
// Ora si limita a due cose lecite:
//   1. seguire i redirect di un link accorciato per ottenere l'URL canonico
//      /maps/place/... (nessun corpo della risposta viene letto);
//   2. leggere nome, indirizzo e coordinate dal percorso di quell'URL, cioè
//      dal link che l'utente ha incollato.
// Se è configurata una chiave, l'API Places ufficiale rifinisce nome,
// categoria e foto.
//
// Conseguenza: gli orari di apertura non vengono più importati — arrivavano
// solo dall'HTML della pagina.

const https = require('https');
const http = require('http');
const dns = require('dns');

const MAX_REDIRECTS = 10;
const USER_AGENT = 'jrny-app/1.0 (+https://github.com/sonatadev/jrny)';

// ── Difesa SSRF ─────────────────────────────────────────────────────────────

// Range privati/loopback/link-local, a partire da un indirizzo IP già risolto.
function isBlockedIp(ip) {
  if (!ip) return true;
  const h = String(ip).toLowerCase().replace(/^\[|\]$/g, '');
  if (h === '::1' || h === '0.0.0.0') return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [parseInt(m[1]), parseInt(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;           // link-local / metadata
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16/12
    if (a === 192 && b === 168) return true;           // 192.168/16
  }
  if (/^(fc|fd|fe80)/.test(h)) return true;
  // IPv4 mappato in IPv6: ::ffff:169.254.169.254
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIp(mapped[1]);
  return false;
}

function isBlockedHost(hostname) {
  if (!hostname) return true;
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true;
  return isBlockedIp(h);
}

// Controllare il nome host prima di connettersi non basta: fra il controllo e
// la connessione il DNS può cambiare risposta (DNS rebinding). Filtrando in
// `lookup` la verifica avviene sull'indirizzo che verrà davvero usato.
function safeLookup(hostname, options, callback) {
  const cb = typeof options === 'function' ? options : callback;
  const opts = typeof options === 'function' ? {} : (options || {});
  dns.lookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return cb(err);
    const list = Array.isArray(addresses) ? addresses : [addresses];
    if (!list.length) return cb(new Error('Host non risolvibile'));
    if (list.some(a => isBlockedIp(a.address))) return cb(new Error('Host non consentito'));
    if (opts.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

// ── Google Places API (ufficiale, opzionale) ────────────────────────────────

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      lookup: safeLookup,
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { if (body.length < 256 * 1024) body += c; });
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, body }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('timeout')));
  });
}

// Risolve un photo_reference nell'URL CDN definitivo.
// Solo l'URL su googleusercontent.com viene restituito: quello dell'API
// contiene la chiave in chiaro e finirebbe nel DB e nei tag <img>.
async function resolvePhotoRef(ref, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${ref}&key=${apiKey}`;
  const { location } = await httpsGet(url);
  if (location && location.includes('googleusercontent.com')) return location;
  return null;
}

function mapTypesToCategory(types) {
  if (!types?.length) return null;
  const t = types;
  const has = (...keys) => keys.some(k => t.includes(k));
  if (has('book_store', 'library')) return 'libreria';
  if (has('museum')) return 'museo';
  if (has('art_gallery')) return 'galleria';
  if (has('gym', 'fitness_center')) return 'palestra';
  if (has('swimming_pool', 'aquatic_center')) return 'piscina';
  if (has('stadium', 'sports_complex', 'bowling_alley', 'golf_course')) return 'sport';
  if (has('spa', 'beauty_salon', 'hair_salon', 'nail_salon')) return 'benessere';
  if (has('movie_theater')) return 'cinema';
  if (has('performing_arts_theater', 'theater', 'opera_house')) return 'teatro';
  if (has('night_club', 'casino', 'comedy_club')) return 'nightlife';
  if (has('concert_hall', 'live_music_venue', 'jazz_club')) return 'musica';
  if (has('zoo')) return 'zoo';
  if (has('aquarium')) return 'acquario';
  if (has('amusement_park', 'amusement_center', 'water_park')) return 'attrazione';
  if (has('church', 'cathedral', 'chapel')) return 'chiesa';
  if (has('hindu_temple', 'buddhist_temple', 'jain_temple', 'place_of_worship')) return 'tempio';
  if (has('mosque', 'synagogue')) return 'santuario';
  if (has('castle')) return 'castello';
  if (has('ruins')) return 'rovine';
  if (has('monument', 'war_memorial', 'historical_landmark')) return 'storico';
  if (has('national_park', 'park', 'state_park')) return 'parco';
  if (has('botanical_garden', 'garden')) return 'giardino';
  if (has('beach')) return 'spiaggia';
  if (has('hot_spring', 'thermal_bath', 'onsen')) return 'terme';
  if (has('viewpoint', 'observation_deck')) return 'panorama';
  if (has('restaurant', 'sushi_restaurant', 'ramen_restaurant', 'pizza_restaurant', 'italian_restaurant', 'japanese_restaurant')) return 'ristorante';
  if (has('cafe', 'coffee_shop', 'tea_house')) return 'cafe';
  if (has('bar', 'pub', 'wine_bar', 'cocktail_bar')) return 'bar';
  if (has('food_court', 'street_food', 'food_truck')) return 'street_food';
  if (has('market', 'open_air_market', 'grocery_store')) return 'mercato';
  if (has('supermarket', 'convenience_store', 'grocery_or_supermarket')) return 'supermercato';
  if (has('bakery', 'food_store')) return 'cibo';
  if (has('clothing_store', 'shoe_store', 'fashion_store')) return 'moda';
  if (has('gift_shop', 'souvenir_store')) return 'souvenir';
  if (has('shopping_mall', 'department_store', 'store', 'shop')) return 'shopping';
  if (has('pharmacy', 'drugstore')) return 'farmacia';
  if (has('train_station', 'subway_station', 'bus_station', 'airport', 'transit_station', 'ferry_terminal')) return 'trasporto';
  if (has('hotel', 'lodging', 'hostel', 'motel', 'resort_hotel')) return 'alloggio';
  return null;
}

// Cerca il luogo con l'API ufficiale. Restituisce { name, types, photos }.
async function fetchPlaceViaApi(searchText, apiKey, max = 3) {
  if (!apiKey || !searchText) return null;
  try {
    const query = encodeURIComponent(toEnglish(searchText) || searchText);
    const findUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${query}&inputtype=textquery&fields=name,types,photos&key=${apiKey}`;
    const { body } = await httpsGet(findUrl);
    const data = JSON.parse(body);
    if (data.status !== 'OK' || !data.candidates?.[0]) return null;
    const candidate = data.candidates[0];
    const photoRefs = candidate.photos?.slice(0, max).map(p => p.photo_reference) || [];
    const photos = (await Promise.all(photoRefs.map(ref => resolvePhotoRef(ref, apiKey)))).filter(Boolean);
    return { name: candidate.name || null, types: candidate.types || [], photos };
  } catch (err) {
    console.warn('[Maps Import] Places API non disponibile:', err.message);
    return null;
  }
}

// ── Risoluzione del link ────────────────────────────────────────────────────

function isGoogleMapsUrl(url) {
  try {
    const u = new URL(url);
    return (
      ((u.hostname === 'www.google.com' || u.hostname === 'google.com') &&
        u.pathname.startsWith('/maps/')) ||
      u.hostname === 'maps.app.goo.gl' ||
      (u.hostname === 'goo.gl' && u.pathname.startsWith('/maps/'))
    );
  } catch {
    return false;
  }
}

// Segue i redirect per arrivare all'URL canonico /maps/place/...
// Nessun cookie viene conservato o rimandato (prima venivano propagati anche
// fra domini diversi) e nessun corpo di risposta viene letto: serve solo
// l'header Location.
function resolvePlaceUrl(urlStr, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > MAX_REDIRECTS) return resolve(urlStr);

    let parsed;
    try { parsed = new URL(urlStr); }
    catch { return reject(new Error('URL non valido')); }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
      return reject(new Error('Protocollo non consentito'));
    if (isBlockedHost(parsed.hostname))
      return reject(new Error('Host non consentito'));

    // Trovato l'URL canonico: contiene già nome, indirizzo e coordinate.
    if (/\/maps\/(place|search)\//.test(parsed.pathname)) return resolve(urlStr);

    const proto = parsed.protocol === 'https:' ? https : http;
    const req = proto.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
      lookup: safeLookup,
    }, (res) => {
      res.resume(); // il corpo non ci serve e non viene analizzato
      const loc = res.headers.location;
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && loc) {
        let next;
        try { next = loc.startsWith('http') ? loc : new URL(loc, urlStr).toString(); }
        catch { return resolve(urlStr); }
        return resolvePlaceUrl(next, redirects + 1).then(resolve).catch(reject);
      }
      resolve(urlStr);
    });

    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Request timeout')));
    req.end();
  });
}

// ── Lettura dei dati dall'URL ───────────────────────────────────────────────

function extractFullPathText(url) {
  try {
    const m = new URL(url).pathname.match(/\/maps\/(?:place|search)\/([^/@?]+)/);
    if (!m) return null;
    return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
  } catch { return null; }
}

// Nome del luogo dal percorso dell'URL. Alcuni link hanno l'indirizzo prima
// del nome: in quel caso il nome è l'ultimo componente.
function nameFromMapsUrl(url) {
  try {
    const full = extractFullPathText(url);
    if (!full) return null;
    const parts = full.split(',').map(s => s.trim()).filter(Boolean);
    if (!parts.length) return null;
    const first = parts[0];
    const isAddressFirst =
      /^[A-Za-z]{2,}$/.test(first) && first.length > 3 &&
      parts.length > 2 &&
      /\d/.test(parts[1]);
    if (isAddressFirst) {
      const last = toEnglish(parts[parts.length - 1]) || '';
      return last.replace(/^\d[\d\s\-]*\s*/, '').trim() || toEnglish(first);
    }
    return toEnglish(first) || null;
  } catch { return null; }
}

// Coordinate del luogo dall'URL: preferisce il pin (!3d/!4d) al centro mappa.
function coordsFromMapsUrl(url) {
  if (!url) return null;
  const valid = (lat, lon) =>
    Number.isFinite(lat) && Number.isFinite(lon) &&
    Math.abs(lat) <= 90 && Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0);

  const pin = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (pin) {
    const lat = parseFloat(pin[1]), lon = parseFloat(pin[2]);
    if (valid(lat, lon)) return { lat, lon };
  }
  const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) {
    const lat = parseFloat(at[1]), lon = parseFloat(at[2]);
    if (valid(lat, lon)) return { lat, lon };
  }
  return null;
}

function addressFromMapsUrl(url) {
  try {
    const full = extractFullPathText(url);
    if (!full) return null;
    const comma = full.indexOf(',');
    if (comma === -1) return null;
    return toEnglish(full.slice(comma + 1).trim());
  } catch { return null; }
}

// Rimuove i caratteri fuori da ASCII stampabile + Latin Extended
function toEnglish(str) {
  if (!str) return null;
  return str
    .replace(/[^\x20-\x7EÀ-ɏ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

function mapToCategory(googleCat) {
  if (!googleCat) return 'attrazione';
  const l = googleCat.toLowerCase();
  if (/museum|museu/.test(l)) return 'museo';
  if (/gallery|galleria|art museum/.test(l)) return 'galleria';
  if (/temple|tempio|buddhist|hindu/.test(l)) return 'tempio';
  if (/shrine|santuario|shinto/.test(l)) return 'santuario';
  if (/castle|castello|palace/.test(l)) return 'castello';
  if (/historic|storico|archaeolog|heritage/.test(l)) return 'storico';
  if (/ruin|rovine/.test(l)) return 'rovine';
  if (/monument|monumento|memorial/.test(l)) return 'monumento';
  if (/viewpoint|belvedere|panoram|lookout/.test(l)) return 'panorama';
  if (/\bpark\b|parco|national park/.test(l)) return 'parco';
  if (/garden|giardino|botanical/.test(l)) return 'giardino';
  if (/beach|spiaggia/.test(l)) return 'spiaggia';
  if (/nature|forest|mountain|hiking|waterfall/.test(l)) return 'natura';
  if (/spa|thermal|terme|hot spring|onsen/.test(l)) return 'terme';
  if (/gym|fitness|palestra|crossfit|pilates|yoga|weightlift|bodybuilding/.test(l)) return 'palestra';
  if (/swimming pool|piscina|aquatic/.test(l)) return 'piscina';
  if (/sport|stadium|arena|campo sportivo|tennis|climbing|surf school/.test(l)) return 'sport';
  if (/wellness|beauty salon|massage|nail|salute/.test(l)) return 'benessere';
  if (/theater|theatre|teatro|opera house/.test(l)) return 'teatro';
  if (/cinema|movie/.test(l)) return 'cinema';
  if (/concert|live music|music venue|jazz|nightclub|discoteca|club/.test(l)) return 'nightlife';
  if (/cat cafe|animal cafe|pet cafe/.test(l)) return 'cafe';
  if (/restaurant|ristorante|sushi|ramen|trattoria|osteria/.test(l)) return 'ristorante';
  if (/cafe|coffee|caffè|tea house/.test(l)) return 'cafe';
  if (/\bbar\b|pub|tavern/.test(l)) return 'bar';
  if (/street food|food stall|food truck/.test(l)) return 'street_food';
  if (/market|mercato|bazaar/.test(l)) return 'mercato';
  if (/shopping|mall|department store/.test(l)) return 'shopping';
  if (/fashion|moda|clothing|boutique/.test(l)) return 'moda';
  if (/souvenir|gift shop/.test(l)) return 'souvenir';
  if (/book store|bookstore|bookshop|libreria/.test(l)) return 'libreria';
  if (/church|cathedral|basilica|chapel/.test(l)) return 'chiesa';
  if (/mosque|synagogue/.test(l)) return 'santuario';
  if (/pharmacy|drugstore|farmacia|chemist/.test(l)) return 'farmacia';
  if (/supermarket|supermercato|grocery store|hypermarket/.test(l)) return 'supermercato';
  if (/zoo|wildlife park|safari park|animal park/.test(l)) return 'zoo';
  if (/aquarium|acquario/.test(l)) return 'acquario';
  if (/bakery|grocery|food store/.test(l)) return 'cibo';
  if (/transport|station|airport|bus stop|train|metro|subway/.test(l)) return 'trasporto';
  if (/hotel|hostel|accommodation|lodging|resort/.test(l)) return 'alloggio';
  return 'attrazione';
}

function extractCity(address) {
  if (!address) return null;
  let parts = address.split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) return toEnglish(parts[0].replace(/^\d+\s+/, '').trim());

  // Pattern CAP + città: "150-0042 Tokyo", "〒150-0042 Tokyo", "75001 Paris"
  for (const part of parts) {
    const m = part.match(/^[〒]?\d{3,5}[-\s]?\d{0,4}\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{1,25})$/);
    if (m) {
      const city = toEnglish(m[1].trim());
      if (city) return city;
    }
  }

  if (parts.length > 1 && /^[A-Za-zÀ-ÿ\s]+$/.test(parts[parts.length - 1])) {
    parts = parts.slice(0, -1);
  }
  parts = parts.filter(p => !/^\d[\d\s\-]*$/.test(p));
  if (!parts.length) return null;

  const last = parts[parts.length - 1];
  const stripped = last.replace(/\s+[\dA-Z][\d\-A-Z]+$/, '').trim();
  if (stripped && stripped !== last) {
    if (/^[A-Z]{2,3}$/.test(stripped) && parts.length >= 2) {
      return toEnglish(parts[parts.length - 2].replace(/^\d+\s+/, '').trim());
    }
    return toEnglish(stripped);
  }
  return toEnglish(last.replace(/^\d+\s+/, '').trim());
}

// ── Import ──────────────────────────────────────────────────────────────────

async function scrapeGoogleMaps(url) {
  if (!isGoogleMapsUrl(url)) {
    throw new Error('URL non valido: deve essere un link Google Maps (google.com/maps o maps.app.goo.gl)');
  }

  const placeUrl = await resolvePlaceUrl(url);

  const nameFromUrl = nameFromMapsUrl(placeUrl);
  const address = addressFromMapsUrl(placeUrl);
  const city = extractCity(address);
  const coords = coordsFromMapsUrl(placeUrl) || coordsFromMapsUrl(url);

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const fullPathText = extractFullPathText(placeUrl) || extractFullPathText(url);
  const apiData = await fetchPlaceViaApi(fullPathText || nameFromUrl, apiKey, 3);

  const name = apiData?.name || nameFromUrl;
  if (!name) {
    throw new Error('Impossibile estrarre il nome del posto. Verifica che il link punti a un luogo specifico.');
  }

  const category = mapTypesToCategory(apiData?.types) || mapToCategory(name);

  // Rete di sicurezza: nessun URL con una chiave API deve arrivare al DB.
  const photos = (apiData?.photos || []).filter(u => !/[?&]key=/i.test(u));

  return {
    name,
    city: city || null,
    category,
    notes: address ? toEnglish(address) : null,
    maps_link: url,
    photo_url: photos[0] || null,
    photos,
    lat: coords?.lat ?? null,
    lon: coords?.lon ?? null,
  };
}

module.exports = {
  scrapeGoogleMaps, isGoogleMapsUrl, coordsFromMapsUrl,
  // esportati per poter verificare la difesa SSRF
  safeLookup, isBlockedIp,
};
