// Destinazione a cui tornare dopo login/registrazione, letta da ?redirect=.
//
// Accetta solo percorsi interni: un valore come "//evil.example" o
// "https://evil.example" sarebbe un open redirect, cioè un modo per far
// atterrare l'utente su un sito esterno partendo da un link della nostra app.
export function safeRedirect(search, fallback = '/') {
  const raw = new URLSearchParams(search).get('redirect')
  if (!raw) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback
  return raw
}

// Propaga ?redirect= fra login e registrazione, così l'invito non si perde
// per chi deve prima crearsi l'account.
export function withRedirect(path, search) {
  const raw = new URLSearchParams(search).get('redirect')
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return path
  return `${path}?redirect=${encodeURIComponent(raw)}`
}
