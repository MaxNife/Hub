import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShellProvider, reducedMotion, type ToastAction } from './shell-context';
import { Sidebar } from './components/Sidebar';
import { CommandPalette } from './components/CommandPalette';
import { BrandMark, IconMenu, IconSearch } from './components/Icons';
import { Home } from './pages/Home';
import { AllApps, Category, Favorites, OpenApp, RecentPage, Settings } from './pages/pages';

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
        e.preventDefault();
        setPalette(true);
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
        <Sidebar open={menu} onSearch={() => setPalette(true)} drawer={isApp} />
        <div className={`drawer-scrim${menu ? ' show' : ''}${isApp ? ' always' : ''}`} onClick={() => setMenu(false)} />
        <main className={`main${isApp ? ' appmode' : ''}`}>
          {!isApp && (
            <>
              <svg className="deco" viewBox="0 0 600 600" width="700" height="700" fill="none" strokeWidth="1.6" style={{ right: -230, top: -300 }} aria-hidden="true"><ellipse cx="300" cy="300" rx="150" ry="116" /><ellipse cx="300" cy="300" rx="242" ry="198" /><ellipse cx="300" cy="300" rx="288" ry="240" /></svg>
              <header className="topbar">
                <button type="button" className="icon-btn" onClick={() => setMenu(true)} aria-label="Open menu"><IconMenu /></button>
                <span className="topbar-brand"><BrandMark size={24} /><span>Hub</span></span>
                <button type="button" className="icon-btn" onClick={() => setPalette(true)} aria-label="Search apps"><IconSearch /></button>
              </header>
            </>
          )}
          <div key={isApp ? 'app' : loc.pathname} className={isApp ? 'appwrap-outer' : 'page'}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/c/:name" element={<Category />} />
              <Route path="/apps" element={<AllApps />} />
              <Route path="/open/:id" element={<OpenApp />} />
              <Route path="/settings" element={<Settings />} />
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

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
