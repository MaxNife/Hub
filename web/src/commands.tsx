import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useApps, useRecentEntries, type TileApp } from './live';
import { useShell } from './shell-context';
import { isDark, useTheme } from './theme';
import { rerollMeal } from './meal';
import { AppGlyph } from './components/ui';
import {
  IconGrid, IconHome, IconMoon, IconRefresh, IconSettings, IconShuffle, IconSliders, IconStar, IconSun,
} from './components/Icons';

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

export interface Command {
  key: string;
  group: 'Recent' | 'Apps' | 'Actions';
  kind: 'App' | 'Action';
  label: string;
  hint: string;
  icon: ReactNode;
  run: () => void;
}

// Apps and actions for a query. Empty query lists recents, apps, then actions.
// `done` runs after any command (close the palette, clear the search box).
export function useCommands(query: string, done: () => void): { items: Command[]; status: string; appCount: number } {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { launch, toast } = useShell();
  const { toggle, pref } = useTheme();
  const { apps, status } = useApps();
  const { data: recent } = useRecentEntries(6);

  const items = useMemo<Command[]>(() => {
    const q = query.trim().toLowerCase();
    const installed = apps.filter((a) => a.installed);
    const appItem = (a: TileApp, group: Command['group']): Command => ({
      key: `${group}:${a.id}`,
      group,
      kind: 'App',
      label: a.name,
      hint: [a.description, a.category].filter(Boolean).join(' · '),
      icon: <AppGlyph app={a} size={32} />,
      run: () => { done(); launch(a.id); },
    });
    const go = (path: string) => () => { done(); nav(path); };
    const dark = isDark();
    const action = (key: string, label: string, hint: string, icon: ReactNode, run: () => void): Command =>
      ({ key: `a:${key}`, group: 'Actions', kind: 'Action', label, hint, icon, run });
    const actions: Command[] = [
      action('reroll', 'Reroll tonight’s meal', 'Meal picker', <IconShuffle />, () => { done(); rerollMeal(); }),
      action('theme', dark ? 'Switch to light mode' : 'Switch to dark mode', 'Appearance', dark ? <IconSun /> : <IconMoon />, () => { toggle(); done(); }),
      action('football', 'Football settings', 'Leagues, clubs and the Home widget', <IconSliders />, go('/settings/football')),
      action('rescan', 'Rescan apps folder', 'Pick up new hub.json manifests', <IconRefresh />, () => {
        done();
        fetch('/api/registry/rescan', { method: 'POST' })
          .then((r) => {
            if (!r.ok) throw new Error();
            qc.invalidateQueries();
            toast('Rescanned apps/');
          })
          .catch(() => toast('Rescan failed — is the Hub server running?'));
      }),
      action('settings', 'Open settings', 'Theme, rescan, manifests', <IconSettings />, go('/settings')),
      action('home', 'Go home', 'Dashboard', <IconHome />, go('/')),
      action('apps', 'All apps', 'Install, hide and pin', <IconGrid />, go('/apps')),
      action('fav', 'Favorites', 'Pinned apps', <IconStar />, go('/favorites')),
    ];

    if (!q) {
      const recentIds = status === 'live'
        ? (recent ?? []).map((r) => r.id)
        : installed.filter((a) => a.demoLastOpened).map((a) => a.id);
      const recentApps = recentIds
        .map((id) => installed.find((a) => a.id === id))
        .filter((a): a is TileApp => !!a)
        .slice(0, 4);
      const rest = installed.filter((a) => !recentApps.includes(a));
      return [...recentApps.map((a) => appItem(a, 'Recent')), ...rest.map((a) => appItem(a, 'Apps')), ...actions];
    }
    const appHits = installed
      .map((a) => ({ a, s: appScore(q, a) }))
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s)
      .map((x) => appItem(x.a, 'Apps'));
    const actionHits = actions
      .map((a) => ({ a, s: Math.max(score(q, a.label), score(q, a.hint, false) * 0.5) }))
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s)
      .map((x) => x.a);
    return [...appHits, ...actionHits];
    // pref: recompute the theme action label when the theme changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, apps, status, recent, done, launch, nav, toggle, qc, toast, pref]);

  return { items, status, appCount: apps.filter((a) => a.installed).length };
}
