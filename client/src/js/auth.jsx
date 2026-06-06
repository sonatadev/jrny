import { createContext, useContext, useState, useEffect } from 'react'
import { syncFromAccount } from './theme'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('tp_token')
    const storedUser = localStorage.getItem('tp_user')
    if (stored && storedUser) {
      const u = JSON.parse(storedUser)
      setToken(stored)
      setUser(u)
      if (u.theme || u.mode) syncFromAccount(u.theme, u.mode)
    }
    setLoading(false)
  }, [])

  function login(token, user) {
    localStorage.setItem('tp_token', token)
    localStorage.setItem('tp_user', JSON.stringify(user))
    setToken(token)
    setUser(user)
    if (user.theme || user.mode) syncFromAccount(user.theme, user.mode)
  }

  function logout() {
    localStorage.removeItem('tp_token')
    localStorage.removeItem('tp_user')
    setToken(null)
    setUser(null)
  }

  // Aggiorna i dati utente memorizzati (es. dopo modifica profilo)
  function updateUser(patch) {
    setUser(prev => {
      const next = { ...prev, ...patch }
      localStorage.setItem('tp_user', JSON.stringify(next))
      return next
    })
  }

  // Sostituisce il token della sessione corrente (es. dopo il cambio password,
  // che ruota token_version e invaliderebbe il vecchio token)
  function setSessionToken(newToken) {
    localStorage.setItem('tp_token', newToken)
    setToken(newToken)
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, updateUser, setSessionToken, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
