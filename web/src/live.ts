import { useQuery } from '@tanstack/react-query';
import { APPS, CATEGORIES, categoryColor, type AppIconKind } from './data';

// Live API types (registry JSON). Falls back to demo data when the
// Go server isn't running (e.g. Vite dev without backend).
export interface LiveApp {
  id: string;
  name: string;
  description?: string;
  category: string;
  tags?: string[];
  type: 'static' | 'service';
  icon: string; // path inside the app folder
  installed: boolean;
  pinned: boolean;
  healthOk?: boolean;
}

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json() as Promise<T>;
}

export { get };

export function iconSrc(a: LiveApp): string {
  return `/apps/${a.id}/${a.icon}`;
}

// Records a visit once per launch (StrictMode and double handlers would
// otherwise log the same open twice).
let lastOpened = { id: '', at: 0 };
export function markOpened(id: string) {
  const now = Date.now();
  if (lastOpened.id === id && now - lastOpened.at < 1500) return;
  lastOpened = { id, at: now };
  fetch(`/api/apps/${id}/opened`, { method: 'POST' }).catch(() => {});
}

export function useLiveApps() {
  return useQuery({
    queryKey: ['apps'],
    queryFn: () => get<LiveApp[]>('/api/apps'),
    retry: 1,
    staleTime: 15_000,
  });
}

export interface LiveCategory {
  name: string;
  count: number;
}

export function useLiveCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => get<LiveCategory[]>('/api/categories'),
    retry: 1,
    staleTime: 15_000,
  });
}

export interface RecentEntry extends LiveApp {
  openedAt: string;
}

export interface RegistryError {
  id: string;
  reason: string;
}

export function useRecentEntries(limit = 6) {
  return useQuery({
    queryKey: ['recent', limit],
    queryFn: () => get<RecentEntry[]>(`/api/recent?limit=${limit}`),
    retry: 1,
    staleTime: 10_000,
  });
}

export function useRegistryErrors() {
  return useQuery({
    queryKey: ['registry-errors'],
    queryFn: () => get<RegistryError[]>('/api/registry/errors'),
    retry: 1,
  });
}

// One app shape for every tile, palette row and widget, whether it came
// from the server or from the demo catalogue.
export interface TileApp {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  installed: boolean;
  pinned: boolean;
  offline: boolean;
  iconSrc?: string;
  iconKind?: AppIconKind;
  demoLastOpened?: string;
}

export type DataStatus = 'loading' | 'live' | 'demo';

function fromLive(a: LiveApp): TileApp {
  return {
    id: a.id,
    name: a.name,
    description: a.description ?? '',
    category: a.category,
    tags: a.tags ?? [],
    installed: a.installed,
    pinned: a.pinned,
    offline: a.type === 'service' && a.healthOk === false,
    iconSrc: iconSrc(a),
  };
}

const DEMO: TileApp[] = APPS.map((a) => ({
  id: a.id,
  name: a.name,
  description: a.description,
  category: a.category,
  tags: [],
  installed: a.id !== 'names',
  pinned: a.id === 'memory' || a.id === 'converter',
  offline: !!a.offline,
  iconKind: a.icon,
  demoLastOpened: a.lastOpened,
}));

export function useApps(): { apps: TileApp[]; status: DataStatus } {
  const { data, isPending } = useLiveApps();
  if (data) return { apps: data.map(fromLive), status: 'live' };
  if (isPending) return { apps: [], status: 'loading' };
  return { apps: DEMO, status: 'demo' };
}

export function useCategoryList(): { name: string; count: number; color: string }[] {
  const { data } = useLiveCategories();
  if (data) return data.map((c, i) => ({ ...c, color: categoryColor(c.name, i) }));
  return CATEGORIES;
}
