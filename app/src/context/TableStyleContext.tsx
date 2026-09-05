'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { UserLocalStorage, type TableStyleTheme } from '@/lib/userLocalStorage';

interface TableStyleContextValue {
  theme: TableStyleTheme;
  setTheme: (theme: TableStyleTheme) => void;
}

const TableStyleContext = createContext<TableStyleContextValue | null>(null);

export function TableStyleProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<TableStyleTheme>('classic');

  useEffect(() => {
    setThemeState(UserLocalStorage.getTableStyleTheme());
  }, []);

  const setTheme = useCallback((value: TableStyleTheme) => {
    UserLocalStorage.setTableStyleTheme(value);
    setThemeState(value);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return (
    <TableStyleContext.Provider value={value}>
      {children}
    </TableStyleContext.Provider>
  );
}

export function useTableStyle() {
  const ctx = useContext(TableStyleContext);
  if (!ctx) {
    return {
      theme: 'classic' as TableStyleTheme,
      setTheme: (_: TableStyleTheme) => {},
    };
  }
  return ctx;
}
