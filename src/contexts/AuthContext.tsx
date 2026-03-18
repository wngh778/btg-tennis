import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { getAppUser, usernameToEmail, createAppUser } from '../lib/database';
import type { AppUser } from '../types';

interface AuthContextType {
  user: any | null; // supabase session user
  isAdminUser: boolean;
  appUser: AppUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  createUser: (username: string, password: string, role: 'admin' | 'member') => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        try {
          const appUserData = await getAppUser(session.user.id);
          setAppUser(appUserData);
          setIsAdminUser(appUserData?.role === 'admin');
        } catch (e) {
          console.error('getAppUser error:', e);
        }
      }
      setLoading(false);
    }).catch(e => {
      console.error('getSession error:', e);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const appUserData = await getAppUser(session.user.id);
        setAppUser(appUserData);
        setIsAdminUser(appUserData?.role === 'admin');
      } else {
        setAppUser(null);
        setIsAdminUser(false);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
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

  const createUser = async (username: string, password: string, role: 'admin' | 'member') => {
    const email = usernameToEmail(username);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (!data.user) throw new Error('사용자 생성에 실패했습니다.');
    await createAppUser(data.user.id, { username, role });
  };

  return (
    <AuthContext.Provider value={{ user, appUser, isAdminUser, loading, login, logout, createUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
