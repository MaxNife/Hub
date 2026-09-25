import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ShellProvider, reducedMotion, type ToastAction } from './shell-context';
import { Sidebar } from './components/Sidebar';
import { CommandPalette } from './components/CommandPalette';
import { BrandMark, IconMenu } from './components/Icons';
import { Home } from './pages/Home';
import { AllApps, Category, Favorites, OpenApp, RecentPage, Settings } from './pages/pages';
import { FootballSettings } from './pages/FootballSettings';
import { StatusSettings } from './pages/StatusSettings';
import { Login } from './pages/Login';
import { UNAUTHORIZED } from './api';
import { useSession } from './session';

const qc = new QueryClient();

interface ToastState extends Partial<{ action: ToastAction }> {
  id: number;
  text: string;
}

function Shell() {
  const [palette, setPalette] = useState(false);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const loc = useLocation();
  const nav = useNavigate();
  const isApp = loc.pathname.startsWith('/open/');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement
        && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((v) => !v);
      } else if (e.key === '/' && !typing) {
        // Home has its own search box; elsewhere "/" opens the palette.
        e.preventDefault();
        const box = document.getElementById('hub-search');
        if (box) box.focus();
        else setPalette(true);
      } else if (e.key === 'Escape') {
        setMenu(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Drawer never survives navigation.
  useEffect(() => {
    setMenu(false);
  }, [loc.pathname]);

  const showToast = useCallback((text: string, action?: ToastAction) => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, action });
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 6000 : 3200);
  }, []);

  // Launch: the clicked icon morphs into the splash icon via the View
  // Transitions API where available; plain navigation otherwise.
  const launch = useCallback((id: string, from?: Element | null) => {
    const go = () => nav(`/open/${id}`);
    if (!document.startViewTransition || reducedMotion() || !(from instanceof HTMLElement || from instanceof SVGElement)) {
      go();
      return;
    }
    from.style.viewTransitionName = 'app-icon';
    const t = document.startViewTransition(() => flushSync(go));
    t.finished.finally(() => { from.style.viewTransitionName = ''; });
  }, [nav]);

  const shell = {
    openMenu: () => setMenu(true),
    openSearch: () => setPalette(true),
    launch,
    toast: showToast,
  };

  return (
    <ShellProvider value={shell}>
      <div className="shell">
        <Sidebar open={menu} drawer={isApp} />
        <div className={`drawer-scrim${menu ? ' show' : ''}${isApp ? ' always' : ''}`} onClick={() => setMenu(false)} />
        <main className={`main${isApp ? ' appmode' : ''}`}>
          {!isApp && (
            <header className="topbar">
              <button type="button" className="icon-btn" onClick={() => setMenu(true)} aria-label="Open menu"><IconMenu size={20} /></button>
              <Link to="/" className="topbar-brand" aria-label="Hub home"><BrandMark size={20} /><span>Hub</span></Link>
              <Link to="/settings" className="icon-btn" aria-label="Profile, Hope"><span className="avatar sm" aria-hidden="true">H</span></Link>
            </header>
          )}
          <div key={isApp ? 'app' : loc.pathname} className={isApp ? 'appwrap-outer' : 'page'}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/c/:name" element={<Category />} />
              <Route path="/apps" element={<AllApps />} />
              <Route path="/open/:id" element={<OpenApp />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/football" element={<FootballSettings />} />
              <Route path="/settings/status" element={<StatusSettings />} />
              <Route path="/favorites" element={<Favorites />} />
              <Route path="/recent" element={<RecentPage />} />
            </Routes>
          </div>
        </main>
        <CommandPalette open={palette} onClose={() => setPalette(false)} />
        <div className="toast-region" role="status" aria-live="polite">
          {toast && (
            <div key={toast.id} className="toast">
              <span>{toast.text}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => { toast.action?.run(); setToast(null); }}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </ShellProvider>
  );
}

// Password gate: the shell only renders once Hub is happy with the session.
function Gate() {
  const client = useQueryClient();
  const { data, isPending } = useSession();
  useEffect(() => {
    const onUnauthorized = () => client.invalidateQueries({ queryKey: ['session'] });
    window.addEventListener(UNAUTHORIZED, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED, onUnauthorized);
  }, [client]);
  if (isPending) return null;
  if (data?.authRequired && !data.authenticated) return <Login />;
  return <Shell />;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
