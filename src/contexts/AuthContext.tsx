import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { getAppUser, usernameToEmail, createAppUser } from '../lib/database';
import type { AppUser } from '../types';

interface AuthContextType {
  user: any | null; // supabase session user
  isAdminUser: boolean;
  isSuperAdmin: boolean;
  appUser: AppUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  createUser: (username: string, password: string, role: AppUser['role'], clubIds?: string[], defaultClubId?: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 안전장치: 8초 안에 초기화가 안 되면 강제 해제
    const safetyTimer = setTimeout(() => {
      console.warn('Auth init timed out, clearing local storage');
      try {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('sb-')) keys.push(key);
        }
        keys.forEach(k => localStorage.removeItem(k));
      } catch (_) { /* ignore */ }
      setUser(null);
      setAppUser(null);
      setIsAdminUser(false);
      setLoading(false);
    }, 8000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      clearTimeout(safetyTimer);
      setUser(session?.user ?? null);

      if (session?.user) {
        try {
          // getAppUser에 타임아웃 적용: 5초 이상 걸리면 null 반환
          const appUserData = await Promise.race([
            getAppUser(session.user.id),
            new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
          ]);
          setAppUser(appUserData);
          setIsAdminUser(appUserData?.role === 'admin' || appUserData?.role === 'superadmin');
          setIsSuperAdmin(appUserData?.role === 'superadmin');
        } catch (e) {
          console.error('getAppUser error:', e);
          setAppUser(null);
          setIsAdminUser(false);
        }
      } else {
        setAppUser(null);
        setIsAdminUser(false);
        setIsSuperAdmin(false);
      }

      // getAppUser 완료 후 loading 해제 (race condition 방지)
      setLoading(false);
    });

    return () => {
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  const login = async (username: string, password: string) => {
    const email = usernameToEmail(username);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const createUser = async (username: string, password: string, role: AppUser['role'], clubIds?: string[], defaultClubId?: string | null) => {
    const email = usernameToEmail(username);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (!data.user) throw new Error('사용자 생성에 실패했습니다.');
    await createAppUser(data.user.id, { username, role, clubIds, defaultClubId });
  };

  return (
    <AuthContext.Provider value={{ user, appUser, isAdminUser, isSuperAdmin, loading, login, logout, createUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
