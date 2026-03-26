import { Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useClub } from '../contexts/ClubContext';

const navItems = [
  { path: '/', label: '홈' },
  { path: '/sessions', label: '경기 일정' },
  { path: '/stats', label: '전적' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, isAdminUser, isSuperAdmin, logout } = useAuth();
  const { currentClub, availableClubs, setCurrentClub } = useClub();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="text-white shadow-md" style={{ backgroundColor: currentClub?.color ?? '#15803d' }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
            🎾 테니스 대진표
          </Link>
          <nav className="flex items-center gap-1">
            {navItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === item.path
                    ? 'bg-green-900 text-white'
                    : 'hover:bg-green-600 text-green-100'
                }`}
              >
                {item.label}
              </Link>
            ))}
            {isAdminUser && !isSuperAdmin && (
              <Link
                to="/members"
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === '/members'
                    ? 'bg-green-900 text-white'
                    : 'hover:bg-green-600 text-green-100'
                }`}
              >
                회원 관리
              </Link>
            )}
            {isAdminUser && !isSuperAdmin && (
              <Link
                to="/admin"
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === '/admin'
                    ? 'bg-green-900 text-white'
                    : 'hover:bg-green-600 text-green-100'
                }`}
              >
                관리자
              </Link>
            )}
            {isSuperAdmin && (
              <Link
                to="/superadmin"
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === '/superadmin'
                    ? 'bg-green-900 text-white'
                    : 'hover:bg-green-600 text-green-100'
                }`}
              >
                슈퍼관리자
              </Link>
            )}
            {user ? (
              <>
                {/* 클럽 선택기 (여러 클럽이 있을 때) */}
                {availableClubs.length > 1 && currentClub && (
                  <select
                    value={currentClub.id}
                    onChange={e => {
                      const club = availableClubs.find(c => c.id === e.target.value);
                      if (club) setCurrentClub(club);
                    }}
                    className="ml-1 px-2 py-1 rounded-md text-sm bg-green-800 text-white border border-green-600 focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    {availableClubs.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
                <Link
                  to="/account"
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    location.pathname === '/account'
                      ? 'bg-green-900 text-white'
                      : 'hover:bg-green-600 text-green-100'
                  }`}
                >
                  내 계정
                </Link>
                <button
                  onClick={() => logout().catch(e => { console.error('logout error:', e); alert('로그아웃 실패: ' + e.message); })}
                  className="ml-1 px-3 py-1.5 rounded-md text-sm font-medium bg-green-900 hover:bg-green-800 transition-colors"
                >
                  로그아웃
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="ml-2 px-3 py-1.5 rounded-md text-sm font-medium bg-white text-green-700 hover:bg-green-50 transition-colors"
              >
                로그인
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
