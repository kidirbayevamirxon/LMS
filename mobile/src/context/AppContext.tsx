'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  apiRequest,
  clearStoredSession,
  getStoredTokens,
  getStoredUser,
  setStoredSession,
  UserSession,
} from '@/lib/api';
import { Lang, translations } from '@/lib/i18n';

interface AppContextType {
  user: UserSession | null;
  isReady: boolean;
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (typeof translations)['uz'] | (typeof translations)['ru'];
  darkMode: boolean;
  toggleDarkMode: () => void;
  login: (phone: string, password: string) => Promise<UserSession>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [lang, setLangState] = useState<Lang>('uz');
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const savedLang = (localStorage.getItem('edumanager_lang') as Lang) || 'uz';
    setLangState(savedLang);
    const savedDark = localStorage.getItem('edumanager_dark') === 'true';
    setDarkMode(savedDark);
    document.documentElement.classList.toggle('dark', savedDark);

    const cachedUser = getStoredUser();
    const tokens = getStoredTokens();
    if (cachedUser && tokens) {
      setUser(cachedUser);
    }
    setIsReady(true);
  }, []);

  const setLang = (next: Lang) => {
    setLangState(next);
    localStorage.setItem('edumanager_lang', next);
  };

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('edumanager_dark', String(next));
    document.documentElement.classList.toggle('dark', next);
  };

  const login = async (phone: string, password: string): Promise<UserSession> => {
    const res = await apiRequest<{
      data: { user: UserSession; accessToken: string; refreshToken: string };
    }>('/auth/login', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify({ phone, password, deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'app' }),
    });
    const sessionUser = res.data.user;
    setStoredSession(sessionUser, {
      accessToken: res.data.accessToken,
      refreshToken: res.data.refreshToken,
    });
    setUser(sessionUser);
    return sessionUser;
  };

  const logout = async () => {
    const tokens = getStoredTokens();
    try {
      if (tokens?.accessToken) {
        await apiRequest('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
      }
    } catch {
      // Ignore network errors on logout
    } finally {
      clearStoredSession();
      setUser(null);
    }
  };

  const refreshProfile = async () => {
    try {
      const res = await apiRequest<{ data: UserSession }>('/auth/me');
      const tokens = getStoredTokens();
      if (tokens) {
        setStoredSession(res.data, tokens);
      }
      setUser(res.data);
    } catch {
      // keep existing
    }
  };

  return (
    <AppContext.Provider
      value={{
        user,
        isReady,
        lang,
        setLang,
        t: translations[lang],
        darkMode,
        toggleDarkMode,
        login,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
