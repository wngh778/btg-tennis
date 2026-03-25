import { BrowserRouter, Routes, Route } from 'react-router-dom';
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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ClubProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/sessions" element={<SessionsPage />} />
              <Route path="/sessions/:id" element={<SessionDetailPage />} />
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
    </BrowserRouter>
  );
}
