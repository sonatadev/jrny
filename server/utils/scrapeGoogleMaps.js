'use strict';

const https = require('https');
const http = require('http');

const MAX_REDIRECTS = 10;

// Blocca host interni/privati per mitigare SSRF tramite redirect (es. metadata cloud 169.254.169.254)
function isBlockedHost(hostname) {
  if (!hostname) return true;
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, ''); // rimuove parentesi IPv6
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true;
  if (h === '::1' || h === '0.0.0.0') return true;
  // IPv4 letterale in range privati/loopback/link-local
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [parseInt(m[1]), parseInt(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;           // link-local / metadata
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16/12
    if (a === 192 && b === 168) return true;           // 192.168/16
  }
  // IPv6 private/loopback letterale
  if (/^(fc|fd|fe80)/.test(h)) return true;
  return false;
}

// ── Google Places API photo helpers ──────────────────────────────────────────

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'jrny-app/1.0',
        'Accept': 'application/json',
      },
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, body }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('timeout')));
  });
}

// Resolves a Places API photo reference to a direct CDN URL.
// Solo l'URL finale su googleusercontent.com viene restituito: l'URL dell'API
// contiene la chiave in chiaro e finirebbe nel DB e nel tag <img> di ogni
// client. Se il redirect non si risolve, meglio nessuna foto che una chiave
// pubblicata.
async function resolvePhotoRef(ref, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${ref}&key=${apiKey}`;
  const { location } = await httpsGet(url);
  if (location && location.includes('googleusercontent.com')) return location;
  return null;
}

// Find a place via Places API using the full path text as the search query.
// Maps Google Places API types[] to our internal category keys.
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

// Returns { name, types, photos } — name is the canonical business name, types are Google place types.
async function fetchPlaceViaApi(searchText, apiKey, max = 3) {
  if (!apiKey) return null;
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
    console.warn('[Maps Import] Places API failed:', err.message);
    return null;
  }
}

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

// Follow redirects, tracking cookies across the chain (needed for Google's GDPR consent wall).
// Also captures the first google.com/maps/place/ URL seen, which carries the full name+address.
function fetchPage(urlStr, redirects = 0, cookies = {}, firstMapsUrl = null) {
  return new Promise((resolve, reject) => {
    if (redirects > MAX_REDIRECTS) return reject(new Error('Too many redirects'));

    let parsed;
    try { parsed = new URL(urlStr); }
    catch { return reject(new Error('URL non valido')); }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
      return reject(new Error('Protocollo non consentito'));
    if (isBlockedHost(parsed.hostname))
      return reject(new Error('Host non consentito'));

    const proto = parsed.protocol === 'https:' ? https : http;
    const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');

    const req = proto.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        ...(cookieStr ? { Cookie: cookieStr } : {}),
      },
    }, (res) => {
      // Collect Set-Cookie headers from every hop
      const newCookies = { ...cookies };
      const setCookies = [].concat(res.headers['set-cookie'] || []);
      for (const sc of setCookies) {
        const eqIdx = sc.indexOf('=');
        const semi  = sc.indexOf(';');
        if (eqIdx > 0) {
          const name = sc.slice(0, eqIdx).trim();
          const val  = sc.slice(eqIdx + 1, semi > eqIdx ? semi : undefined).trim();
          newCookies[name] = val;
        }
      }

      const loc = res.headers.location;
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && loc) {
        const next = loc.startsWith('http') ? loc : new URL(loc, urlStr).toString();
        // Keep track of the first google.com/maps/place/ URL we see in the chain
        const keepMapsUrl = firstMapsUrl ||
          (next.includes('google.com/maps/place/') ? next : null);
        res.resume();
        return fetchPage(next, redirects + 1, newCookies, keepMapsUrl).then(resolve).catch(reject);
      }

      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { if (body.length < 1024 * 1024) body += chunk; });
      res.on('end', () => resolve({ body, finalUrl: urlStr, firstMapsUrl: firstMapsUrl || urlStr }));
      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Request timeout')));
    req.end();
  });
}

// Return the full decoded path text from a google.com/maps/place/ URL (used as Places API search query)
function extractFullPathText(url) {
  try {
    const m = new URL(url).pathname.match(/\/maps\/(?:place|search)\/([^/@?]+)/);
    if (!m) return null;
    return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
  } catch { return null; }
}

// Extract place name from the URL path (fallback when Places API is unavailable).
// Detects address-first format (path starts with country or postal code) and picks
// the name from the last component rather than the first in those cases.
function nameFromMapsUrl(url) {
  try {
    const full = extractFullPathText(url);
    if (!full) return null;
    const parts = full.split(',').map(s => s.trim()).filter(Boolean);
    if (!parts.length) return null;
    const first = parts[0];
    // Address-first: starts with country name, postal code, or known address pattern
    const isAddressFirst =
      /^[A-Za-z]{2,}$/.test(first) && first.length > 3 && // likely a country word
      parts.length > 2 &&                                   // has real address depth
      /\d/.test(parts[1]);                                  // second part has digits (postal/street)
    if (isAddressFirst) {
      // Business name is the last component (strip address numbers from the front)
      const last = toEnglish(parts[parts.length - 1]) || '';
      return last.replace(/^\d[\d\s\-]*\s*/, '').trim() || toEnglish(first);
    }
    return toEnglish(first) || null;
  } catch { return null; }
}

// Extract place coordinates embedded in a Google Maps URL.
// Prefers the precise pin marker (!3d<lat>!4d<lon>) over the map center (@lat,lon,zoom),
// which can be offset from the actual place. Returns { lat, lon } or null.
function coordsFromMapsUrl(url) {
  if (!url) return null;
  const valid = (lat, lon) =>
    Number.isFinite(lat) && Number.isFinite(lon) &&
    Math.abs(lat) <= 90 && Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0);

  // Precise pin: ...!3d35.658581!4d139.745438...
  const pin = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (pin) {
    const lat = parseFloat(pin[1]), lon = parseFloat(pin[2]);
    if (valid(lat, lon)) return { lat, lon };
  }
  // Map center fallback: .../@35.658581,139.745438,17z...
  const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) {
    const lat = parseFloat(at[1]), lon = parseFloat(at[2]);
    if (valid(lat, lon)) return { lat, lon };
  }
  return null;
}

// Extract address (everything after the first comma in the path component)
function addressFromMapsUrl(url) {
  try {
    const full = extractFullPathText(url);
    if (!full) return null;
    const comma = full.indexOf(',');
    if (comma === -1) return null;
    return toEnglish(full.slice(comma + 1).trim());
  } catch { return null; }
}

// Strip characters outside printable ASCII + Latin Extended (removes CJK, Arabic, etc.)
// Also collapses any gaps left by removed characters (e.g. "6 階 3" → "6 3" → "6F 3" not needed, just clean space)
function toEnglish(str) {
  if (!str) return null;
  return str
    .replace(/[^\x20-\x7EÀ-ɏ]/g, ' ')  // replace non-Latin with space rather than nothing
    .replace(/\s+/g, ' ')
    .trim() || null;
}

function extractMeta(html, key) {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pats = [
    new RegExp(`<meta[^>]+property="${esc}"[^>]+content="([^"]*)"`, 'i'),
    new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="${esc}"`, 'i'),
    new RegExp(`<meta[^>]+name="${esc}"[^>]+content="([^"]*)"`, 'i'),
    new RegExp(`<meta[^>]+content="([^"]*)"[^>]+name="${esc}"`, 'i'),
  ];
  for (const p of pats) {
    const m = html.match(p);
    if (m) return decodeHtml(m[1]);
  }
  return null;
}

function decodeHtml(str) {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!m) return null;
  return toEnglish(decodeHtml(m[1]).replace(/\s*[-–|]\s*Google Maps$/i, '').trim());
}

function parseCategoryFromDescription(desc) {
  if (!desc) return null;
  const parts = desc.split(' · ');
  for (const part of parts) {
    const p = part.trim();
    if (!p.includes('★') && !p.match(/^[\d.]+$/) &&
        !p.includes(',') && !/\d{4}/.test(p) &&
        p.length > 2 && p.length < 60) return p;
  }
  return null;
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

function extractAddressFromDescription(desc) {
  if (!desc) return null;
  const parts = desc.split(' · ');
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i].trim();
    if (p.includes(',') || /\d/.test(p)) return p;
  }
  return null;
}

function extractCity(address) {
  if (!address) return null;
  let parts = address.split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) return toEnglish(parts[0].replace(/^\d+\s+/, '').trim());

  // Postal-code + city pattern: "150-0042 Tokyo" or "〒150-0042 Tokyo" or "75001 Paris"
  // Try this first — it's unambiguous when present
  for (const part of parts) {
    const m = part.match(/^[〒]?\d{3,5}[-\s]?\d{0,4}\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{1,25})$/);
    if (m) {
      const city = toEnglish(m[1].trim());
      if (city) return city;
    }
  }

  // Remove trailing country (all-alpha)
  if (parts.length > 1 && /^[A-Za-zÀ-ÿ\s]+$/.test(parts[parts.length - 1])) {
    parts = parts.slice(0, -1);
  }
  // Remove pure postal codes
  parts = parts.filter(p => !/^\d[\d\s\-]*$/.test(p));
  if (!parts.length) return null;

  const last = parts[parts.length - 1];
  // Strip trailing postal code: "Tokyo 160-0022" → "Tokyo"
  const stripped = last.replace(/\s+[\dA-Z][\d\-A-Z]+$/, '').trim();
  if (stripped && stripped !== last) {
    if (/^[A-Z]{2,3}$/.test(stripped) && parts.length >= 2) {
      return toEnglish(parts[parts.length - 2].replace(/^\d+\s+/, '').trim());
    }
    return toEnglish(stripped);
  }
  return toEnglish(last.replace(/^\d+\s+/, '').trim());
}

function extractOpeningHours(html) {
  const m = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try {
    const ld = JSON.parse(m[1]);
    if (ld.openingHoursSpecification) {
      return [].concat(ld.openingHoursSpecification).map(s => {
        const days = [].concat(s.dayOfWeek || [])
          .map(d => d.replace(/^https?:\/\/schema\.org\//, '')).join(', ');
        return `${days}: ${s.opens || '?'}–${s.closes || '?'}`;
      }).join('; ');
    }
    if (ld.openingHours) return [].concat(ld.openingHours).join('; ');
  } catch {}
  return null;
}

async function scrapeGoogleMaps(url) {
  if (!isGoogleMapsUrl(url)) {
    throw new Error('URL non valido: deve essere un link Google Maps (google.com/maps o maps.app.goo.gl)');
  }

  const { body: html, firstMapsUrl } = await fetchPage(url);

  if (!html || html.length < 500) {
    throw new Error('Impossibile recuperare i dati dalla pagina. Prova con un link Google Maps completo.');
  }

  // --- Name ---
  // Prefer og:title from successfully fetched page, fall back to URL path extraction
  const ogTitle = extractMeta(html, 'og:title');
  const titleTag = extractTitle(html);

  // Detect generic Google Maps page (consent or homepage fallback)
  const isGenericPage = !ogTitle ||
    ogTitle.toLowerCase().includes('google maps') ||
    (ogTitle.length < 5);

  let name;
  if (!isGenericPage) {
    name = toEnglish((ogTitle || titleTag || '').replace(/\s*[-–]\s*Google Maps$/i, '').trim());
  }
  // Always try URL-based extraction; use it if HTML gave nothing useful
  const nameFromUrl = nameFromMapsUrl(firstMapsUrl);
  if (!name && nameFromUrl) name = nameFromUrl;
  if (!name) throw new Error('Impossibile estrarre il nome del posto. Verifica che il link punti a un luogo specifico.');

  // --- Address + City ---
  const ogDesc = isGenericPage ? null : (extractMeta(html, 'og:description') || extractMeta(html, 'description'));
  const addressFromDesc = extractAddressFromDescription(ogDesc);
  // Fall back to address embedded in Maps URL path
  const addressFromUrl = addressFromMapsUrl(firstMapsUrl);
  const address = addressFromDesc || addressFromUrl;
  const city = extractCity(address);

  // --- Opening hours ---
  const openingHours = !isGenericPage ? extractOpeningHours(html) : null;

  // --- Notes ---
  const notesParts = [];
  if (address) notesParts.push(toEnglish(address));
  if (openingHours) notesParts.push(`Hours: ${openingHours}`);
  const notes = notesParts.join('\n') || null;

  // --- Places API: canonical name + types + photos ---
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const fullPathText = extractFullPathText(firstMapsUrl) || extractFullPathText(url);
  const apiData = apiKey ? await fetchPlaceViaApi(fullPathText || name, apiKey, 3) : null;

  // API name overrides URL-based name (handles address-first paths like "Japan, ... GEKIROCK CLOTHING")
  const finalName = apiData?.name || name;

  // --- Category ---
  // Priority: Places API types (most reliable) → og:description text → place name fallback
  const googleCat = parseCategoryFromDescription(isGenericPage ? null : ogDesc);
  const category = mapTypesToCategory(apiData?.types) || mapToCategory(googleCat || name);
  if (!finalName) throw new Error('Impossibile estrarre il nome del posto. Verifica che il link punti a un luogo specifico.');

  // --- Photos: HTML first, then API ---
  const seen = new Set();
  const htmlPhotos = [];
  if (!isGenericPage) {
    const ogImage = extractMeta(html, 'og:image');
    const candidates = [ogImage, ...(html.match(/https:\/\/lh\d\.googleusercontent\.com\/p\/[A-Za-z0-9_\-]+/g) || [])];
    for (const raw of candidates) {
      if (!raw || htmlPhotos.length >= 3) break;
      const base = raw.replace(/=\S+$/, '');
      if (!base.includes('googleusercontent.com/p/')) continue;
      const norm = base + '=w1200-h900-k-no';
      if (!seen.has(norm)) { seen.add(norm); htmlPhotos.push(norm); }
    }
  }

  // Rete di sicurezza: nessun URL con una chiave API deve poter arrivare al DB.
  let photos = (htmlPhotos.length > 0 ? htmlPhotos : (apiData?.photos || []))
    .filter(u => !/[?&]key=/i.test(u));
  if (photos.length === 0 && !apiKey) {
    console.log('[Maps Import] No photos: set GOOGLE_MAPS_API_KEY in .env to enable photo scraping');
  }

  const photo_url = photos[0] || null;

  // --- Coordinates: prefer the resolved place URL (has the pin), fall back to input ---
  const coords = coordsFromMapsUrl(firstMapsUrl) || coordsFromMapsUrl(url);

  return {
    name: finalName, city: city || null, category, notes, maps_link: url, photo_url, photos,
    lat: coords?.lat ?? null, lon: coords?.lon ?? null,
  };
}

module.exports = { scrapeGoogleMaps, isGoogleMapsUrl, coordsFromMapsUrl };
