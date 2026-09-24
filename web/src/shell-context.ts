import { createContext, useContext } from 'react';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Shell {
  openMenu: () => void;
  openSearch: () => void;
  // Opens an app; `from` is the clicked icon, which morphs into the splash.
  launch: (id: string, from?: Element | null) => void;
  toast: (text: string, action?: ToastAction) => void;
}

const ShellCtx = createContext<Shell>({
  openMenu: () => {},
  openSearch: () => {},
  launch: () => {},
  toast: () => {},
});

export const ShellProvider = ShellCtx.Provider;
export const useShell = () => useContext(ShellCtx);

export function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
