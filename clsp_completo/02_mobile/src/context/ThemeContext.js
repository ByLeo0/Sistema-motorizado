import React, {createContext, useContext, useState, useEffect, useCallback} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {StatusBar} from 'react-native';
import {LIGHT, DARK} from '../theme';

const SETTINGS_KEY = 'clsp_settings';

const ThemeContext = createContext({
  colors: LIGHT, isDark: false, toggleTheme: () => {},
});

export function ThemeProvider({children}) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then(raw => {
      if (raw) {
        try { setIsDark(!!JSON.parse(raw).darkMode); } catch (_) {}
      }
    });
  }, []);

  const toggleTheme = useCallback(async (value) => {
    const next = value !== undefined ? value : !isDark;
    setIsDark(next);
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    const cfg = raw ? JSON.parse(raw) : {};
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({...cfg, darkMode: next}));
  }, [isDark]);

  return (
    <ThemeContext.Provider value={{colors: isDark ? DARK : LIGHT, isDark, toggleTheme}}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'light-content'}
        backgroundColor={isDark ? DARK.headerBg : LIGHT.headerBg}
      />
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
