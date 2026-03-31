import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
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
  // 현재 로드 중인 userId를 추적하여 중복 호출 방지
  const loadingUserRef = useRef<string | null>(null);

  const loadAppUser = async (userId: string) => {
    // 이미 같은 유저를 로드 중이면 스킵
    if (loadingUserRef.current === userId) return;
    loadingUserRef.current = userId;

    try {
      const appUserData = await getAppUser(userId);
      // 로드 완료 시점에 같은 유저인지 확인 (그 사이 로그아웃 등 발생 가능)
      if (loadingUserRef.current !== userId) return;
      setAppUser(appUserData);
      setIsAdminUser(appUserData?.role === 'admin' || appUserData?.role === 'superadmin');
      setIsSuperAdmin(appUserData?.role === 'superadmin');
    } catch (e) {
      console.error('getAppUser error:', e);
      // 에러 시 기존 appUser 유지 (네트워크 일시 오류 등)
      // 단, 최초 로드(appUser===null)인 경우만 null 설정
      if (!appUser) {
        setAppUser(null);
        setIsAdminUser(false);
        setIsSuperAdmin(false);
      }
    } finally {
      if (loadingUserRef.current === userId) {
        loadingUserRef.current = null;
      }
    }
  };

  useEffect(() => {
    let mounted = true;

    // 1) 초기 세션 확인 (onAuthStateChange보다 빠르고 안정적)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
        await loadAppUser(session.user.id);
      }
      if (mounted) setLoading(false);
    }).catch(() => {
      if (mounted) setLoading(false);
    });

    // 2) 이후 상태 변경 감지 (토큰 갱신, 로그아웃 등)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setAppUser(null);
        setIsAdminUser(false);
        setIsSuperAdmin(false);
        loadingUserRef.current = null;
        setLoading(false);
        return;
      }

      if (session?.user) {
        setUser(session.user);

        // TOKEN_REFRESHED일 때는 같은 유저면 appUser 재로드 불필요
        if (event === 'TOKEN_REFRESHED' && appUser && session.user.id === user?.id) {
          return;
        }

        // SIGNED_IN이나 INITIAL_SESSION 등에서만 appUser 로드
        if (event === 'SIGNED_IN') {
          await loadAppUser(session.user.id);
        }
      }

      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
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
