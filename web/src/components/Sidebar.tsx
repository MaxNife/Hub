import { NavLink } from 'react-router-dom';
import { plural } from '../data';
import { useCategoryList } from '../live';
import { useTheme } from '../theme';
import { BrandMark, IconClock, IconGrid, IconHome, IconMoon, IconSliders, IconStar, IconSun } from './Icons';

const navClass = ({ isActive }: { isActive: boolean }) => `nav${isActive ? ' active' : ''}`;

export function Sidebar({ open, drawer }: { open: boolean; drawer?: boolean }) {
  const categories = useCategoryList();
  const { toggle } = useTheme();
  return (
    <aside className={`sidebar${open ? ' open' : ''}${drawer ? ' drawer' : ''}`}>
      <NavLink to="/" className="brand" aria-label="Hub home">
        <BrandMark />
        <span className="brand-name">Hub</span>
      </NavLink>

      <nav className="nav-list" aria-label="Main">
        <NavLink to="/" end className={navClass}><IconHome size={18} />Home</NavLink>
        <NavLink to="/apps" className={navClass}><IconGrid size={18} />All apps</NavLink>
        <NavLink to="/favorites" className={navClass}><IconStar size={18} />Favorites</NavLink>
        <NavLink to="/recent" className={navClass}><IconClock size={18} />Recent</NavLink>
      </nav>

      {categories.length > 0 && (
        <nav className="nav-list" aria-label="Categories">
          <p className="side-label">Categories</p>
          {categories.map((c) => (
            <NavLink key={c.name} to={`/c/${c.name}`} className={(s) => `${navClass(s)} cat`} title={plural(c.count, 'app')}>
              <span>{c.name}</span>
              <span className="count">{c.count}</span>
            </NavLink>
          ))}
        </nav>
      )}

      <div style={{ flexGrow: 1 }} />
      <NavLink to="/settings" className={navClass}><IconSliders size={18} />Settings</NavLink>
      <div className="side-foot">
        <span className="avatar" aria-hidden="true">H</span>
        <span className="side-name">Hope</span>
        <button type="button" className="round-btn" onClick={toggle} aria-label="Toggle dark mode" title="Toggle dark mode">
          <IconSun size={18} className="only-dark" />
          <IconMoon size={18} className="only-light" />
        </button>
      </div>
    </aside>
  );
}
