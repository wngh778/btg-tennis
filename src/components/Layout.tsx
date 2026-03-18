import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { path: '/', label: '홈' },
  { path: '/sessions', label: '경기 일정' },
  { path: '/members', label: '회원 관리' },
  { path: '/stats', label: '전적' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, isAdminUser, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-green-700 text-white shadow-md">
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
            {isAdminUser && (
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
            {user ? (
              <button
                onClick={() => logout().catch(e => { console.error('logout error:', e); alert('로그아웃 실패: ' + e.message); })}
                className="ml-2 px-3 py-1.5 rounded-md text-sm font-medium bg-green-900 hover:bg-green-800 transition-colors"
              >
                로그아웃
              </button>
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
