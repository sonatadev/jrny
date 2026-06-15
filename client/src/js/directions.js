// Keyless directions deep-links — no API key, no billing, all free.
// We open external providers prefilled with the route; real transit data
// (times/fares) lives behind paid APIs, so we hand off to their app/site.

// Map an app transport mode to a Google Maps travelmode.
export const modeTravel = (mode) => ({
  volo: 'transit', treno: 'transit', bus: 'transit', metro: 'transit',
  traghetto: 'transit', auto: 'driving', apiedi: 'walking', altro: 'transit',
}[mode] || 'transit')

// Simple Google Maps link (used by saved transport legs). origin/destination
// may be "lat,lng" (most precise) or a place/city name.
export function directionsUrl(origin, destination, travelmode = 'transit') {
  const params = new URLSearchParams({ api: '1', origin, destination, travelmode })
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

/* ── Country-aware provider registry ──────────────────────────────────────────
   A "point" is { name, coords } where coords is "lat,lng" or null.
   travelmode is a Google-style mode: 'transit' | 'driving' | 'walking'.
   Providers with prefilled:false only open a search page (deep-link limitation). */

const REGION_KEYWORDS = {
  japan: ['giappone', 'japan', 'nippon', '日本'],
  // estendibile: italy: ['italia','italy'], france: ['francia','france'], ...
}

export function detectRegion(destination = '') {
  const d = (destination || '').toLowerCase()
  return Object.entries(REGION_KEYWORDS).find(([, kws]) => kws.some(k => d.includes(k)))?.[0] || null
}

const slug = (s) => encodeURIComponent((s || '').trim().replace(/\s+/g, '-'))
const isApple = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)

// Per le tratte città→città usiamo il NOME (eventualmente col paese), non le
// coordinate: i nomi mostrano "Tokyo/Kyoto" invece di un indirizzo specifico.
const named = (p, region) => {
  if (!p || !p.name) return (p && p.coords) || ''
  return region ? `${p.name}, ${region}` : p.name
}

const PROVIDERS = [
  {
    id: 'google', label: 'Google Maps', emoji: '🗺️', prefilled: true, region: null,
    build: (from, to, tm, region) =>
      `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', origin: named(from, region), destination: named(to, region), travelmode: tm })}`,
  },
  {
    id: 'rome2rio', label: 'Rome2Rio', emoji: '🧭', prefilled: true, region: null,
    // Multimodale: mostra volo/treno/bus/auto insieme. Usa i nomi città.
    build: (from, to) => `https://www.rome2rio.com/s/${slug(from.name)}/${slug(to.name)}`,
  },
  {
    id: 'apple', label: 'Apple Maps', emoji: '🍎', prefilled: true, region: null,
    show: isApple,
    build: (from, to, tm, region) => {
      const dirflg = tm === 'driving' ? 'd' : tm === 'walking' ? 'w' : 'r'
      return `https://maps.apple.com/?${new URLSearchParams({ saddr: named(from, region), daddr: named(to, region), dirflg })}`
    },
  },
  // I provider per-paese (NAVITIME, Trainline, …) non sono pre-compilabili senza
  // station-id/API a pagamento → aprivano una pagina vuota, quindi esclusi.
  // detectRegion + il campo `region` restano per aggiungerne in futuro se utili.
]

// Providers applicable to a destination: globals + matching region, honoring show().
export function providersFor(destination) {
  const region = detectRegion(destination)
  return PROVIDERS.filter(p =>
    (p.region === null || p.region === region) && (!p.show || p.show())
  )
}
