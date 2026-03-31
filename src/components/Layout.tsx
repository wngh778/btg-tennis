import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    setMenuOpen(false);
  }, [location.pathname]);

  const linkClass = (path: string) =>
    `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      location.pathname === path
        ? 'bg-white/20 text-white'
        : 'text-green-100 hover:bg-white/10'
    }`;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="text-white shadow-md" style={{ backgroundColor: currentClub?.color ?? '#15803d' }}>
        <div className="max-w-5xl mx-auto px-4 py-3">
          {/* Top bar */}
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 text-lg sm:text-xl font-bold tracking-tight shrink-0">
              🎾 {currentClub?.name ?? '테니스 대진표'}
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map(item => (
                <Link key={item.path} to={item.path} className={linkClass(item.path)}>
                  {item.label}
                </Link>
              ))}
              {isAdminUser && !isSuperAdmin && (
                <>
                  <Link to="/members" className={linkClass('/members')}>회원</Link>
                  <Link to="/admin" className={linkClass('/admin')}>관리</Link>
                </>
              )}
              {isSuperAdmin && (
                <Link to="/superadmin" className={linkClass('/superadmin')}>관리자</Link>
              )}
              {user ? (
                <>
                  {availableClubs.length > 1 && currentClub && (
                    <select
                      value={currentClub.id}
                      onChange={e => {
                        const club = availableClubs.find(c => c.id === e.target.value);
                        if (club) setCurrentClub(club);
                      }}
                      className="ml-1 px-2 py-1.5 rounded-lg text-sm bg-white/10 text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/30"
                    >
                      {availableClubs.map(c => (
                        <option key={c.id} value={c.id} className="text-slate-800">{c.name}</option>
                      ))}
                    </select>
                  )}
                  <Link to="/account" className={linkClass('/account')}>내 계정</Link>
                  <button
                    onClick={() => logout().catch(e => { console.error('logout error:', e); alert('로그아웃 실패: ' + e.message); })}
                    className="px-3 py-2 rounded-lg text-sm font-medium bg-white/10 hover:bg-white/20 transition-colors"
                  >
                    로그아웃
                  </button>
                </>
              ) : (
                <Link to="/login" className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-green-700 hover:bg-green-50 transition-colors">
                  로그인
                </Link>
              )}
            </nav>

            {/* Mobile: quick nav + hamburger */}
            <div className="flex md:hidden items-center gap-1">
              {navItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                    location.pathname === item.path
                      ? 'bg-white/20 text-white'
                      : 'text-green-100'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="ml-1 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="메뉴"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {menuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>

          {/* Mobile dropdown menu */}
          {menuOpen && (
            <div className="md:hidden mt-2 pt-2 border-t border-white/20 space-y-1">
              {isAdminUser && !isSuperAdmin && (
                <>
                  <Link to="/members" className={linkClass('/members')}>회원 관리</Link>
                  <Link to="/admin" className={linkClass('/admin')}>관리자 설정</Link>
                </>
              )}
              {isSuperAdmin && (
                <Link to="/superadmin" className={linkClass('/superadmin')}>슈퍼관리자</Link>
              )}
              {user ? (
                <>
                  {availableClubs.length > 1 && currentClub && (
                    <select
                      value={currentClub.id}
                      onChange={e => {
                        const club = availableClubs.find(c => c.id === e.target.value);
                        if (club) setCurrentClub(club);
                      }}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-white/10 text-white border border-white/20 focus:outline-none"
                    >
                      {availableClubs.map(c => (
                        <option key={c.id} value={c.id} className="text-slate-800">{c.name}</option>
                      ))}
                    </select>
                  )}
                  <Link to="/account" className={linkClass('/account')}>내 계정</Link>
                  <button
                    onClick={() => logout().catch(e => { console.error('logout error:', e); alert('로그아웃 실패: ' + e.message); })}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-green-100 hover:bg-white/10 transition-colors"
                  >
                    로그아웃
                  </button>
                </>
              ) : (
                <Link to="/login" className="block px-3 py-2 rounded-lg text-sm font-medium bg-white text-green-700 text-center">
                  로그인
                </Link>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {children}
      </main>
    </div>
  );
}
