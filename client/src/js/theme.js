export const THEMES = [
  { key: 'sunset', label: 'Sunset', color: '#e0785c', desc: 'Caldo, da viaggio' },
  { key: 'ocean',  label: 'Ocean',  color: '#0e8aa8', desc: 'Fresco, marino' },
  { key: 'forest', label: 'Forest', color: '#2f7d5b', desc: 'Naturale, calmo' },
  { key: 'rose',   label: 'Rose',   color: '#db2777', desc: 'Moderno, deciso' },
]

export const MODES = [
  { key: 'light', label: 'Chiaro' },
  { key: 'dark',  label: 'Scuro' },
]

export function getTheme() { return localStorage.getItem('jrny-theme') || 'sunset' }
export function getMode()  { return localStorage.getItem('jrny-mode')  || 'light' }

export function applyTheme(theme = getTheme(), mode = getMode()) {
  const el = document.documentElement
  el.setAttribute('data-theme', theme)
  el.setAttribute('data-mode', mode)
}

export function setTheme(theme) {
  localStorage.setItem('jrny-theme', theme)
  applyTheme(theme, getMode())
}

export function setMode(mode) {
  localStorage.setItem('jrny-mode', mode)
  applyTheme(getTheme(), mode)
}

// Allinea le preferenze locali a quelle dell'account (login / caricamento utente)
export function syncFromAccount(theme, mode) {
  if (theme) localStorage.setItem('jrny-theme', theme)
  if (mode) localStorage.setItem('jrny-mode', mode)
  applyTheme(theme || getTheme(), mode || getMode())
}
