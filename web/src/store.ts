import { useSyncExternalStore } from 'react';

// Tiny localStorage-backed stores shared by Home, Settings and the search.
// Apps write some of these keys from their iframes (same origin), so the
// `storage` event keeps Hub in sync when they change.

const EVENT = 'hub:store';

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage blocked: the change lasts for this render only
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// Raw string value of a key; parse it in the caller (keeps snapshots stable).
export function useStored(key: string): string | null {
  return useSyncExternalStore(subscribe, () => readString(key), () => null);
}
