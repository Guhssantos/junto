import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { palette, statusColors, type ColorScheme, type Colors } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeValue {
  scheme: ColorScheme;
  colors: Colors;
  status: (typeof statusColors)[ColorScheme];
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);
const KEY = 'junto.theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'light' || v === 'dark' || v === 'system') setPref(v);
      })
      .catch(() => undefined);
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const scheme: ColorScheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
    return {
      scheme,
      colors: palette[scheme],
      status: statusColors[scheme],
      preference,
      setPreference: (p) => {
        setPref(p);
        AsyncStorage.setItem(KEY, p).catch(() => undefined);
      },
    };
  }, [preference, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme precisa estar dentro de <ThemeProvider>');
  return ctx;
}
