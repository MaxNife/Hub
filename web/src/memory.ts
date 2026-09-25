import { useStored } from './store';

// Written by the Memory app while a game is in progress.
export interface MemoryProgress {
  pairs: number;
  total: number;
}

export function useMemoryProgress(): MemoryProgress | null {
  const raw = useStored('memory:progress');
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<MemoryProgress>;
    if (typeof p.pairs === 'number' && typeof p.total === 'number' && p.pairs > 0 && p.pairs < p.total) {
      return { pairs: p.pairs, total: p.total };
    }
  } catch {
    // ignore a corrupt save
  }
  return null;
}

export function useMemoryBest(): number | null {
  const raw = useStored('memory:best');
  const n = raw === null ? NaN : parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export const fmtSecs = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
