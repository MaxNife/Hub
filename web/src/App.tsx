import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShellProvider } from './shell-context';
import { Sidebar } from './components/Sidebar';
import { CommandPalette } from './components/CommandPalette';
import { Home } from './pages/Home';
import { AllApps, Category, Favorites, OpenApp, RecentPage, Settings } from './pages/pages';

const qc = new QueryClient();

function Shell() {
  const [palette, setPalette] = useState(false);
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  const isApp = loc.pathname.startsWith('/open/');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Drawer never survives navigation.
  useEffect(() => {
    setMenu(false);
  }, [loc.pathname]);

  return (
    <ShellProvider value={{ openMenu: () => setMenu(true), openSearch: () => setPalette(true) }}>
      <div className="shell">
        <Sidebar open={menu} onSearch={() => setPalette(true)} drawer={isApp} />
        {isApp && menu && <div className="drawer-scrim" onClick={() => setMenu(false)} />}
        <main className={`main${isApp ? ' appmode' : ''}`}>
          {!isApp && (
            <>
              <svg className="deco" viewBox="0 0 600 600" width="700" height="700" fill="none" stroke="#d3c6ae" strokeWidth="1.6" style={{ right: -230, top: -300, opacity: 0.8 }}><ellipse cx="300" cy="300" rx="150" ry="116" /><ellipse cx="300" cy="300" rx="242" ry="198" /><ellipse cx="300" cy="300" rx="288" ry="240" /></svg>
              <div style={{ zIndex: 2, display: 'flex' }}>
                <button className="btn menu-btn" onClick={() => setMenu((v) => !v)}>Menu</button>
              </div>
            </>
          )}
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/c/:name" element={<Category />} />
            <Route path="/apps" element={<AllApps />} />
            <Route path="/open/:id" element={<OpenApp />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/recent" element={<RecentPage />} />
          </Routes>
        </main>
        <CommandPalette open={palette} onClose={() => setPalette(false)} />
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
