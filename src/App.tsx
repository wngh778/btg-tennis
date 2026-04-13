import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { ClubProvider } from './contexts/ClubContext';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import SessionsPage from './pages/SessionsPage';
import SessionDetailPage from './pages/SessionDetailPage';
import MembersPage from './pages/MembersPage';
import LoginPage from './pages/LoginPage';
import AdminPage from './pages/AdminPage';
import SuperAdminPage from './pages/SuperAdminPage';
import StatsPage from './pages/StatsPage';
import AccountPage from './pages/AccountPage';
import PublicClubPage from './pages/PublicClubPage';

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
        <Routes>
          <Route path="/c/:clubId/:sessionId" element={<PublicClubPage />} />
          <Route path="/c/:clubId" element={<PublicClubPage />} />
          <Route path="/*" element={
            <AuthProvider>
              <ClubProvider>
                <Layout>
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
                </Layout>
              </ClubProvider>
            </AuthProvider>
          } />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
