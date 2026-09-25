import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { plural } from '../data';
import { AppIcon } from '../components/AppIcon';
import { AppGlyph, AppTile, SkeletonGrid } from '../components/ui';
import {
  IconCalendar, IconChevronLeft, IconChevronRight, IconCloud, IconPlay, IconPlus, IconRefresh, IconSearch, IconShuffle,
  IconSliders, Shield,
} from '../components/Icons';
import { useCommands } from '../commands';
import { centerText, detailText, minuteText, pillLabel, useFootballFeed, useFootballSettings } from '../football';
import { api } from '../api';
import { useQueryClient } from '@tanstack/react-query';
import { healthBadge, useApps, type TileApp } from '../live';
import { inSentence, rerollMeal, useMealPick } from '../meal';
import { fmtSecs, useMemoryBest, useMemoryProgress } from '../memory';
import { useShell } from '../shell-context';
import { stagger } from '../motion';
import { eventText, tempText, useStatus } from '../status';

function greeting(date: Date) {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

// Re-renders on each minute boundary so the clock and live minute stay true.
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

// Row icon: the installed app's own icon, or the built-in artwork.
function RowIcon({ app, kind }: { app?: TileApp; kind: 'football' | 'meal' | 'memory' }) {
  return (
    <span className="row-icon">
      {app ? <AppGlyph app={app} size={64} /> : <span className="app-glyph"><AppIcon kind={kind} size={64} /></span>}
    </span>
  );
}

function HomeSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const clear = () => {
    setQ('');
    setActive(0);
  };
  const { items } = useCommands(q, clear);
  const results = q.trim() ? items.slice(0, 5) : [];
  const showList = open && q.trim().length > 0;

  return (
    <div
      className="home-search"
      ref={box}
      onFocus={() => setOpen(true)}
      onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false); }}
    >
      <label htmlFor="hub-search" className={`search-field${q ? ' has-query' : ''}`}>
        <IconSearch size={22} strokeWidth={2} />
        <span className="sr-only">Search Hub</span>
        <input
          id="hub-search"
          type="text"
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls="home-results"
          aria-activedescendant={showList && results[active] ? `hr-${results[active].key}` : undefined}
          placeholder="Open an app or run a command"
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => (results.length ? (i + 1) % results.length : 0));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              results[active]?.run();
            } else if (e.key === 'Escape') {
              clear();
              e.currentTarget.blur();
            }
          }}
        />
        <span className="search-hint d-only">Press<kbd>/</kbd></span>
      </label>
      {showList && (
        <div className="search-results" id="home-results" role="listbox">
          {results.length === 0 && <p className="search-empty">Nothing matches that. Try an app name, or “dark”.</p>}
          {results.map((r, i) => (
            <button
              key={r.key}
              id={`hr-${r.key}`}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`cmd-row${i === active ? ' active' : ''}`}
              onMouseMove={() => setActive(i)}
              onClick={() => r.run()}
            >
              <span className={`cmd-icon${r.kind === 'Action' ? ' action' : ''}`}>{r.icon}</span>
              <span className="cmd-text"><b>{r.label}</b></span>
              <span className="cmd-kind always">{r.kind}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FootballRow({ now, app }: { now: Date; app?: TileApp }) {
  const [settings] = useFootballSettings();
  const source = useFootballFeed(settings, app, now);
  const qc = useQueryClient();
  const [raw, setRaw] = useState(0);
  const [checking, setChecking] = useState(false);

  if (source.kind === 'offline' || source.kind === 'error' || source.kind === 'loading') {
    const retry = async () => {
      setChecking(true);
      await api('/api/apps/football/check', { method: 'POST' }).catch(() => {});
      await qc.invalidateQueries({ queryKey: ['apps'] });
      await qc.invalidateQueries({ queryKey: ['football-feed'] });
      setChecking(false);
    };
    return (
      <div className="today-row">
        <RowIcon app={app} kind="football" />
        <div>
          <p className="row-title">
            {source.kind === 'loading' ? 'Checking the scores…' : source.kind === 'offline' ? 'Football is offline' : 'No scores right now'}
          </p>
          <p className="row-sub">
            {source.kind === 'offline'
              ? 'Its service isn’t answering. Start it, then retry.'
              : source.kind === 'error' ? source.message : 'One moment.'}
          </p>
        </div>
        {source.kind !== 'loading' && (
          <button type="button" className="pill-btn" onClick={retry} disabled={checking}>
            <IconRefresh size={16} className={checking ? 'spin' : ''} /><span className="d-only">{checking ? 'Checking…' : 'Retry'}</span>
          </button>
        )}
      </div>
    );
  }

  const { feed } = source;
  const n = feed.matches.length;
  const idx = n ? ((raw % n) + n) % n : 0;
  const match = feed.matches[idx];

  if (!match) {
    return (
      <div className="today-row">
        <RowIcon app={app} kind="football" />
        <div>
          <p className="row-title">No matches to show</p>
          <p className="row-sub">Pick some leagues or clubs for the Football widget.</p>
        </div>
        <Link to="/settings/football" className="pill-btn">Choose leagues</Link>
      </div>
    );
  }

  const minute = minuteText(match);
  return (
    <div
      className="today-row football-row"
      role="group"
      aria-roledescription="carousel"
      aria-label="Football"
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') setRaw(idx - 1);
        if (e.key === 'ArrowRight') setRaw(idx + 1);
      }}
    >
      <RowIcon app={app} kind="football" />
      <div className="fb-body">
        <div className="fb-meta">
          <span className={`fb-pill ${feed.mode}`}>
            {pillLabel(feed.mode)}
            {minute && <span className="m-only">&nbsp;{minute}</span>}
          </span>
          <span>{match.league}</span>
          <span className="d-only">{feed.note}</span>
          {source.kind === 'sample' && (
            <span className="fb-sample" title="Install the Football app for real scores">Sample data</span>
          )}
        </div>
        <div className="fb-teams" key={`${feed.mode}-${idx}`} aria-live="polite">
          <Shield color={match.home.color} code={match.home.code} />
          <span className="fb-team">{match.home.name}</span>
          <span className={`fb-center${match.state === 'pre' ? ' soft' : ''}`}>{centerText(match)}</span>
          <span className="fb-team">{match.away.name}</span>
          <Shield color={match.away.color} code={match.away.code} />
        </div>
        <p className="row-sub d-only">{detailText(match, now)}</p>
        <div className="fb-nav-m m-only">
          <Dots n={n} idx={idx} />
          <button type="button" className="icon-btn" onClick={() => setRaw(idx + 1)} aria-label="Next match">
            <IconChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="fb-nav d-only">
        <button type="button" className="round-btn" onClick={() => setRaw(idx - 1)} aria-label="Previous match" disabled={n < 2}>
          <IconChevronLeft size={16} />
        </button>
        <Dots n={n} idx={idx} />
        <button type="button" className="round-btn" onClick={() => setRaw(idx + 1)} aria-label="Next match" disabled={n < 2}>
          <IconChevronRight size={16} />
        </button>
        <Link to="/settings/football" className="icon-btn fb-settings" aria-label="Football settings" title="Football settings">
          <IconSliders size={18} />
        </Link>
      </div>
    </div>
  );
}

function Dots({ n, idx }: { n: number; idx: number }) {
  return (
    <span className="dots" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => <span key={i} className={i === idx ? 'on' : ''} />)}
    </span>
  );
}

function MealRow({ app }: { app?: TileApp }) {
  const { launch } = useShell();
  const meal = useMealPick();
  return (
    <div className="today-row">
      <RowIcon app={app} kind="meal" />
      <div>
        <p className="row-title" key={meal}>Tonight it's {inSentence(meal)}</p>
        <p className="row-sub">Picked by Meal picker</p>
      </div>
      <div className="row-actions">
        <button type="button" className="text-link d-only" onClick={() => launch('meal-picker')}>Edit list</button>
        <button type="button" className="pill-btn" onClick={rerollMeal} aria-label="Reroll tonight's meal">
          <IconShuffle size={16} strokeWidth={2} /><span className="d-only">Reroll</span>
        </button>
      </div>
    </div>
  );
}

function MemoryRow({ app }: { app?: TileApp }) {
  const { launch } = useShell();
  const progress = useMemoryProgress();
  const best = useMemoryBest();
  const glyph = useRef<HTMLSpanElement>(null);
  const open = () => launch('memory', glyph.current?.querySelector('.app-glyph'));
  return (
    <div className="today-row">
      <span ref={glyph}><RowIcon app={app} kind="memory" /></span>
      {progress ? (
        <div>
          <p className="row-title"><span className="d-only">Finish your Memory game</span><span className="m-only">Finish Memory</span></p>
          <div className="progress-line">
            <span className="bar" aria-hidden="true"><span style={{ width: `${(progress.pairs / progress.total) * 100}%` }} /></span>
            <span className="row-sub">
              {progress.pairs} of {progress.total} pairs<span className="d-only"> found</span>
            </span>
          </div>
        </div>
      ) : (
        <div>
          <p className="row-title">Play Memory</p>
          <p className="row-sub">{best !== null ? `Best time ${fmtSecs(best)}` : 'Match the pairs'}</p>
        </div>
      )}
      <button type="button" className="ink-btn" onClick={open}>
        <IconPlay size={14} />{progress ? 'Resume' : 'Play'}
      </button>
    </div>
  );
}

function YourApps({ apps, loading }: { apps: TileApp[]; loading: boolean }) {
  const nav = useNavigate();
  const progress = useMemoryProgress();
  const [filter, setFilter] = useState('All');
  const cats = Array.from(new Set(apps.map((a) => a.category))).sort();
  const tabs = [{ id: 'All', n: apps.length }, ...cats.map((c) => ({ id: c, n: apps.filter((a) => a.category === c).length }))];
  const shown = apps.filter((a) => filter === 'All' || a.category === filter);

  return (
    <section className="your-apps" aria-label="Your apps">
      <div className="your-apps-head">
        <h2>Your apps</h2>
        <div className="seg d-only" role="group" aria-label="Filter apps">
          {tabs.map((t) => (
            <button key={t.id} type="button" aria-pressed={filter === t.id} className={filter === t.id ? 'on' : ''} onClick={() => setFilter(t.id)}>
              {t.id} {t.n}
            </button>
          ))}
        </div>
        <Link to="/apps" className="text-link m-only">See all</Link>
      </div>
      {loading ? (
        <SkeletonGrid />
      ) : (
        <div className="tile-grid home-grid">
          {shown.map((a, i) => (
            <AppTile
              key={a.id}
              app={a}
              index={i}
              sub={a.description || a.category}
              badge={a.id === 'memory' && progress ? 'running' : healthBadge(a)}
            />
          ))}
          <div className="app-tile add-tile" style={stagger(shown.length)}>
            <button type="button" className="tile" onClick={() => nav('/settings')}>
              <span className="tile-icon"><span className="add-box"><IconPlus size={24} /></span></span>
              <span className="tile-text">
                <span className="tile-name"><span className="d-only">Add an app</span><span className="m-only">Add app</span></span>
                <span className="tile-sub">Drop a folder into apps/</span>
              </span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// Weather and next event from /api/status. A provider that's configured
// but failing shows a dash; an unset weather location offers to set one.
function StatusItems() {
  const { data } = useStatus();
  if (!data) return null;
  const { weather, nextEvent } = data;
  return (
    <>
      {weather.configured ? (
        <Link to="/settings/status" className="status-item" title={weather.value ? `${weather.value.place}: high ${weather.value.high}°, low ${weather.value.low}°` : weather.error}>
          <IconCloud size={16} />{weather.value ? `${tempText(weather.value)} ${weather.value.label}` : '—'}
        </Link>
      ) : (
        <Link to="/settings/status" className="status-item d-only faint">Add weather</Link>
      )}
      {nextEvent.configured && (nextEvent.value || nextEvent.error) && (
        <Link to="/settings/status" className="status-item d-only" title={nextEvent.value?.location ?? nextEvent.error}>
          <IconCalendar size={16} />{nextEvent.value ? eventText(nextEvent.value) : '—'}
        </Link>
      )}
    </>
  );
}

export function Home() {
  const now = useNow();
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const { apps, status } = useApps();
  const installed = apps.filter((a) => a.installed);
  const offline = installed.filter((a) => a.offline).length;
  const find = (id: string) => installed.find((a) => a.id === id);

  return (
    <div className="home">
      <div className="home-status">
        <span>{dateStr}</span>
        <div className="home-status-right">
          <span>{timeStr}</span>
          <StatusItems />
          {status === 'demo' && <span className="ready d-only"><span className="dot warn" />Demo data</span>}
          {status === 'live' && (
            <span className="ready d-only">
              <span className={`dot${offline ? ' bad' : ''}`} />
              {offline ? `${offline} of ${installed.length} offline` : `${plural(installed.length, 'app')} ready`}
            </span>
          )}
        </div>
      </div>
      <h1 className="home-title">{greeting(now)}, Hope</h1>
      <HomeSearch />

      <section className="today" aria-label="Today">
        <FootballRow now={now} app={status === 'live' ? find('football') : undefined} />
        {(status !== 'live' || find('meal-picker')) && <MealRow app={find('meal-picker')} />}
        {(status !== 'live' || find('memory')) && <MemoryRow app={find('memory')} />}
      </section>

      <YourApps apps={installed} loading={status === 'loading'} />
    </div>
  );
}
