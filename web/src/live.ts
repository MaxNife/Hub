import { useQuery } from '@tanstack/react-query';
import { APPS, CATEGORIES, type HubApp } from './data';

// Live API types (registry JSON). Falls back to mock data when the
// Go server isn't running (e.g. Vite dev without backend).
export interface LiveApp {
  id: string;
  name: string;
  description?: string;
  category: string;
  type: 'static' | 'service';
  icon: string; // path inside the app folder
  installed: boolean;
  pinned: boolean;
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

// Merged view: live apps when the backend answers, mock data otherwise.
// Mock HubApps are mapped to the LiveApp shape with an `img` of '' so
// callers can branch on it.
export type CardApp =
  | { kind: 'live'; app: LiveApp; sub: string }
  | { kind: 'mock'; app: HubApp; sub: string };

export function useCardApps(): { cards: CardApp[]; live: boolean } {
  const { data } = useLiveApps();
  if (data && data.length > 0) {
    return {
      live: true,
      cards: data
        .filter((a) => a.installed)
        .map((a) => ({ kind: 'live' as const, app: a, sub: a.description || a.category })),
    };
  }
  return {
    live: false,
    cards: APPS.slice(0, 6).map((a) => ({
      kind: 'mock' as const,
      app: a,
      sub: a.offline ? 'Offline' : a.lastOpened || a.category,
    })),
  };
}

export function useCategoryList(): { name: string; count: number; color: string }[] {
  const { data } = useLiveCategories();
  if (data && data.length > 0) {
    const colors = ['#8b6cff', '#ff9a3d', '#2fc08f', '#33b6f0', '#ff5c7a', '#43ddb9'];
    return data.map((c, i) => ({ ...c, color: colors[i % colors.length] }));
  }
  return CATEGORIES;
}
