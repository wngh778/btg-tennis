import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getClubs, getClubsByIds } from '../lib/database';
import type { Club } from '../types';

interface ClubContextType {
  currentClub: Club | null;
  availableClubs: Club[];
  setCurrentClub: (club: Club) => void;
  loadingClubs: boolean;
}

const ClubContext = createContext<ClubContextType | null>(null);

export function ClubProvider({ children }: { children: ReactNode }) {
  const { appUser, isSuperAdmin, loading: authLoading } = useAuth();
  const [currentClub, setCurrentClubState] = useState<Club | null>(null);
  const [availableClubs, setAvailableClubs] = useState<Club[]>([]);
  const [loadingClubs, setLoadingClubs] = useState(true);
  // 이전 appUser ID를 추적하여 같은 유저면 클럽 재로드 방지
  const prevAppUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!appUser || (!isSuperAdmin && appUser.clubIds.length === 0)) {
      // appUser가 없을 때만 클럽 초기화 (로그아웃 시)
      // 이미 클럽이 로드되어 있고 일시적인 null이면 유지
      if (!appUser) {
        // 로그아웃 시 클럽 상태 초기화 — AuthContext(외부 상태)와의 동기화이므로 의도된 패턴
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAvailableClubs([]);
        setCurrentClubState(null);
        prevAppUserIdRef.current = null;
      }
      setLoadingClubs(false);
      return;
    }

    // 같은 유저이고 이미 클럽이 로드되어 있으면 재로드 불필요
    if (prevAppUserIdRef.current === appUser.id && availableClubs.length > 0) {
      setLoadingClubs(false);
      return;
    }

    prevAppUserIdRef.current = appUser.id;
    setLoadingClubs(true);
    (isSuperAdmin ? getClubs() : getClubsByIds(appUser.clubIds))
      .then(clubs => {
        setAvailableClubs(clubs);

        // 이미 현재 클럽이 유효하면 유지
        if (currentClub && clubs.some(c => c.id === currentClub.id)) {
          setLoadingClubs(false);
          return;
        }

        // 저장된 클럽 ID 또는 defaultClubId 또는 첫 번째 클럽
        const savedClubId = localStorage.getItem('currentClubId');
        const targetId = savedClubId ?? appUser.defaultClubId ?? null;
        const target = targetId ? clubs.find(c => c.id === targetId) : null;
        setCurrentClubState(target ?? clubs[0] ?? null);
      })
      .catch(err => {
        console.error('clubs load error:', err);
        // 에러 시 기존 클럽 상태 유지 (네트워크 일시 오류)
      })
      .finally(() => setLoadingClubs(false));
  }, [appUser, isSuperAdmin, authLoading]);

  const setCurrentClub = (club: Club) => {
    setCurrentClubState(club);
    localStorage.setItem('currentClubId', club.id);
  };

  return (
    <ClubContext.Provider value={{ currentClub, availableClubs, setCurrentClub, loadingClubs }}>
      {children}
    </ClubContext.Provider>
  );
}

// context 파일에서 hook을 함께 export하는 표준 패턴 (fast refresh 경고 무시)
// eslint-disable-next-line react-refresh/only-export-components
export function useClub() {
  const ctx = useContext(ClubContext);
  if (!ctx) throw new Error('useClub must be used within ClubProvider');
  return ctx;
}
