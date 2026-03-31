import { createContext, useContext, useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
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

  // refs로 최신 상태를 클로저에서 참조 (onAuthStateChange 콜백 내 stale closure 방지)
  const userRef = useRef<any | null>(null);
  const appUserRef = useRef<AppUser | null>(null);
  const loadingUserRef = useRef<string | null>(null);

  const setUserWithRef = useCallback((u: any | null) => {
    userRef.current = u;
    setUser(u);
  }, []);

  const setAppUserWithRef = useCallback((au: AppUser | null) => {
    appUserRef.current = au;
    setAppUser(au);
    setIsAdminUser(au?.role === 'admin' || au?.role === 'superadmin');
    setIsSuperAdmin(au?.role === 'superadmin');
  }, []);

  const loadAppUser = useCallback(async (userId: string) => {
    if (loadingUserRef.current === userId) return;
    loadingUserRef.current = userId;
    try {
      const data = await getAppUser(userId);
      if (loadingUserRef.current !== userId) return;
      setAppUserWithRef(data);
    } catch (e) {
      console.error('getAppUser error:', e);
      // 에러 시 기존 appUser 유지 (일시적 네트워크 오류)
      // 최초 로드(아직 null)인 경우만 null 설정
      if (!appUserRef.current) {
        setAppUserWithRef(null);
      }
    } finally {
      if (loadingUserRef.current === userId) {
        loadingUserRef.current = null;
      }
    }
  }, [setAppUserWithRef]);

  useEffect(() => {
    let mounted = true;

    // 1) 초기 세션 확인
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        setUserWithRef(session.user);
        await loadAppUser(session.user.id);
      }
      if (mounted) setLoading(false);
    }).catch(() => {
      if (mounted) setLoading(false);
    });

    // 2) 이후 상태 변경 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT') {
        setUserWithRef(null);
        setAppUserWithRef(null);
        loadingUserRef.current = null;
        setLoading(false);
        return;
      }

      if (session?.user) {
        setUserWithRef(session.user);

        // TOKEN_REFRESHED: 같은 유저이고 이미 appUser가 있으면 재로드 불필요
        if (event === 'TOKEN_REFRESHED') {
          if (appUserRef.current && session.user.id === userRef.current?.id) {
            return;
          }
        }

        // SIGNED_IN에서만 appUser 로드
        if (event === 'SIGNED_IN') {
          await loadAppUser(session.user.id);
        }
      }

      if (mounted) setLoading(false);
    });

    // 3) 탭 복귀 시 세션 자동 갱신
    //    브라우저 탭이 비활성→활성 전환 시 Supabase 세션을 강제 갱신
    //    이렇게 하면 방치 후 돌아와도 토큰이 유효한 상태로 API 호출 가능
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && userRef.current) {
        // getSession()은 내부적으로 만료 여부를 확인하고 필요 시 토큰 갱신
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (mounted && session?.user) {
            setUserWithRef(session.user);
          }
        }).catch(() => {
          // 갱신 실패해도 기존 상태 유지
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [setUserWithRef, setAppUserWithRef, loadAppUser]);

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
