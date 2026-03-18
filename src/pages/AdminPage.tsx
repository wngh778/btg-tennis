import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getAllAppUsers, createAppUser, deleteAppUser, usernameToEmail } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import type { AppUser } from '../types';

export default function AdminPage() {
  const { user, isAdminUser, loading } = useAuth();
  const navigate = useNavigate();
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // New user form
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'member'>('member');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !isAdminUser)) {
      navigate('/');
    }
  }, [loading, user, isAdminUser, navigate]);

  const load = async () => {
    setLoadingData(true);
    const users = await getAllAppUsers();
    setAppUsers(users);
    setLoadingData(false);
  };

  useEffect(() => { load(); }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setAdding(true);
    try {
      const email = usernameToEmail(newUsername);
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password: newPassword });
      if (signUpError) throw signUpError;
      if (!data.user) throw new Error('사용자 생성에 실패했습니다.');
      await createAppUser(data.user.id, { username: newUsername, role: newRole });
      setSuccess(`"${newUsername}" (${newRole === 'admin' ? '관리자' : '회원'}) 계정이 추가되었습니다. 관리자 세션이 초기화될 수 있으니 다시 로그인해주세요.`);
      setNewUsername(''); setNewPassword(''); setNewRole('member');
      load();
      // Sign back in as admin is needed since signUp switches the session
      // Admin needs to log in again manually - sign out to make it clear
      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate('/login');
      }, 3000);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError('오류가 발생했습니다.');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteAppUser = async (u: AppUser) => {
    if (!confirm(`"${u.username}" 계정을 삭제하시겠습니까?\n(Supabase Auth 계정은 서비스 역할 키가 필요하여 앱 사용자 기록만 삭제됩니다)`)) return;
    await deleteAppUser(u.id);
    load();
  };

  if (loading || loadingData) return <div className="text-center py-16 text-slate-500">불러오는 중...</div>;
  if (!isAdminUser) return null;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold text-slate-800">관리자 설정</h1>

      {/* App Users */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
          <h2 className="font-semibold text-slate-700">앱 사용자 ({appUsers.length}명)</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {appUsers.length === 0 ? (
            <p className="px-5 py-4 text-slate-400 text-sm text-center">등록된 사용자가 없습니다.</p>
          ) : (
            appUsers.map(u => (
              <div key={u.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-800">{u.username}</p>
                  <p className="text-sm text-slate-500">{u.role === 'admin' ? '관리자' : '회원'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {u.role === 'admin' ? '관리자' : '회원'}
                  </span>
                  <button
                    onClick={() => handleDeleteAppUser(u)}
                    className="text-red-400 hover:text-red-600 text-sm"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add User Form */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-4">사용자 추가</h2>
        <form onSubmit={handleAddUser} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">아이디</label>
              <input
                type="text"
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                required
                placeholder="아이디 입력"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">역할</label>
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value as 'admin' | 'member')}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="member">회원</option>
                <option value="admin">관리자</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">비밀번호</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={6}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="최소 6자리"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {success && <p className="text-green-600 text-sm">{success}</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={adding}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {adding ? '추가 중...' : '사용자 추가'}
            </button>
          </div>
        </form>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <p className="font-medium mb-1">안내</p>
        <ul className="space-y-1 text-blue-600 list-disc list-inside">
          <li>사용자 추가 후 관리자 세션이 초기화되므로 다시 로그인이 필요합니다.</li>
          <li>사용자 삭제 시 앱 사용자 기록만 삭제됩니다 (Auth 계정 삭제는 서비스 역할 키 필요)</li>
        </ul>
      </div>
    </div>
  );
}
