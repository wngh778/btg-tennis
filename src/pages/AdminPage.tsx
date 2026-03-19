import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { getAllAppUsers, deleteAppUser, usernameToEmail, getMembers } from '../lib/database';
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

  // Bulk create
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkResults, setBulkResults] = useState<string[]>([]);

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

  const makeTempClient = () => createClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'temp-signup' } }
  );

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setAdding(true);
    try {
      const email = usernameToEmail(newUsername);
      const tempClient = makeTempClient();
      const { data, error: signUpError } = await tempClient.auth.signUp({
        email,
        password: newPassword,
        options: { emailRedirectTo: undefined },
      });
      if (signUpError) throw signUpError;
      if (!data.user) throw new Error('사용자 생성에 실패했습니다.');

      const { error: insertError } = await tempClient
        .from('app_users')
        .insert({ id: data.user.id, username: newUsername, role: newRole });
      if (insertError) throw insertError;
      setSuccess(`"${newUsername}" (${newRole === 'admin' ? '관리자' : '회원'}) 계정이 추가되었습니다.`);
      setNewUsername(''); setNewPassword(''); setNewRole('member');
      load();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError('오류가 발생했습니다.');
    } finally {
      setAdding(false);
    }
  };

  const handleBulkCreate = async () => {
    if (!confirm('활동 중인 회원 전체에 대해\nID: 이름, 비밀번호: 123456\n으로 계정을 생성하시겠습니까?\n(이미 계정이 있는 회원은 건너뜁니다)')) return;
    setBulkCreating(true);
    setBulkResults([]);

    try {
      const members = await getMembers();
      const existingUsernames = new Set(appUsers.map(u => u.username));
      const activeMembers = members.filter(m => m.isActive);
      const results: string[] = [];

      for (const member of activeMembers) {
        if (existingUsernames.has(member.name)) {
          results.push(`✓ ${member.name}: 이미 계정 있음`);
          continue;
        }
        try {
          const email = usernameToEmail(member.name);
          const tempClient = makeTempClient();
          const { data, error: signUpError } = await tempClient.auth.signUp({
            email,
            password: '123456',
            options: { emailRedirectTo: undefined },
          });
          if (signUpError) throw signUpError;
          if (!data.user) throw new Error('user null');

          const { error: insertError } = await tempClient
            .from('app_users')
            .insert({ id: data.user.id, username: member.name, role: 'member' });
          if (insertError) throw insertError;
          results.push(`✅ ${member.name}: 생성 완료`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          results.push(`❌ ${member.name}: 실패 - ${msg}`);
        }
      }

      setBulkResults(results);
      load();
    } finally {
      setBulkCreating(false);
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
        <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
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

      {/* Bulk Create */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-2">회원 일괄 계정 생성</h2>
        <p className="text-sm text-slate-500 mb-4">회원 목록에 있는 활동 회원 전체의 계정을 자동 생성합니다.<br />ID: 이름 · 비밀번호: 123456</p>
        <button
          onClick={handleBulkCreate}
          disabled={bulkCreating}
          className="w-full py-2.5 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors font-medium"
        >
          {bulkCreating ? '생성 중...' : '회원 일괄 계정 생성'}
        </button>
        {bulkResults.length > 0 && (
          <div className="mt-4 bg-slate-50 rounded-xl p-4 space-y-1 max-h-48 overflow-y-auto">
            {bulkResults.map((r, i) => (
              <p key={i} className="text-xs text-slate-700">{r}</p>
            ))}
          </div>
        )}
      </div>

      {/* Add User Form */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-4">사용자 개별 추가</h2>
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
          <li>사용자 추가 후에도 관리자 세션이 유지됩니다.</li>
          <li>사용자 삭제 시 앱 사용자 기록만 삭제됩니다 (Auth 계정 삭제는 서비스 역할 키 필요)</li>
        </ul>
      </div>
    </div>
  );
}
