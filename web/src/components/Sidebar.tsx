import { NavLink } from 'react-router-dom';
import { CATEGORIES } from '../data';

export function Sidebar({ open, onSearch, drawer }: { open: boolean; onSearch: () => void; drawer?: boolean }) {
  return (
    <aside className={`sidebar${open ? ' open' : ''}${drawer ? ' drawer' : ''}`}>
      <div className="brand">
        <div className="brand-grid">
          <span style={{ background: '#8b6cff' }} /><span style={{ background: '#ff9a3d' }} />
          <span style={{ background: '#2fc08f' }} /><span style={{ background: '#ff5c7a' }} />
        </div>
        <span className="brand-name">Hub</span>
      </div>

      <button type="button" className="search-btn" onClick={onSearch}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <span style={{ flexGrow: 1, textAlign: 'left' }}>Search apps</span>
        <kbd>Ctrl K</kbd>
      </button>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <NavLink to="/" className={({ isActive }) => `nav${isActive ? ' active' : ''}`}>Home</NavLink>
        <NavLink to="/favorites" className={({ isActive }) => `nav${isActive ? ' active' : ''}`}>Favorites</NavLink>
        <NavLink to="/recent" className={({ isActive }) => `nav${isActive ? ' active' : ''}`}>Recently used</NavLink>
      </nav>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="side-label">CATEGORIES</span>
        {CATEGORIES.map((c) => (
          <NavLink key={c.name} to={`/c/${c.name}`} className="nav">
            <span className="dot" style={{ background: c.color }} />
            <span style={{ flexGrow: 1 }}>{c.name}</span>
            <span className="count">{c.count}</span>
          </NavLink>
        ))}
      </div>

      <div style={{ flexGrow: 1 }} />
      <NavLink to="/settings" className="nav">Settings</NavLink>
      <div className="side-foot">
        <span className="avatar">H</span>
        <span style={{ fontSize: 15 }}>Hope</span>
      </div>
    </aside>
  );
}
