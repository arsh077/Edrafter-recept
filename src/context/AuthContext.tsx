import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import type { AuthUser, CompanySettings } from '../types/portal';

interface AuthContextValue {
  user: AuthUser | null;
  companySettings: CompanySettings | null;
  token: string | null;
  loading: boolean;
  hasPermission: (code: string) => boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  apiFetch: <T = unknown>(url: string, options?: RequestInit) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STAFF_TOKEN_KEY = 'edrafter_staff_session';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(STAFF_TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState<boolean>(true);

  const apiFetch = useCallback(
    async <T = unknown>(url: string, options: RequestInit = {}): Promise<T> => {
      const headers = new Headers(options.headers || {});
      const activeToken = token || (() => {
        try {
          return sessionStorage.getItem(STAFF_TOKEN_KEY);
        } catch {
          return null;
        }
      })();
      if (activeToken && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${activeToken}`);
      }
      if (!(options.body instanceof FormData) && options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      const res = await fetch(url, { ...options, headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || `Request failed (${res.status})`);
      }
      return data as T;
    },
    [token]
  );

  const loadMe = useCallback(async (activeToken: string) => {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${activeToken}` },
    });
    if (!res.ok) {
      throw new Error('Session expired');
    }
    const json = await res.json();
    setUser(json.data.user);
    setCompanySettings(json.data.companySettings);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    await loadMe(token);
  }, [token, loadMe]);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      try {
        if (fbUser) {
          const idToken = await fbUser.getIdToken();
          if (!mounted) return;
          setToken(idToken);
          await loadMe(idToken);
        } else {
          const stored = (() => {
            try {
              return sessionStorage.getItem(STAFF_TOKEN_KEY);
            } catch {
              return null;
            }
          })();
          if (stored) {
            setToken(stored);
            await loadMe(stored);
          } else {
            setUser(null);
            setToken(null);
          }
        }
      } catch {
        try {
          sessionStorage.removeItem(STAFF_TOKEN_KEY);
        } catch {
          // ignore
        }
        if (mounted) {
          setUser(null);
          setToken(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [loadMe]);

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Invalid credentials');
      }
      const staffToken: string = json.data.token;
      try {
        sessionStorage.setItem(STAFF_TOKEN_KEY, staffToken);
      } catch {
        // ignore
      }
      setToken(staffToken);
      await loadMe(staffToken);
    },
    [loadMe]
  );

  const loginWithGoogle = useCallback(async () => {
    const result = await signInWithPopup(auth, googleAuthProvider);
    const idToken = await result.user.getIdToken();
    try {
      sessionStorage.removeItem(STAFF_TOKEN_KEY);
    } catch {
      // ignore
    }
    setToken(idToken);
    await loadMe(idToken);
  }, [loadMe]);

  const logout = useCallback(async () => {
    try {
      sessionStorage.removeItem(STAFF_TOKEN_KEY);
    } catch {
      // ignore
    }
    await signOut(auth).catch(() => undefined);
    setToken(null);
    setUser(null);
  }, []);

  const hasPermission = useCallback(
    (code: string) => {
      if (!user) return false;
      return user.roleSlug === 'super_admin' || user.permissions.includes(code);
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        companySettings,
        token,
        loading,
        hasPermission,
        loginWithEmail,
        loginWithGoogle,
        logout,
        refreshProfile,
        apiFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
