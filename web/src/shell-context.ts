import { createContext, useContext } from 'react';

const ShellCtx = createContext<{ openMenu: () => void; openSearch: () => void }>({
  openMenu: () => {},
  openSearch: () => {},
});

export const ShellProvider = ShellCtx.Provider;
export const useShell = () => useContext(ShellCtx);
