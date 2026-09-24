import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useShell } from '../shell-context';
import { categoryColor, plural } from '../data';
import { useTheme, type ThemePref } from '../theme';
import { AppGlyph, AppTile, DemoBanner, EmptyState, PageHeader, SkeletonGrid } from '../components/ui';
import {
  IconAlert, IconArrowLeft, IconCheck, IconClock, IconEyeOff, IconGrid, IconHome, IconMenu, IconMonitor,
  IconMoon, IconPlus, IconPopOut, IconRefresh, IconSearch, IconStar, IconStarFilled, IconSun,
} from '../components/Icons';
import {
  get, markOpened, useApps, useLiveApps, useRegistryErrors, type LiveApp, type RecentEntry, type TileApp,
} from '../live';

// Pin / install changes apply instantly and roll back if the server says no.
function useAppMutations() {
  const qc = useQueryClient();
  const { toast } = useShell();
  const patch = (id: string, change: Partial<LiveApp>) =>
    qc.setQueryData<LiveApp[]>(['apps'], (old) => old?.map((a) => (a.id === id ? { ...a, ...change } : a)));
  const send = (url: string, on: boolean, id: string, change: Partial<LiveApp>, undo: Partial<LiveApp>) => {
    patch(id, change);
    return fetch(url, { method: on ? 'POST' : 'DELETE' })
      .then((r) => {
        if (!r.ok) throw new Error();
      })
      .catch(() => {
        patch(id, undo);
        toast('That didn\'t save — is the Hub server running?');
      })
      .finally(() => {
        qc.invalidateQueries({ queryKey: ['categories'] });
        qc.invalidateQueries({ queryKey: ['recent'] });
      });
  };
  const setInstalled = (app: TileApp, on: boolean) => {
    send(`/api/apps/${app.id}/install`, on, app.id, { installed: on }, { installed: !on });
    if (on) toast(`${app.name} installed`);
    else toast(`${app.name} hidden`, { label: 'Undo', run: () => setInstalled(app, true) });
  };
  const setPinned = (app: TileApp, on: boolean) => {
    send(`/api/apps/${app.id}/pin`, on, app.id, { pinned: on }, { pinned: !on });
  };
  return { setInstalled, setPinned };
}

function useDemoGuard() {
  const { toast } = useShell();
  return (status: string, fn: () => void) => () => {
    if (status === 'live') fn();
    else toast('Demo data — start the Hub server to change apps');
  };
}

function PinButton({ app, onClick }: { app: TileApp; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`chip-btn pin${app.pinned ? ' on' : ''}`}
      onClick={onClick}
      aria-pressed={app.pinned}
    >
      {app.pinned ? <IconStarFilled size={14} /> : <IconStar size={14} />}
      {app.pinned ? 'Pinned' : 'Pin'}
    </button>
  );
}

export function Category() {
  const { name = '' } = useParams();
  const { apps, status } = useApps();
  const inCat = apps.filter((a) => a.installed && a.category.toLowerCase() === name.toLowerCase());
  return (
    <>
      <PageHeader
        title={name}
        eyebrow={<Link to="/" className="crumb"><IconArrowLeft size={14} />Home</Link>}
      >
        <span className="cat-chip" style={{ background: categoryColor(name) }} />
        <span className="muted-text">{plural(inCat.length, 'app')}</span>
      </PageHeader>
      {status === 'demo' && <DemoBanner />}
      {status === 'loading' ? (
        <SkeletonGrid count={4} />
      ) : inCat.length > 0 ? (
        <div className="recent-grid">
          {inCat.map((a, i) => <AppTile key={a.id} app={a} index={i} sub={a.description} />)}
        </div>
      ) : (
        <EmptyState
          icon={<IconGrid size={28} />}
          title={`Nothing in ${name} yet`}
          body="Apps you install in this category will show up here."
          action={<Link to="/apps" className="btn btn-primary">Browse all apps</Link>}
        />
      )}
    </>
  );
}

export function AllApps() {
  const { apps, status } = useApps();
  const { setInstalled, setPinned } = useAppMutations();
  const guard = useDemoGuard();
  const [filter, setFilter] = useState('All');
  const cats = ['All', ...Array.from(new Set(apps.map((a) => a.category)))];
  const shown = apps.filter((a) => filter === 'All' || a.category === filter);
  const installed = shown.filter((a) => a.installed);
  const notInstalled = shown.filter((a) => !a.installed);

  return (
    <>
      <PageHeader title="All apps" eyebrow={status === 'loading' ? 'Loading…' : `${plural(apps.filter((a) => a.installed).length, 'app')} installed`} />
      {status === 'demo' && <DemoBanner />}
      <div className="filter-row" role="tablist" aria-label="Filter by category">
        {cats.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={filter === c}
            className={`filter-chip${filter === c ? ' on' : ''}`}
            onClick={() => setFilter(c)}
          >
            {c !== 'All' && <span className="dot" style={{ background: categoryColor(c) }} />}
            {c}
          </button>
        ))}
      </div>
      {status === 'loading' ? (
        <SkeletonGrid />
      ) : (
        <>
          {installed.length > 0 ? (
            <div className="recent-grid">
              {installed.map((a, i) => (
                <AppTile
                  key={a.id}
                  app={a}
                  index={i}
                  sub={a.category}
                  actions={
                    <>
                      <PinButton app={a} onClick={guard(status, () => setPinned(a, !a.pinned))} />
                      <button type="button" className="chip-btn" onClick={guard(status, () => setInstalled(a, false))} title={`Hide ${a.name}`}>
                        <IconEyeOff size={14} />Hide
                      </button>
                    </>
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<IconGrid size={28} />}
              title="No installed apps here"
              body={filter === 'All' ? 'Install one below, or drop a folder into apps/ and rescan.' : `Nothing from ${filter} is installed.`}
            />
          )}
          {notInstalled.length > 0 && (
            <section className="section">
              <h2 className="section-title">Not installed</h2>
              <div className="recent-grid">
                {notInstalled.map((a, i) => (
                  <AppTile
                    key={a.id}
                    app={a}
                    index={i}
                    sub={a.description}
                    disabled
                    actions={
                      <button type="button" className="chip-btn on" onClick={guard(status, () => setInstalled(a, true))}>
                        <IconPlus size={14} />Install
                      </button>
                    }
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}

export function Favorites() {
  const { apps, status } = useApps();
  const { setPinned } = useAppMutations();
  const guard = useDemoGuard();
  const pinned = apps.filter((a) => a.installed && a.pinned);
  return (
    <>
      <PageHeader title="Favorites" eyebrow="Pinned apps, one tap away" />
      {status === 'demo' && <DemoBanner />}
      {status === 'loading' ? (
        <SkeletonGrid count={3} />
      ) : pinned.length === 0 ? (
        <EmptyState
          icon={<IconStar size={28} />}
          title="Nothing pinned yet"
          body="Pin the apps you reach for most and they'll live here."
          action={<Link to="/apps" className="btn btn-primary">Pick favorites</Link>}
        />
      ) : (
        <div className="recent-grid">
          {pinned.map((a, i) => (
            <AppTile
              key={a.id}
              app={a}
              index={i}
              sub={a.category}
              actions={<PinButton app={a} onClick={guard(status, () => setPinned(a, false))} />}
            />
          ))}
        </div>
      )}
    </>
  );
}

export function RecentPage() {
  const { apps, status } = useApps();
  const { data, isPending } = useQuery({
    queryKey: ['recent'],
    queryFn: () => get<RecentEntry[]>('/api/recent?limit=12'),
    retry: 1,
  });
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const demo = apps.filter((a) => a.demoLastOpened);
  return (
    <>
      <PageHeader title="Recently used" eyebrow="Your last dozen launches" />
      {status === 'demo' && <DemoBanner />}
      {isPending ? (
        <SkeletonGrid />
      ) : data && data.length > 0 ? (
        <div className="recent-grid">
          {data.map((r, i) => {
            const app = apps.find((a) => a.id === r.id);
            return app ? <AppTile key={r.id} app={app} index={i} sub={fmt(r.openedAt)} /> : null;
          })}
        </div>
      ) : status === 'demo' && demo.length > 0 ? (
        <div className="recent-grid">
          {demo.map((a, i) => <AppTile key={a.id} app={a} index={i} sub={a.demoLastOpened} />)}
        </div>
      ) : (
        <EmptyState
          icon={<IconClock size={28} />}
          title="No history yet"
          body="Open an app and it'll show up here."
          action={<Link to="/" className="btn btn-primary">Go home</Link>}
        />
      )}
    </>
  );
}

export function OpenApp() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { apps, status } = useApps();
  const { refetch, isFetching } = useLiveApps();
  const { openMenu, openSearch } = useShell();
  const app = apps.find((a) => a.id === id);
  const known = !!app?.installed;
  const name = app?.name ?? id;

  // Launch sequence: the splash stays until the iframe reports loaded AND a
  // short beat has passed, then fades. Opening also records the visit so
  // Recently used stays accurate on direct navigation.
  const [minDone, setMinDone] = useState(false);
  const [frameDone, setFrameDone] = useState(false);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    setMinDone(false);
    setFrameDone(false);
    setGone(false);
    markOpened(id);
    const t = setTimeout(() => setMinDone(true), 380);
    return () => clearTimeout(t);
  }, [id]);
  const launched = minDone && frameDone;
  useEffect(() => {
    if (!launched) return;
    const t = setTimeout(() => setGone(true), 450);
    return () => clearTimeout(t);
  }, [launched]);

  const chrome = (
    <AppChrome
      name={name} id={id} icon={app ? <AppGlyph app={app} size={28} /> : null}
      onMenu={openMenu} onHome={() => nav('/')} onSearch={openSearch}
    />
  );

  // Backend is up and has never heard of this app: explain, don't iframe.
  if (status === 'live' && !known) {
    return (
      <div className="appwrap">
        {chrome}
        <div className="appmessage">
          <EmptyState
            icon={<IconAlert size={28} />}
            title={`No app called “${id}”`}
            body="It may not be installed, or its manifest failed validation."
            action={
              <div className="row-gap">
                <Link to="/apps" className="btn btn-primary">All apps</Link>
                <Link to="/settings" className="btn btn-soft">Manifest errors</Link>
              </div>
            }
          />
        </div>
      </div>
    );
  }
  if (app?.offline) {
    return (
      <div className="appwrap">
        {chrome}
        <div className="appmessage">
          <EmptyState
            icon={<AppGlyph app={app} size={64} />}
            title={`${app.name} is offline`}
            body="The service didn't answer its health check. Start it, then retry."
            action={
              <button type="button" className="btn btn-primary" onClick={() => refetch()} disabled={isFetching}>
                <IconRefresh size={16} className={isFetching ? 'spin' : ''} />{isFetching ? 'Checking…' : 'Retry'}
              </button>
            }
          />
        </div>
      </div>
    );
  }
  return (
    <div className="appwrap">
      {chrome}
      <iframe
        key={id}
        className="appframe-full"
        title={name}
        src={`/apps/${id}/`}
        onLoad={() => setFrameDone(true)}
      />
      {!gone && (
        <div className={`splash${launched ? ' done' : ''}`}>
          <span className="splash-icon">
            {app && <AppGlyph app={app} size={96} />}
          </span>
          <div className="splash-name">{name}</div>
          <div className="splash-bar"><span /></div>
        </div>
      )}
    </div>
  );
}

function AppChrome({ name, id, icon, onMenu, onHome, onSearch }: {
  name: string; id: string; icon: ReactNode; onMenu: () => void; onHome: () => void; onSearch: () => void;
}) {
  return (
    <header className="appchrome">
      <button type="button" className="icon-btn" onClick={onMenu} aria-label="Menu" title="Menu"><IconMenu size={18} /></button>
      <button type="button" className="icon-btn" onClick={onHome} aria-label="Home" title="Home"><IconHome size={18} /></button>
      <span className="achrome-app">{icon}<b>{name}</b></span>
      <span style={{ flexGrow: 1 }} />
      <button type="button" className="achrome-search" onClick={onSearch}>
        <IconSearch size={16} /><span>Switch app</span><kbd>Ctrl K</kbd>
      </button>
      <a className="icon-btn" href={`/apps/${id}/`} target="_blank" rel="noreferrer" aria-label="Open in new tab" title="Open in new tab">
        <IconPopOut size={18} />
      </a>
    </header>
  );
}

const THEMES: { value: ThemePref; label: string; icon: ReactNode }[] = [
  { value: 'system', label: 'System', icon: <IconMonitor size={16} /> },
  { value: 'light', label: 'Light', icon: <IconSun size={16} /> },
  { value: 'dark', label: 'Dark', icon: <IconMoon size={16} /> },
];

export function Settings() {
  const { data: errors, refetch, isPending } = useRegistryErrors();
  const qc = useQueryClient();
  const { toast } = useShell();
  const { pref, set } = useTheme();
  const [scan, setScan] = useState<'idle' | 'busy' | 'done' | 'fail'>('idle');
  const doneTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(doneTimer.current), []);

  const rescan = async () => {
    setScan('busy');
    try {
      const r = await fetch('/api/registry/rescan', { method: 'POST' });
      if (!r.ok) throw new Error();
      await Promise.all([refetch(), qc.invalidateQueries()]);
      setScan('done');
      doneTimer.current = window.setTimeout(() => setScan('idle'), 2400);
    } catch {
      setScan('fail');
      toast('Rescan failed — is the Hub server running?');
    }
  };

  return (
    <>
      <PageHeader title="Settings" eyebrow="Make Hub yours" />
      <div className="settings-grid">
        <section className="panel">
          <h2 className="panel-title">Appearance</h2>
          <p className="panel-body">Follow your system, or pin Hub to light or dark.</p>
          <div className="segmented" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={pref === t.value}
                className={pref === t.value ? 'on' : ''}
                onClick={() => set(t.value)}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">Apps folder</h2>
          <p className="panel-body">
            Drop a folder with <code>hub.json</code> into <code>apps/</code>, then rescan.
          </p>
          <button type="button" className="btn btn-primary" onClick={rescan} disabled={scan === 'busy'}>
            {scan === 'done' ? <IconCheck size={16} /> : <IconRefresh size={16} className={scan === 'busy' ? 'spin' : ''} />}
            {scan === 'busy' ? 'Scanning…' : scan === 'done' ? 'Up to date' : 'Rescan apps/'}
          </button>
        </section>

        <section className="panel wide">
          <h2 className="panel-title">Manifest errors</h2>
          {isPending ? (
            <p className="panel-body">Checking…</p>
          ) : !errors ? (
            <p className="panel-body">Start the Hub server to validate manifests.</p>
          ) : errors.length === 0 ? (
            <p className="panel-body ok-text"><IconCheck size={16} /> Every manifest is valid.</p>
          ) : (
            <ul className="error-list">
              {errors.map((e) => (
                <li key={e.id}>
                  <IconAlert size={18} />
                  <div><b>{e.id}</b><span>{e.reason}</span></div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2 className="panel-title">Integrations</h2>
          <p className="panel-body">Weather and calendar feed the status strip on Home.</p>
          <ul className="integration-list">
            <li><span>Weather</span><span className="soon">Coming soon</span></li>
            <li><span>Calendar (ICS)</span><span className="soon">Coming soon</span></li>
          </ul>
        </section>

        <section className="panel">
          <h2 className="panel-title">Keyboard</h2>
          <ul className="shortcut-list">
            <li><span>Search apps and actions</span><span><kbd>Ctrl</kbd><kbd>K</kbd></span></li>
            <li><span>Quick search</span><span><kbd>/</kbd></span></li>
            <li><span>Move through results</span><span><kbd>↑</kbd><kbd>↓</kbd></span></li>
            <li><span>Close menu or palette</span><span><kbd>Esc</kbd></span></li>
          </ul>
        </section>
      </div>
    </>
  );
}
