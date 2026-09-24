import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { plural } from '../data';
import { AppIcon } from '../components/AppIcon';
import { AppGlyph, AppTile, DemoBanner, SkeletonGrid } from '../components/ui';
import { stagger } from '../motion';
import { IconCalendar, IconCloud, IconPlay, IconPlus, IconShuffle } from '../components/Icons';
import { useApps, useCategoryList, useRecentEntries } from '../live';
import { reducedMotion, useShell } from '../shell-context';

function relTime(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  if (s < 2 * 86400) return 'yesterday';
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

function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: the pick just won't persist
  }
}

function greeting(date: Date) {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

// Re-renders on each minute boundary so the clock pill stays true.
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let t: number;
    const tick = () => {
      setNow(new Date());
      t = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    t = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => window.clearTimeout(t);
  }, []);
  return now;
}

// Same defaults as the Meal picker app; its saved list wins when present.
const DEFAULT_MEALS = [
  'Jollof rice and chicken', 'Spaghetti bolognese', 'Fried rice and turkey', 'Beans and plantain',
  'Egusi and pounded yam', 'Chicken salad', 'Noodles and eggs', 'Pizza night',
];

function savedMeals(): string[] {
  try {
    const v = JSON.parse(lsGet('meal-picker:meals') ?? 'null');
    if (Array.isArray(v) && v.length > 0 && v.every((m) => typeof m === 'string')) return v;
  } catch {
    // corrupt list: fall back to defaults
  }
  return DEFAULT_MEALS;
}

function MealWidget({ index }: { index: number }) {
  const { launch } = useShell();
  const [pick, setPick] = useState(() => lsGet('meal-picker:last') ?? DEFAULT_MEALS[0]);
  const [rolling, setRolling] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearInterval(timer.current), []);

  const reroll = () => {
    const meals = savedMeals();
    const choose = () => {
      const others = meals.filter((m) => m !== pick);
      const pool = others.length ? others : meals;
      return pool[Math.floor(Math.random() * pool.length)];
    };
    const finish = (winner: string) => {
      setPick(winner);
      setRolling(false);
      lsSet('meal-picker:last', winner);
    };
    if (reducedMotion()) {
      finish(choose());
      return;
    }
    setRolling(true);
    let n = 0;
    timer.current = window.setInterval(() => {
      n++;
      setPick(meals[Math.floor(Math.random() * meals.length)]);
      if (n >= 9) {
        window.clearInterval(timer.current);
        finish(choose());
      }
    }, 70);
  };

  return (
    <div className="widget widget-meal" style={stagger(index)}>
      <svg className="widget-motif" viewBox="0 0 200 200" aria-hidden="true"><circle cx="150" cy="150" r="80" /><circle cx="150" cy="150" r="58" /></svg>
      <span className="widget-label">Tonight's pick</span>
      <span className={`widget-title meal-pick${rolling ? ' rolling' : ''}`} aria-live="polite">{pick}</span>
      <div className="spacer" />
      <div className="widget-actions">
        <button type="button" className="btn btn-meal" onClick={reroll} disabled={rolling}>
          <IconShuffle size={16} />Reroll
        </button>
        <button type="button" className="btn-link" onClick={() => launch('meal-picker')}>Edit list</button>
      </div>
    </div>
  );
}

export function Home() {
  const { launch, toast } = useShell();
  const qc = useQueryClient();
  const now = useNow();
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const { apps, status } = useApps();
  const categories = useCategoryList();
  const { data: recentEntries } = useRecentEntries(6);
  const installed = apps.filter((a) => a.installed);
  const offline = installed.filter((a) => a.offline).length;
  const toInstall = apps.find((a) => !a.installed);
  const memoryApp = apps.find((a) => a.id === 'memory');
  const memoryGlyph = useRef<HTMLSpanElement>(null);

  // Recently used: real open times when live, demo order otherwise.
  const openedAt = new Map((recentEntries ?? []).map((e) => [e.id, e.openedAt]));
  const recent = status === 'live'
    ? [...installed].sort((a, b) => {
        const ao = openedAt.get(a.id);
        const bo = openedAt.get(b.id);
        if (ao && bo) return Date.parse(bo) - Date.parse(ao);
        if (ao) return -1;
        if (bo) return 1;
        return 0;
      }).slice(0, 6)
    : installed.slice(0, 6);

  const bestSecs = parseInt(lsGet('memory:best') ?? '', 10);
  const memoryBest = Number.isFinite(bestSecs)
    ? `Best time ${Math.floor(bestSecs / 60)}:${String(bestSecs % 60).padStart(2, '0')}`
    : 'Match the pairs';

  const install = (id: string, name: string) => {
    if (status !== 'live') {
      toast('Demo data — start the Hub server to install apps');
      return;
    }
    fetch(`/api/apps/${id}/install`, { method: 'POST' })
      .then((r) => {
        if (!r.ok) throw new Error();
        qc.invalidateQueries();
        toast(`${name} installed`, { label: 'Open', run: () => launch(id) });
      })
      .catch(() => toast(`Couldn't install ${name}`));
  };

  return (
    <>
      <header className="hero-head">
        <div>
          <p className="eyebrow">{dateStr}</p>
          <h1 className="hero-title">{greeting(now)}, Hope</h1>
        </div>
        <div className="pills">
          <span className="pill"><b>{timeStr}</b></span>
          <Link to="/settings" className="pill pill-ghost" title="Weather arrives with the status strip">
            <IconCloud size={16} />Connect weather
          </Link>
          <Link to="/settings" className="pill pill-ghost" title="Calendar arrives with the status strip">
            <IconCalendar size={16} />Connect calendar
          </Link>
          {status === 'demo' ? (
            <span className="pill"><span className="status-dot warn" />Demo data</span>
          ) : status === 'live' ? (
            <span className="pill">
              <span className={`status-dot${offline ? ' bad' : ' ok'}`} />
              {offline ? `${offline} of ${installed.length} offline` : `${plural(installed.length, 'app')} ready`}
            </span>
          ) : null}
        </div>
      </header>

      {status === 'demo' && <DemoBanner />}

      <section className="widgets" aria-label="Widgets">
        <div className="widget widget-football" style={stagger(0)}>
          <svg className="widget-motif pitch" viewBox="0 0 300 200" aria-hidden="true"><rect x="10" y="10" width="280" height="180" rx="4" /><path d="M150 10v180" /><circle cx="150" cy="100" r="34" /><rect x="10" y="60" width="40" height="80" /><rect x="250" y="60" width="40" height="80" /></svg>
          <div className="widget-row">
            <span className="badge">Preview</span>
            <span className="widget-label soft">Premier League</span>
          </div>
          <div className="score-lines">
            <div className="score-line"><span>Arsenal</span><b>2</b></div>
            <div className="score-line away"><span>Chelsea</span><b>1</b></div>
          </div>
          <span className="widget-foot">Sample match · live scores arrive with the Football app</span>
        </div>
        <MealWidget index={1} />
        <div className="widget widget-memory" style={stagger(2)}>
          <svg className="widget-motif" viewBox="0 0 200 200" aria-hidden="true"><rect x="96" y="30" width="56" height="76" rx="10" transform="rotate(12 124 68)" /><rect x="130" y="80" width="56" height="76" rx="10" transform="rotate(-8 158 118)" /></svg>
          <span className="widget-label">Jump back in</span>
          <div className="widget-row" style={{ gap: 14 }}>
            <span ref={memoryGlyph}>
              {memoryApp ? <AppGlyph app={memoryApp} size={60} /> : <span className="app-glyph"><AppIcon kind="memory" size={60} /></span>}
            </span>
            <div>
              <div className="widget-title sm">Memory</div>
              <div className="widget-sub">{memoryBest}</div>
            </div>
          </div>
          <div className="spacer" />
          <button type="button" className="btn btn-memory" onClick={() => launch('memory', memoryGlyph.current?.firstElementChild)}>
            <IconPlay size={14} />Play
          </button>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Recently used</h2>
          <div className="spacer" />
          {toInstall && (
            <span className="install-note">
              <span className="status-dot warn" />
              <span><b>{toInstall.name}</b> is ready to install</span>
              <button type="button" className="install-btn" onClick={() => install(toInstall.id, toInstall.name)}>
                <IconPlus size={14} />Install
              </button>
            </span>
          )}
          <Link to="/apps" className="see-all">See all {installed.length || ''} apps →</Link>
        </div>
        {status === 'loading' ? (
          <SkeletonGrid />
        ) : (
          <div className="recent-grid">
            {recent.map((a, i) => (
              <AppTile
                key={a.id}
                app={a}
                index={i}
                sub={openedAt.get(a.id) ? relTime(openedAt.get(a.id)!) : a.demoLastOpened ?? a.description ?? a.category}
              />
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">Browse by category</h2>
        <div className="cat-grid">
          {categories.map((c, i) => {
            const inCat = installed.filter((a) => a.category === c.name);
            return (
              <Link key={c.name} to={`/c/${c.name}`} className="cat-card" style={{ ...stagger(i), '--cat': c.color } as CSSProperties}>
                <div>
                  <div className="cat-name">{c.name}</div>
                  <div className="cat-count">{plural(c.count, 'app')}</div>
                </div>
                <div className="cat-icons">
                  {inCat.slice(0, 3).map((a) => (
                    <span key={a.id}><AppGlyph app={a} size={40} /></span>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}
