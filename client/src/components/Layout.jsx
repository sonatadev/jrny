import { useNavigate } from 'react-router-dom'
import { useAuth } from '../js/auth'
import Icon from './Icon'
import ParticlesBg from './ParticlesBg'

export default function Layout({ children, title, backTo }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="layout">
      <div className="global-bg" aria-hidden="true">
        <div className="global-bg-orb" />
        <div className="global-bg-orb" />
        <div className="global-bg-orb" />
        <div className="global-bg-orb" />
        <div className="global-bg-orb" />
        <ParticlesBg count={20} color="rgba(99,102,241,.14)" />
      </div>

      <header className="header">
        <div className="header-brand">
          {backTo && (
            <button className="btn btn-ghost btn-icon header-back-btn" onClick={() => navigate(backTo)}>
              <Icon name="back" size={20} />
            </button>
          )}
          <span className="header-logo" onClick={() => navigate('/')}>
            <span className="header-logo-icon">
              <Icon name="plane" size={16} color="#fff" />
            </span>
            <span className="header-brand-name">jrny</span>
          </span>
          {title && <span className="header-trip-title">· {title}</span>}
        </div>
        <div className="header-actions">
          <div className="header-user">
            <div className="avatar header-avatar" title={user?.name}>
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <span className="header-username">{user?.name}</span>
            <button className="btn btn-ghost btn-sm header-logout" onClick={handleLogout}>Esci</button>
          </div>
        </div>
      </header>

      <main className="main">
        {children}
      </main>
    </div>
  )
}
