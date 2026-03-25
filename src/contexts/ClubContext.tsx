import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getClubsByIds } from '../lib/database';
import type { Club } from '../types';

interface ClubContextType {
  currentClub: Club | null;
  availableClubs: Club[];
  setCurrentClub: (club: Club) => void;
  loadingClubs: boolean;
}

const ClubContext = createContext<ClubContextType | null>(null);

export function ClubProvider({ children }: { children: ReactNode }) {
  const { appUser, loading: authLoading } = useAuth();
  const [currentClub, setCurrentClubState] = useState<Club | null>(null);
  const [availableClubs, setAvailableClubs] = useState<Club[]>([]);
  const [loadingClubs, setLoadingClubs] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!appUser || appUser.clubIds.length === 0) {
      setAvailableClubs([]);
      setCurrentClubState(null);
      setLoadingClubs(false);
      return;
    }

    setLoadingClubs(true);
    getClubsByIds(appUser.clubIds)
      .then(clubs => {
        setAvailableClubs(clubs);

        // 저장된 클럽 ID 또는 defaultClubId 또는 첫 번째 클럽
        const savedClubId = localStorage.getItem('currentClubId');
        const targetId = savedClubId ?? appUser.defaultClubId ?? null;
        const target = targetId ? clubs.find(c => c.id === targetId) : null;
        setCurrentClubState(target ?? clubs[0] ?? null);
      })
      .catch(err => {
        console.error('clubs load error:', err);
        setAvailableClubs([]);
        setCurrentClubState(null);
      })
      .finally(() => setLoadingClubs(false));
  }, [appUser, authLoading]);

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

export function useClub() {
  const ctx = useContext(ClubContext);
  if (!ctx) throw new Error('useClub must be used within ClubProvider');
  return ctx;
}
