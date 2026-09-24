import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useShell } from '../shell-context';
import { APPS } from '../data';
import { AppIcon } from '../components/AppIcon';
import { get, iconSrc, useLiveApps, useRegistryErrors, type RecentEntry } from '../live';

function useAppMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['apps'] });
    qc.invalidateQueries({ queryKey: ['categories'] });
    qc.invalidateQueries({ queryKey: ['recent'] });
  };
  return {
    setInstalled: (id: string, on: boolean) =>
      fetch(`/api/apps/${id}/install`, { method: on ? 'POST' : 'DELETE' })
        .then(refresh).catch(() => {}),
    setPinned: (id: string, on: boolean) =>
      fetch(`/api/apps/${id}/pin`, { method: on ? 'POST' : 'DELETE' })
        .then(refresh).catch(() => {}),
  };
}

export function Category() {
  const { name } = useParams();
  const nav = useNavigate();
  const { data: live } = useLiveApps();
  const backendUp = live !== undefined;
  const liveApps = (live ?? []).filter(
    (a) => a.installed && a.category.toLowerCase() === (name ?? '').toLowerCase(),
  );
  const mockApps = APPS.filter((a) => a.category?.toLowerCase() === (name ?? '').toLowerCase());
  const open = (id: string) => {
    fetch(`/api/apps/${id}/opened`, { method: 'POST' }).catch(() => {});
    nav(`/open/${id}`);
  };
  return (
    <>
      <div className="section-head">
        <h1 className="hero-title" style={{ fontSize: 34 }}>{name}</h1>
        <div className="spacer" />
        <Link to="/">← Home</Link>
      </div>
      {backendUp ? (
        liveApps.length > 0 ? (
          <div className="recent-grid">
            {liveApps.map((a) => (
              <button key={a.id} className="rcard" onClick={() => open(a.id)}>
                <img className="ricon" src={iconSrc(a)} alt="" />
                <span className="name">{a.name}</span>
                <span className="sub">{a.description}</span>
              </button>
            ))}
          </div>
        ) : (
          <p style={{ color: '#6a6574' }}>No installed apps in {name} yet — add one in <Link to="/apps">All apps</Link>.</p>
        )
      ) : (
        <div className="recent-grid">
          {mockApps.map((a) => (
            <button key={a.id} className="rcard" onClick={() => open(a.id)}>
              <AppIcon kind={a.icon} />
              <span className="name">{a.name}</span>
              <span className="sub">{a.description}</span>
            </button>
          ))}
          {mockApps.length === 0 && <p style={{ color: '#6a6574' }}>No installed apps in this category yet.</p>}
        </div>
      )}
    </>
  );
}

export function AllApps() {
  const nav = useNavigate();
  const { data: live } = useLiveApps();
  const { setInstalled, setPinned } = useAppMutations();
  const open = (id: string) => {
    fetch(`/api/apps/${id}/opened`, { method: 'POST' }).catch(() => {});
    nav(`/open/${id}`);
  };
  if (live && live.length > 0) {
    const installed = live.filter((a) => a.installed);
    const notInstalled = live.filter((a) => !a.installed);
    return (
      <>
        <div className="section-head"><h1 className="hero-title" style={{ fontSize: 34 }}>All apps</h1></div>
        <div className="recent-grid">
          {installed.map((a) => (
            <div key={a.id} className="rcard">
              <button type="button" className="tile" onClick={() => open(a.id)}>
                <img className="ricon" src={iconSrc(a)} alt="" />
                <span className="name">{a.name}</span>
                <span className="sub">{a.category}</span>
              </button>
              <div className="card-actions">
                <button className={`chip-btn${a.pinned ? ' on' : ''}`} onClick={() => setPinned(a.id, !a.pinned)}>
                  {a.pinned ? '★ Pinned' : '☆ Pin'}
                </button>
                <button className="chip-btn" onClick={() => setInstalled(a.id, false)}>Hide</button>
              </div>
            </div>
          ))}
        </div>
        {notInstalled.length > 0 && (
          <>
            <h2 className="section-title" style={{ marginTop: 24 }}>Not installed</h2>
            <div className="recent-grid">
              {notInstalled.map((a) => (
                <div key={a.id} className="rcard">
                  <img className="ricon" src={iconSrc(a)} alt="" />
                  <span className="name">{a.name}</span>
                  <div className="card-actions">
                    <button className="chip-btn on" onClick={() => setInstalled(a.id, true)}>Install</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </>
    );
  }
  return (
    <>
      <div className="section-head"><h1 className="hero-title" style={{ fontSize: 34 }}>All apps</h1></div>
      <div className="recent-grid">
        {APPS.map((a) => (
          <button key={a.id} className="rcard" onClick={() => open(a.id)}>
            <AppIcon kind={a.icon} />
            <span className="name">{a.name}</span>
            <span className="sub">{a.category}</span>
          </button>
        ))}
      </div>
    </>
  );
}

export function Favorites() {
  const nav = useNavigate();
  const { data: live } = useLiveApps();
  const { setPinned } = useAppMutations();
  const open = (id: string) => {
    fetch(`/api/apps/${id}/opened`, { method: 'POST' }).catch(() => {});
    nav(`/open/${id}`);
  };
  const pinned = (live ?? []).filter((a) => a.installed && a.pinned);
  return (
    <>
      <div className="section-head"><h1 className="hero-title" style={{ fontSize: 34 }}>Favorites</h1></div>
      {!live ? (
        <p style={{ color: '#6a6574' }}>Start the Hub server to sync favorites.</p>
      ) : pinned.length === 0 ? (
        <p style={{ color: '#6a6574' }}>Nothing pinned yet — tap ☆ Pin on any app in All apps.</p>
      ) : (
        <div className="recent-grid">
          {pinned.map((a) => (
            <div key={a.id} className="rcard">
              <button type="button" className="tile" onClick={() => open(a.id)}>
                <img className="ricon" src={iconSrc(a)} alt="" />
                <span className="name">{a.name}</span>
                <span className="sub">{a.category}</span>
              </button>
              <div className="card-actions">
                <button className="chip-btn on" onClick={() => setPinned(a.id, false)}>★ Pinned</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function RecentPage() {
  const nav = useNavigate();
  const { data } = useQuery({
    queryKey: ['recent'],
    queryFn: () => get<RecentEntry[]>('/api/recent?limit=12'),
    retry: 1,
  });
  const open = (id: string) => {
    fetch(`/api/apps/${id}/opened`, { method: 'POST' }).catch(() => {});
    nav(`/open/${id}`);
  };
  return (
    <>
      <div className="section-head"><h1 className="hero-title" style={{ fontSize: 34 }}>Recently used</h1></div>
      {!data ? (
        <p style={{ color: '#6a6574' }}>Open some apps and they'll show up here.</p>
      ) : data.length === 0 ? (
        <p style={{ color: '#6a6574' }}>Nothing yet — open an app to start the history.</p>
      ) : (
        <div className="recent-grid">
          {data.map((a) => (
            <button key={a.id} className="rcard" onClick={() => open(a.id)}>
              <img className="ricon" src={iconSrc(a)} alt="" />
              <span className="name">{a.name}</span>
              <span className="sub">{new Date(a.openedAt).toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function SimplePage({ title, body }: { title: string; body: string }) {
  return (
    <>
      <h1 className="hero-title" style={{ fontSize: 34 }}>{title}</h1>
      <p style={{ color: '#6a6574' }}>{body}</p>
    </>
  );
}

export function OpenApp() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: live } = useLiveApps();
  const { openMenu } = useShell();
  const mock = APPS.find((a) => a.id === id);
  const liveApp = (live ?? []).find((a) => a.id === id);
  const known = liveApp?.installed || mock?.id === id;
  const name = liveApp?.name ?? mock?.name ?? id ?? 'App';

  // Launch sequence: the splash stays until the iframe reports loaded AND a
  // minimum beat has passed, then fades. Opening also records the visit so
  // Recently used stays accurate on direct navigation.
  const [minDone, setMinDone] = useState(false);
  const [frameDone, setFrameDone] = useState(false);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    setMinDone(false);
    setFrameDone(false);
    setGone(false);
    fetch(`/api/apps/${id}/opened`, { method: 'POST' }).catch(() => {});
    const t = setTimeout(() => setMinDone(true), 850);
    return () => clearTimeout(t);
  }, [id]);
  const launched = minDone && frameDone;
  useEffect(() => {
    if (!launched) return;
    const t = setTimeout(() => setGone(true), 500);
    return () => clearTimeout(t);
  }, [launched]);

  const icon = liveApp ? (
    <img src={iconSrc(liveApp)} alt="" width={32} height={32} style={{ borderRadius: 8 }} />
  ) : mock ? (
    <AppIcon kind={mock.icon} size={32} />
  ) : null;
  const bigIcon = liveApp ? (
    <img src={iconSrc(liveApp)} alt="" width={96} height={96} style={{ borderRadius: 24 }} />
  ) : mock ? (
    <AppIcon kind={mock.icon} size={96} />
  ) : null;

  // Backend is up and has never heard of this app: explain, don't iframe.
  if (live !== undefined && !known) {
    return (
      <div className="appwrap">
        <AppChrome name={name} id={id ?? ''} icon={icon} onMenu={openMenu} onHome={() => nav('/')} />
        <div className="appmessage">
          <h2>No app called “{id}”</h2>
          <p>It may not be installed, or its manifest failed validation.</p>
          <p><Link to="/apps">All apps</Link> · <Link to="/settings">Settings (manifest errors)</Link></p>
        </div>
      </div>
    );
  }
  if (mock?.offline) {
    return (
      <div className="appwrap">
        <AppChrome name={name} id={id ?? ''} icon={icon} onMenu={openMenu} onHome={() => nav('/')} />
        <div className="appmessage">
          <h2>{mock.name} is offline</h2>
          <p>The service didn't answer its health check. Start it, then retry.</p>
          <button className="btn btn-navy" onClick={() => location.reload()}>Retry</button>
        </div>
      </div>
    );
  }
  return (
    <div className="appwrap">
      <AppChrome name={name} id={id ?? ''} icon={icon} onMenu={openMenu} onHome={() => nav('/')} />
      <iframe
        key={id}
        className="appframe-full"
        title={name}
        src={`/apps/${id}/`}
        onLoad={() => setFrameDone(true)}
      />
      {!gone && (
        <div className={`splash${launched ? ' done' : ''}`}>
          {bigIcon}
          <div className="splash-name">{name}</div>
          <div className="splash-bar"><span /></div>
          <div className="splash-sub">Launching…</div>
        </div>
      )}
    </div>
  );
}

function AppChrome({ name, id, icon, onMenu, onHome }: {
  name: string; id: string; icon: ReactNode; onMenu: () => void; onHome: () => void;
}) {
  return (
    <header className="appchrome">
      <button type="button" className="achrome-btn" onClick={onMenu} title="Menu (sidebar)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      <button type="button" className="achrome-btn" onClick={onHome} title="Home">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M4 11l8-7 8 7v9h-5v-6h-6v6H4z" /></svg>
      </button>
      <span className="achrome-app">{icon}<b>{name}</b></span>
      <span style={{ flexGrow: 1 }} />
      <a className="achrome-btn" href={`/apps/${id}/`} target="_blank" rel="noreferrer" title="Open full screen">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 4h6v6M20 4l-9 9M18 13v6H5V6h6" /></svg>
      </a>
    </header>
  );
}

export function Settings() {
  const { data: errors, refetch } = useRegistryErrors();
  const [msg, setMsg] = useState('');
  const rescan = async () => {
    setMsg('Scanning…');
    try {
      await fetch('/api/registry/rescan', { method: 'POST' });
      await refetch();
      setMsg('Rescanned apps/.');
    } catch {
      setMsg('Rescan failed — is the Hub server running?');
    }
  };
  return (
    <>
      <h1 className="hero-title" style={{ fontSize: 34 }}>Settings</h1>
      <p style={{ color: '#6a6574' }}>
        Drop a folder with <code>hub.json</code> into <code>apps/</code>, then rescan.
      </p>
      <button className="btn btn-navy" onClick={rescan}>Rescan apps/</button>
      {msg && <p style={{ color: '#6a6574' }}>{msg}</p>}
      <h2 className="section-title" style={{ marginTop: 24 }}>Manifest errors</h2>
      {!errors || errors.length === 0 ? (
        <p style={{ color: '#6a6574' }}>None — every manifest is valid.</p>
      ) : (
        <ul>
          {errors.map((e) => (
            <li key={e.id}><b>{e.id}</b>: {e.reason}</li>
          ))}
        </ul>
      )}
    </>
  );
}
