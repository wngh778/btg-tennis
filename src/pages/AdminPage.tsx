import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { getClubUsers, deleteAppUser, usernameToEmail, getMembers, resetUserPassword, updateClub, updateAppUser } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { useClub } from '../contexts/ClubContext';
import { useNavigate } from 'react-router-dom';
import type { AppUser } from '../types';

export default function AdminPage() {
  const { user, isAdminUser, loading } = useAuth();
  const { currentClub, loadingClubs } = useClub();
  const navigate = useNavigate();
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Club settings
  const [clubName, setClubName] = useState('');
  const [clubCourts, setClubCourts] = useState(4);
  const [autoCreate, setAutoCreate] = useState(false);
  const [clubSaving, setClubSaving] = useState(false);
  const [clubSaved, setClubSaved] = useState(false);

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
    if (!loading && !loadingClubs && (!user || !isAdminUser)) {
      navigate('/');
    }
  }, [loading, loadingClubs, user, isAdminUser, navigate]);

  useEffect(() => {
    if (currentClub) {
      setClubName(currentClub.name);
      setClubCourts(currentClub.defaultCourts);
      setAutoCreate(currentClub.autoCreateSession);
    }
  }, [currentClub]);

  const load = async () => {
    if (!currentClub) return;
    setLoadingData(true);
    try {
      const users = await getClubUsers(currentClub.id);
      setAppUsers(users);
    } catch (e) {
      console.error('load users error:', e);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => { if (currentClub) load(); }, [currentClub]);

  const handleSaveClubSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentClub) return;
    setClubSaving(true);
    try {
      await updateClub(currentClub.id, { name: clubName, defaultCourts: clubCourts, autoCreateSession: autoCreate });
      setClubSaved(true);
      setTimeout(() => setClubSaved(false), 2000);
    } finally {
      setClubSaving(false);
    }
  };

  const makeTempClient = () => createClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'temp-signup' } }
  );

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentClub) return;
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
        .insert({
          id: data.user.id,
          username: newUsername,
          role: newRole,
          club_ids: [currentClub.id],
          default_club_id: currentClub.id,
        });
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
    if (!currentClub) return;
    if (!confirm('활동 중인 회원 전체에 대해\nID: 이름, 비밀번호: 123456\n으로 계정을 생성하시겠습니까?\n(이미 계정이 있는 회원은 건너뜁니다)')) return;
    setBulkCreating(true);
    setBulkResults([]);

    try {
      const members = await getMembers(currentClub.id);
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
            .insert({
              id: data.user.id,
              username: member.name,
              role: 'member',
              club_ids: [currentClub.id],
              default_club_id: currentClub.id,
            });
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

  const handleResetPassword = async (u: AppUser) => {
    if (!confirm(`"${u.username}" 계정의 비밀번호를 123456으로 초기화하시겠습니까?`)) return;
    try {
      await resetUserPassword(u.id);
      alert(`"${u.username}" 비밀번호가 123456으로 초기화되었습니다.`);
    } catch (err: unknown) {
      alert('초기화 실패: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDeleteAppUser = async (u: AppUser) => {
    if (!confirm(`"${u.username}" 계정을 삭제하시겠습니까?`)) return;
    await deleteAppUser(u.id);
    load();
  };

  const handleToggleRole = async (u: AppUser) => {
    const newRole = u.role === 'admin' ? 'member' : 'admin';
    const label = newRole === 'admin' ? '관리자' : '회원';
    if (!confirm(`"${u.username}"의 역할을 ${label}(으)로 변경하시겠습니까?`)) return;
    try {
      await updateAppUser(u.id, { role: newRole });
      load();
    } catch (err: unknown) {
      alert('역할 변경 실패: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  if (loading || loadingClubs || loadingData) return <div className="text-center py-16 text-slate-500">불러오는 중...</div>;
  if (!isAdminUser) return null;
  if (!currentClub) return <div className="text-center py-16 text-slate-400">클럽이 없습니다. 슈퍼관리자에서 클럽을 추가해주세요.</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold text-slate-800">관리자 설정 — {currentClub.name}</h1>

      {/* 클럽 설정 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-4">클럽 설정</h2>
        <form onSubmit={handleSaveClubSettings} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">클럽 이름</label>
              <input
                value={clubName}
                onChange={e => setClubName(e.target.value)}
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">기본 코트 수</label>
              <select
                value={clubCourts}
                onChange={e => setClubCourts(parseInt(e.target.value))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}개</option>)}
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoCreate}
                onChange={e => setAutoCreate(e.target.checked)}
                className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
              />
              <div>
                <span className="text-sm font-medium text-slate-700">자동 경기 생성</span>
                <p className="text-xs text-slate-400">지난 경기 이후 자동으로 다음 주 경기를 생성합니다</p>
              </div>
            </label>
          </div>
          <div className="flex justify-end items-center gap-3 mt-3">
            {clubSaved && <span className="text-green-600 text-sm">저장됨</span>}
            <button
              type="submit"
              disabled={clubSaving}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {clubSaving ? '저장 중...' : '설정 저장'}
            </button>
          </div>
        </form>

        {/* 공개 링크 */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <label className="block text-xs font-medium text-slate-600 mb-2">게스트 공개 링크</label>
          <p className="text-xs text-slate-400 mb-2">이 링크를 게스트에게 전달하면 로그인 없이 대진표와 결과를 확인할 수 있습니다.</p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={`${window.location.origin}/c/${currentClub.id}`}
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-600 select-all"
              onClick={e => (e.target as HTMLInputElement).select()}
            />
            <button
              type="button"
              onClick={() => {
                const url = `${window.location.origin}/c/${currentClub.id}`;
                navigator.clipboard.writeText(url).then(() => alert('링크가 복사되었습니다!')).catch(() => {
                  const t = document.createElement('textarea');
                  t.value = url; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t);
                  alert('링크가 복사되었습니다!');
                });
              }}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors font-medium whitespace-nowrap"
            >
              링크 복사
            </button>
          </div>
        </div>
      </div>

      {/* App Users */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 rounded-t-2xl">
          <h2 className="font-semibold text-slate-700">앱 사용자 ({appUsers.length}명)</h2>
        </div>
        <div className="scrollable-box" style={{ maxHeight: '320px' }}>
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
                    u.role === 'superadmin' ? 'bg-red-100 text-red-700' : u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {u.role === 'superadmin' ? '슈퍼관리자' : u.role === 'admin' ? '관리자' : '회원'}
                  </span>
                  {u.role !== 'superadmin' && (
                    <button
                      onClick={() => handleToggleRole(u)}
                      className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                        u.role === 'admin'
                          ? 'border-slate-300 text-slate-500 hover:bg-slate-50'
                          : 'border-purple-300 text-purple-600 hover:bg-purple-50'
                      }`}
                    >
                      {u.role === 'admin' ? '회원으로 변경' : '관리자 설정'}
                    </button>
                  )}
                  <button onClick={() => handleResetPassword(u)} className="text-amber-500 hover:text-amber-700 text-sm">비번초기화</button>
                  <button onClick={() => handleDeleteAppUser(u)} className="text-red-400 hover:text-red-600 text-sm">삭제</button>
                </div>
              </div>
            ))
          )}
          </div>
        </div>
      </div>

      {/* Bulk Create */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-2">회원 일괄 계정 생성</h2>
        <p className="text-sm text-slate-500 mb-4">
          이 클럽의 활동 회원 전체에 대해 계정을 자동 생성합니다.<br />ID: 이름 · 비밀번호: 123456
        </p>
        <button
          onClick={handleBulkCreate}
          disabled={bulkCreating}
          className="w-full py-2.5 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors font-medium"
        >
          {bulkCreating ? '생성 중...' : '회원 일괄 계정 생성'}
        </button>
        {bulkResults.length > 0 && (
          <div className="mt-4 bg-slate-50 rounded-xl p-4 space-y-1 max-h-48 overflow-y-auto">
            {bulkResults.map((r, i) => <p key={i} className="text-xs text-slate-700">{r}</p>)}
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
    </div>
  );
}
