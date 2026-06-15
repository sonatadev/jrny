// City names are stored under their original `name` (often non-Latin, e.g. Japanese),
// which is also the key used to link wishlist places, day areas, etc.
// `name_en` holds the English/romanized label fetched from the geocoder for display.
// Always use this helper for user-facing labels; keep `name` for matching/keys.
export const cityLabel = (c) => (c && (c.name_en || c.name)) || ''

// Given a stored city name (the key, e.g. on a wishlist place) and the trip's
// city list, return its English label, falling back to the original name.
export const cityNameLabel = (cityName, cities) => {
  if (!cityName) return ''
  const match = cities?.find(c => c.name && c.name.toLowerCase() === cityName.toLowerCase())
  return (match && match.name_en) || cityName
}
