// Categorie delle note: libere, definite dall'utente (es. "Attrazioni", "Gite",
// "Negozi"…). Non esiste un set fisso — si scrivono nell'editor e si riusano come
// suggerimenti. Qui teniamo solo helper di presentazione.

const PALETTE = [
  '#c26b4a', '#16a34a', '#0284c7', '#8b5cf6', '#10b981', '#ea580c',
  '#ec4899', '#a21caf', '#f59e0b', '#0891b2', '#6366f1', '#db2777',
]

// Colore stabile derivato dal nome, così la stessa categoria ha sempre lo stesso colore.
export function noteCatColor(name) {
  if (!name) return 'var(--text-light)'
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

// L'etichetta è il nome stesso scelto dall'utente.
export const noteCatLabel = c => c || ''

// Normalizza una categoria digitata (trim + limite lunghezza) o null se vuota.
export function normalizeCategory(value) {
  const v = (value || '').trim()
  return v ? v.slice(0, 50) : ''
}
