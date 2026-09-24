import { useCallback, useEffect, useState } from 'react';

// Theme preference: 'system' follows the OS; light/dark pin it. The choice
// lives on <html data-theme> (set before first paint by index.html).
export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'hub:theme';

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

export function isDark(): boolean {
  const t = document.documentElement.getAttribute('data-theme');
  if (t) return t === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(read);
  useEffect(() => apply(pref), [pref]);
  const set = useCallback((p: ThemePref) => {
    try {
      if (p === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, p);
    } catch {
      // storage blocked: preference lasts for this tab only
    }
    setPref(p);
    window.dispatchEvent(new Event('hub:theme'));
  }, []);
  // Keep several hook users (sidebar toggle, settings) in sync.
  useEffect(() => {
    const on = () => setPref(read());
    window.addEventListener('hub:theme', on);
    return () => window.removeEventListener('hub:theme', on);
  }, []);
  const toggle = useCallback(() => set(isDark() ? 'light' : 'dark'), [set]);
  return { pref, set, toggle };
}
