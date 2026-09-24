import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useApps, useRecentEntries, type TileApp } from '../live';
import { useShell } from '../shell-context';
import { useTheme } from '../theme';
import { AppGlyph } from './ui';
import { IconGrid, IconHome, IconMoon, IconRefresh, IconSearch, IconSettings, IconStar } from './Icons';

// Ranks how well `q` matches `text`: prefix > word start > substring > in-order
// letters (the loose tier only for names, so descriptions don't match noise).
function score(q: string, text: string, loose = true): number {
  if (!q) return 1;
  const t = text.toLowerCase();
  const i = t.indexOf(q);
  if (i === 0) return 100;
  if (i > 0) return /[\s\-·]/.test(t[i - 1]) ? 80 : 60;
  if (!loose) return 0;
  let j = 0;
  for (const c of t) if (c === q[j]) j++;
  return j === q.length ? 20 : 0;
}

function appScore(q: string, a: TileApp): number {
  return Math.max(
    score(q, a.name),
    score(q, a.tags.join(' '), false) * 0.7,
    score(q, a.description, false) * 0.5,
    score(q, a.category, false) * 0.4,
  );
}

interface Item {
  key: string;
  group: 'Recent' | 'Apps' | 'Actions';
  label: string;
  hint: string;
  icon: ReactNode;
  run: () => void;
}

// Ctrl+K / "/" launcher over live apps (demo apps when the server is down).
// ↑/↓ select, Enter runs, Esc closes.
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const nav = useNavigate();
  const qc = useQueryClient();
  const { launch, toast } = useShell();
  const { toggle } = useTheme();
  const { apps, status } = useApps();
  const { data: recent } = useRecentEntries(6);
  const listRef = useRef<HTMLUListElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      returnFocus.current = document.activeElement;
      setQ('');
      setActive(0);
    } else if (returnFocus.current instanceof HTMLElement) {
      returnFocus.current.focus();
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const query = q.trim().toLowerCase();
    const installed = apps.filter((a) => a.installed);
    const appItem = (a: TileApp, group: Item['group']): Item => ({
      key: `${group}:${a.id}`,
      group,
      label: a.name,
      hint: [a.description, a.category].filter(Boolean).join(' · '),
      icon: <AppGlyph app={a} size={32} />,
      run: () => { onClose(); launch(a.id); },
    });
    const go = (path: string) => () => { onClose(); nav(path); };
    const actions: Item[] = [
      { key: 'a:home', group: 'Actions', label: 'Go home', hint: 'Dashboard', icon: <IconHome />, run: go('/') },
      { key: 'a:apps', group: 'Actions', label: 'All apps', hint: 'Install, hide and pin', icon: <IconGrid />, run: go('/apps') },
      { key: 'a:fav', group: 'Actions', label: 'Favorites', hint: 'Pinned apps', icon: <IconStar />, run: go('/favorites') },
      { key: 'a:settings', group: 'Actions', label: 'Settings', hint: 'Theme, rescan, manifests', icon: <IconSettings />, run: go('/settings') },
      { key: 'a:theme', group: 'Actions', label: 'Toggle dark mode', hint: 'Appearance', icon: <IconMoon />, run: () => { toggle(); onClose(); } },
      {
        key: 'a:rescan', group: 'Actions', label: 'Rescan apps folder', hint: 'Pick up new hub.json manifests', icon: <IconRefresh />,
        run: () => {
          onClose();
          fetch('/api/registry/rescan', { method: 'POST' })
            .then((r) => {
              if (!r.ok) throw new Error();
              qc.invalidateQueries();
              toast('Rescanned apps/');
            })
            .catch(() => toast('Rescan failed — is the Hub server running?'));
        },
      },
    ];

    if (!query) {
      const recentIds = status === 'live'
        ? (recent ?? []).map((r) => r.id)
        : installed.filter((a) => a.demoLastOpened).map((a) => a.id);
      const recentApps = recentIds
        .map((id) => installed.find((a) => a.id === id))
        .filter((a): a is TileApp => !!a)
        .slice(0, 4);
      const rest = installed.filter((a) => !recentApps.includes(a));
      return [
        ...recentApps.map((a) => appItem(a, 'Recent')),
        ...rest.map((a) => appItem(a, 'Apps')),
        ...actions,
      ];
    }
    const appHits = installed
      .map((a) => ({ a, s: appScore(query, a) }))
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s)
      .map((x) => appItem(x.a, 'Apps'));
    const actionHits = actions
      .map((a) => ({ a, s: Math.max(score(query, a.label), score(query, a.hint, false) * 0.5) }))
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s)
      .map((x) => x.a);
    return [...appHits, ...actionHits];
  }, [q, apps, status, recent, onClose, launch, nav, toggle, qc, toast]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const runActive = () => {
    items[active]?.run();
  };

  let lastGroup = '';
  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div
        className="palette" role="dialog" aria-modal="true" aria-label="Search apps and actions"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="palette-search">
          <IconSearch size={20} />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `pi-${items[active].key}` : undefined}
            placeholder="Search apps and actions…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => (items.length ? (i + 1) % items.length : 0));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                runActive();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              } else if (e.key === 'Tab') {
                e.preventDefault();
              }
            }}
          />
          <kbd>esc</kbd>
        </div>
        <ul id="palette-list" role="listbox" ref={listRef}>
          {items.map((item, i) => {
            const head = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.key} role="presentation">
                {head && <div className="palette-group">{head}</div>}
                <button
                  type="button"
                  id={`pi-${item.key}`}
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? 'active' : ''}
                  onMouseMove={() => setActive(i)}
                  onClick={() => item.run()}
                  tabIndex={-1}
                >
                  <span className={`palette-icon${item.group === 'Actions' ? ' action' : ''}`}>{item.icon}</span>
                  <span className="palette-text">
                    <b>{item.label}</b>
                    <small>{item.hint}</small>
                  </span>
                  <span className="palette-kind">{item.group === 'Actions' ? 'Action' : 'Open'}</span>
                </button>
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="palette-empty">No apps or actions match “{q}”.</li>
          )}
        </ul>
        <footer className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span className="spacer" />
          <span>{status === 'demo' ? 'Demo data' : `${apps.filter((a) => a.installed).length} apps`}</span>
        </footer>
      </div>
    </div>
  );
}
