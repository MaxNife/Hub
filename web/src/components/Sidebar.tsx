import { NavLink } from 'react-router-dom';
import { plural } from '../data';
import { useCategoryList } from '../live';
import { useTheme } from '../theme';
import { BrandMark, IconClock, IconHome, IconMoon, IconSearch, IconSettings, IconStar, IconSun, IconGrid } from './Icons';

const navClass = ({ isActive }: { isActive: boolean }) => `nav${isActive ? ' active' : ''}`;

export function Sidebar({ open, onSearch, drawer }: { open: boolean; onSearch: () => void; drawer?: boolean }) {
  const categories = useCategoryList();
  const { toggle } = useTheme();
  return (
    <aside className={`sidebar${open ? ' open' : ''}${drawer ? ' drawer' : ''}`} aria-label="Hub navigation">
      <NavLink to="/" className="brand">
        <BrandMark />
        <span className="brand-name">Hub</span>
      </NavLink>

      <button type="button" className="search-btn" onClick={onSearch}>
        <IconSearch size={18} />
        <span style={{ flexGrow: 1, textAlign: 'left' }}>Search apps</span>
        <kbd>Ctrl K</kbd>
      </button>

      <nav className="nav-list">
        <NavLink to="/" end className={navClass}><IconHome />Home</NavLink>
        <NavLink to="/apps" className={navClass}><IconGrid />All apps</NavLink>
        <NavLink to="/favorites" className={navClass}><IconStar />Favorites</NavLink>
        <NavLink to="/recent" className={navClass}><IconClock />Recently used</NavLink>
      </nav>

      <div className="nav-list">
        <span className="side-label">Categories</span>
        {categories.map((c) => (
          <NavLink key={c.name} to={`/c/${c.name}`} className={navClass} title={plural(c.count, 'app')}>
            <span className="dot" style={{ background: c.color }} />
            <span style={{ flexGrow: 1 }}>{c.name}</span>
            <span className="count">{c.count}</span>
          </NavLink>
        ))}
      </div>

      <div style={{ flexGrow: 1 }} />
      <NavLink to="/settings" className={navClass}><IconSettings />Settings</NavLink>
      <div className="side-foot">
        <span className="avatar">H</span>
        <span style={{ fontSize: 15, flexGrow: 1 }}>Hope</span>
        <button type="button" className="theme-btn" onClick={toggle} aria-label="Toggle dark mode" title="Toggle dark mode">
          <IconSun size={18} className="only-dark" />
          <IconMoon size={18} className="only-light" />
        </button>
      </div>
    </aside>
  );
}
