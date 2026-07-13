import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { ClubProvider } from './contexts/ClubContext';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';

// 라우트 단위 코드 스플리팅 — 모바일 초기 로딩 최적화
// (홈/로그인은 첫 화면이므로 즉시 로드, 나머지는 방문 시 로드)
const SessionsPage = lazy(() => import('./pages/SessionsPage'));
const SessionDetailPage = lazy(() => import('./pages/SessionDetailPage'));
const MembersPage = lazy(() => import('./pages/MembersPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const SuperAdminPage = lazy(() => import('./pages/SuperAdminPage'));
const StatsPage = lazy(() => import('./pages/StatsPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const PublicClubPage = lazy(() => import('./pages/PublicClubPage'));

// lazy 청크 로딩 중 표시할 폴백
function RouteFallback() {
  return <div className="text-center py-16 text-slate-400 text-sm">불러오는 중...</div>;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'monospace', color: '#b91c1c', background: '#fef2f2', minHeight: '100vh' }}>
          <h2 style={{ marginBottom: 12 }}>⚠️ 앱 오류 발생</h2>
          <p style={{ marginBottom: 8, fontWeight: 'bold' }}>{this.state.error.message}</p>
          <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', marginBottom: 16 }}>{this.state.error.stack}</pre>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '8px 16px', background: '#b91c1c', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/c/:clubId/:sessionId" element={<PublicClubPage />} />
            <Route path="/c/:clubId" element={<PublicClubPage />} />
            <Route path="/*" element={
              <AuthProvider>
                <ClubProvider>
                  <Layout>
                    <Suspense fallback={<RouteFallback />}>
                      <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/sessions" element={<SessionsPage />} />
                        <Route path="/sessions/:id" element={<ErrorBoundary><SessionDetailPage /></ErrorBoundary>} />
                        <Route path="/members" element={<MembersPage />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/admin" element={<AdminPage />} />
                        <Route path="/superadmin" element={<SuperAdminPage />} />
                        <Route path="/stats" element={<StatsPage />} />
                        <Route path="/account" element={<AccountPage />} />
                      </Routes>
                    </Suspense>
                  </Layout>
                </ClubProvider>
              </AuthProvider>
            } />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
