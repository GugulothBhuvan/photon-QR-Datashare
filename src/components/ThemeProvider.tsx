/**
 * Theme provider (UI_SPEC §12).
 *
 * Supplies the resolved colour scheme to the component tree. §12 supports
 * Light, Dark and System; the resolution rule lives in `colorsFor` so it can be
 * tested without a renderer, and this only carries the result.
 *
 * The theme *setting* is application state, owned by the settings controller.
 * The device's preference is a platform signal. This is where the two meet.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { colorsFor, DarkColors, LightColors, type ColorScheme } from '@constants/tokens';

export type ThemeSetting = 'LIGHT' | 'DARK' | 'SYSTEM';

export interface Theme {
  readonly colors: ColorScheme;
  readonly setting: ThemeSetting;
  readonly isDark: boolean;
}

const defaultTheme: Theme = {
  colors: LightColors,
  setting: 'SYSTEM',
  isDark: false,
};

const ThemeContext = createContext<Theme>(defaultTheme);

export interface ThemeProviderProps {
  readonly setting?: ThemeSetting;
  readonly children: ReactNode;
}

export function ThemeProvider({ setting = 'SYSTEM', children }: ThemeProviderProps) {
  const system = useColorScheme();

  const theme = useMemo<Theme>(() => {
    const systemIsDark = system === 'dark';
    const colors = colorsFor(setting, systemIsDark);

    return { colors, setting, isDark: colors === DarkColors };
  }, [setting, system]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** The active theme. Defaults to light when no provider is present. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
