import { Link, useNavigate } from 'react-router-dom';
import { APPS } from '../data';
import { AppIcon } from '../components/AppIcon';
import { iconSrc, useCardApps, useCategoryList, useLiveApps, useRecentEntries } from '../live';

function relTime(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} days ago`;
  return new Date(iso).toLocaleDateString();
}

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Home() {
  const nav = useNavigate();
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const open = (id: string) => {
    fetch(`/api/apps/${id}/opened`, { method: 'POST' }).catch(() => {});
    nav(`/open/${id}`);
  };

  const { cards, live: backendUp } = useCardApps();
  const categories = useCategoryList();
  const { data: live } = useLiveApps();
  const { data: recentEntries } = useRecentEntries(6);
  const total = live !== undefined ? live.filter((a) => a.installed).length : APPS.length;

  // Recently used: backend order wins when live; mock order otherwise.
  const order = new Map((recentEntries ?? []).map((e) => [e.id, e.openedAt]));
  const ordered = backendUp
    ? [...cards].sort((a, b) => {
        const ao = order.get(a.app.id);
        const bo = order.get(b.app.id);
        if (ao && bo) return Date.parse(bo) - Date.parse(ao);
        if (ao) return -1;
        if (bo) return 1;
        return 0;
      }).slice(0, 6)
    : cards;

  // Widgets read the apps' own shared storage (same origin).
  const bestSecs = parseInt(lsGet('memory:best') ?? '', 10);
  const memoryBest = Number.isFinite(bestSecs)
    ? `Best time ${Math.floor(bestSecs / 60)}:${String(bestSecs % 60).padStart(2, '0')}`
    : 'Match the pairs';
  const tonightPick = lsGet('meal-picker:last') ?? 'Jollof rice and chicken';

  return (
    <>
      <header className="hero-head">
        <div>
          <p className="eyebrow">{dateStr}</p>
          <h1 className="hero-title">{greeting(now)}, Hope</h1>
        </div>
        <div className="pills">
          <span className="pill"><b>{timeStr}</b></span>
          <span className="pill"><b>29°</b>&nbsp;Partly cloudy</span>
          <span className="pill">Standup at 15:00</span>
          <span className="pill"><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1e9e4a' }} />5 of 6 apps running</span>
        </div>
      </header>

      <section className="widgets">
        <div className="widget widget-football">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ background: '#e5484d', fontSize: 12, fontWeight: 600, letterSpacing: 0.6, padding: '4px 9px', borderRadius: 999 }}>LIVE 67'</span>
            <span style={{ fontSize: 14, color: '#bfe6cf' }}>Premier League</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 20 }}><span style={{ flexGrow: 1 }}>Arsenal</span><b style={{ fontFamily: 'Bricolage Grotesque', fontSize: 32 }}>2</b></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 20, color: '#d3eddd' }}><span style={{ flexGrow: 1 }}>Chelsea</span><b style={{ fontFamily: 'Bricolage Grotesque', fontSize: 32 }}>1</b></div>
          </div>
        </div>
        <div className="widget widget-meal">
          <span style={{ fontSize: 14, fontWeight: 600 }}>Tonight's pick</span>
          <span style={{ fontFamily: 'Bricolage Grotesque', fontWeight: 700, fontSize: 30, lineHeight: 1.1 }}>{tonightPick}</span>
          <div className="spacer" />
          <button type="button" className="btn btn-dark" onClick={() => open('meal-picker')}>Reroll</button>
        </div>
        <div className="widget widget-memory">
          <span style={{ fontSize: 14, fontWeight: 600 }}>Jump back in</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <AppIcon kind="memory" size={60} />
            <div><div style={{ fontFamily: 'Bricolage Grotesque', fontWeight: 700, fontSize: 24 }}>Memory</div><div style={{ fontSize: 14, color: '#4b3fa0' }}>{memoryBest}</div></div>
          </div>
          <div className="spacer" />
          <button type="button" className="btn btn-navy" onClick={() => open('memory')}>Play</button>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="section-head">
          <h2 className="section-title">Recently used</h2>
          <div className="spacer" />
          <Link to="/apps" className="install-note"><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#e0a100' }} />Name generator is ready to install</Link>
          <Link to="/apps" style={{ fontSize: 14, fontWeight: 600, padding: '8px 4px' }}>See all {total} apps</Link>
        </div>
        <div className="recent-grid">
          {ordered.map((c) => {
            const sub = c.kind === 'live' && order.get(c.app.id)
              ? relTime(order.get(c.app.id)!)
              : c.sub;
            return (
              <button key={c.app.id} type="button" className="rcard" onClick={() => open(c.app.id)}>
                {c.kind === 'live'
                  ? <img className="ricon" src={iconSrc(c.app)} alt="" />
                  : <AppIcon kind={c.app.icon} />}
                <span className="name">{c.app.name}</span>
                <span className={`sub${sub === 'Offline' ? ' off' : ''}`}>{sub}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 className="section-title">Browse by category</h2>
        <div className="cat-grid">
          {categories.map((c) => (
            <Link key={c.name} to={`/c/${c.name}`} className="cat-card">
              <div><div className="cat-name">{c.name}</div><div className="cat-count">{c.count} apps</div></div>
              <div className="cat-icons">
                {APPS.filter((a) => a.category === c.name).slice(0, 3).map((a) => (
                  <span key={a.id}><AppIcon kind={a.icon} size={40} /></span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
