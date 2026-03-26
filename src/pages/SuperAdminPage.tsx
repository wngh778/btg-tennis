import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  getClubs, addClub, updateClub, deleteClub,
  getAllAppUsers, updateAppUser, deleteAppUser, resetUserPassword, usernameToEmail,
  getMembers,
} from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import type { Club, AppUser } from '../types';

export default function SuperAdminPage() {
  const { user, isSuperAdmin, loading } = useAuth();
  const navigate = useNavigate();

  const [clubs, setClubs] = useState<Club[]>([]);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Club form
  const [newClubName, setNewClubName] = useState('');
  const [newClubCourts, setNewClubCourts] = useState(4);
  const [newClubColor, setNewClubColor] = useState('#15803d');
  const [editClub, setEditClub] = useState<Club | null>(null);
  const [clubSaving, setClubSaving] = useState(false);

  // User form
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<AppUser['role']>('member');
  const [newUserClubs, setNewUserClubs] = useState<string[]>([]);
  const [newDefaultClub, setNewDefaultClub] = useState<string>('');
  const [userSaving, setUserSaving] = useState(false);
  const [userError, setUserError] = useState('');
  const [userSuccess, setUserSuccess] = useState('');

  // Bulk create
  const [bulkClubId, setBulkClubId] = useState('');
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkResults, setBulkResults] = useState<string[]>([]);

  // User filter
  const [userFilterClubId, setUserFilterClubId] = useState('');

  useEffect(() => {
    if (!loading && (!user || !isSuperAdmin)) {
      navigate('/');
    }
  }, [loading, user, isSuperAdmin, navigate]);

  const load = async () => {
    setLoadingData(true);
    const [c, u] = await Promise.all([getClubs(), getAllAppUsers()]);
    setClubs(c);
    setAppUsers(u);
    setLoadingData(false);
  };

  useEffect(() => { load(); }, []);

  // --- Club handlers ---
  const handleAddClub = async (e: React.FormEvent) => {
    e.preventDefault();
    setClubSaving(true);
    try {
      await addClub({ name: newClubName.trim(), defaultCourts: newClubCourts, color: newClubColor });
      setNewClubName('');
      setNewClubCourts(4);
      setNewClubColor('#15803d');
      load();
    } finally {
      setClubSaving(false);
    }
  };

  const handleUpdateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editClub) return;
    setClubSaving(true);
    try {
      await updateClub(editClub.id, { name: editClub.name, defaultCourts: editClub.defaultCourts, color: editClub.color });
      setEditClub(null);
      load();
    } finally {
      setClubSaving(false);
    }
  };

  const handleDeleteClub = async (club: Club) => {
    if (!confirm(`"${club.name}" 클럽을 삭제하시겠습니까?\n(해당 클럽의 모든 세션·멤버 데이터도 삭제됩니다)`)) return;
    await deleteClub(club.id);
    load();
  };

  // --- User handlers ---
  const makeTempClient = () => createClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'temp-signup-sa' } }
  );

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError(''); setUserSuccess('');
    setUserSaving(true);
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
          club_ids: newUserClubs,
          default_club_id: newDefaultClub || null,
        });
      if (insertError) throw insertError;

      setUserSuccess(`"${newUsername}" 계정이 추가되었습니다.`);
      setNewUsername(''); setNewPassword(''); setNewRole('member');
      setNewUserClubs([]); setNewDefaultClub('');
      load();
    } catch (err: unknown) {
      setUserError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setUserSaving(false);
    }
  };

  const handleUpdateUserClubs = async (u: AppUser, clubIds: string[], defaultClubId: string | null) => {
    await updateAppUser(u.id, { clubIds, defaultClubId });
    load();
  };

  const handleUpdateUserRole = async (u: AppUser, role: AppUser['role']) => {
    await updateAppUser(u.id, { role });
    load();
  };

  const handleResetPassword = async (u: AppUser) => {
    if (!confirm(`"${u.username}" 비밀번호를 123456으로 초기화하시겠습니까?`)) return;
    try {
      await resetUserPassword(u.id);
      alert('초기화 완료');
    } catch (err: unknown) {
      alert('초기화 실패: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDeleteUser = async (u: AppUser) => {
    if (!confirm(`"${u.username}" 계정을 삭제하시겠습니까?`)) return;
    await deleteAppUser(u.id);
    load();
  };

  const handleBulkCreate = async () => {
    if (!bulkClubId) { alert('클럽을 선택해주세요.'); return; }
    const club = clubs.find(c => c.id === bulkClubId);
    if (!club) return;
    if (!confirm(`"${club.name}" 클럽의 활동 회원 전체에 대해\nID: 이름, 비밀번호: 123456\n으로 계정을 생성하시겠습니까?\n(이미 계정이 있는 회원은 건너뜁니다)`)) return;
    setBulkCreating(true);
    setBulkResults([]);
    try {
      const members = await getMembers(bulkClubId);
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
            email, password: '123456', options: { emailRedirectTo: undefined },
          });
          if (signUpError) throw signUpError;
          if (!data.user) throw new Error('user null');
          const { error: insertError } = await tempClient.from('app_users').insert({
            id: data.user.id,
            username: member.name,
            role: 'member',
            club_ids: [bulkClubId],
            default_club_id: bulkClubId,
          });
          if (insertError) throw insertError;
          results.push(`✅ ${member.name}: 생성 완료`);
        } catch (e: unknown) {
          results.push(`❌ ${member.name}: 실패 - ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      setBulkResults(results);
      load();
    } finally {
      setBulkCreating(false);
    }
  };

  if (loading || loadingData) return <div className="text-center py-16 text-slate-500">불러오는 중...</div>;
  if (!isSuperAdmin) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-bold text-slate-800">슈퍼관리자</h1>

      {/* --- 클럽 관리 --- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 rounded-t-2xl flex items-center justify-between">
          <h2 className="font-semibold text-slate-700">클럽 관리 ({clubs.length}개)</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {clubs.length === 0 ? (
            <p className="px-5 py-4 text-slate-400 text-sm text-center">등록된 클럽이 없습니다.</p>
          ) : (
            clubs.map(club => (
              <div key={club.id} className="px-5 py-3">
                {editClub?.id === club.id ? (
                  <form onSubmit={handleUpdateClub} className="flex items-center gap-2 flex-wrap">
                    <input
                      value={editClub.name}
                      onChange={e => setEditClub({ ...editClub, name: e.target.value })}
                      required
                      className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <select
                      value={editClub.defaultCourts}
                      onChange={e => setEditClub({ ...editClub, defaultCourts: parseInt(e.target.value) })}
                      className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                    >
                      {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}코트</option>)}
                    </select>
                    <input
                      type="color"
                      value={editClub.color ?? '#15803d'}
                      onChange={e => setEditClub({ ...editClub, color: e.target.value })}
                      className="w-8 h-8 rounded cursor-pointer border border-slate-300"
                      title="클럽 색상"
                    />
                    <button type="submit" disabled={clubSaving} className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50">저장</button>
                    <button type="button" onClick={() => setEditClub(null)} className="px-3 py-1.5 text-slate-500 text-sm hover:text-slate-700">취소</button>
                  </form>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: club.color ?? '#15803d' }} />
                      <div>
                        <p className="font-medium text-slate-800">{club.name}</p>
                        <p className="text-xs text-slate-400">기본 코트 {club.defaultCourts}개</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditClub(club)} className="text-blue-500 hover:text-blue-700 text-sm">수정</button>
                      <button onClick={() => handleDeleteClub(club)} className="text-red-400 hover:text-red-600 text-sm">삭제</button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        {/* 클럽 추가 폼 */}
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <form onSubmit={handleAddClub} className="flex items-center gap-2 flex-wrap">
            <input
              value={newClubName}
              onChange={e => setNewClubName(e.target.value)}
              required
              placeholder="클럽 이름"
              className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <select
              value={newClubCourts}
              onChange={e => setNewClubCourts(parseInt(e.target.value))}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
            >
              {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}코트</option>)}
            </select>
            <input
              type="color"
              value={newClubColor}
              onChange={e => setNewClubColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border border-slate-300"
              title="클럽 색상"
            />
            <button type="submit" disabled={clubSaving} className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 whitespace-nowrap">
              {clubSaving ? '추가 중...' : '+ 클럽 추가'}
            </button>
          </form>
        </div>
      </div>

      {/* --- 사용자 관리 --- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 rounded-t-2xl flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-700 whitespace-nowrap">
            사용자 ({userFilterClubId ? appUsers.filter(u => u.clubIds.includes(userFilterClubId)).length : appUsers.length}명)
          </h2>
          <select
            value={userFilterClubId}
            onChange={e => setUserFilterClubId(e.target.value)}
            className="border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">전체</option>
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="scrollable-box" style={{ maxHeight: '400px' }}>
          <div className="divide-y divide-slate-100">
            {(() => {
              const filtered = userFilterClubId
                ? appUsers.filter(u => u.clubIds.includes(userFilterClubId))
                : appUsers;
              if (filtered.length === 0)
                return <p className="px-5 py-4 text-slate-400 text-sm text-center">등록된 사용자가 없습니다.</p>;
              return filtered.map(u => (
                <UserRow
                  key={u.id}
                  user={u}
                  clubs={clubs}
                  onUpdateClubs={handleUpdateUserClubs}
                  onUpdateRole={handleUpdateUserRole}
                  onResetPassword={handleResetPassword}
                  onDelete={handleDeleteUser}
                />
              ));
            })()}
          </div>
        </div>
      </div>

      {/* --- 회원 일괄 계정 생성 --- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-2">회원 일괄 계정 생성</h2>
        <p className="text-sm text-slate-500 mb-4">클럽의 활동 회원 전체에 대해 계정을 자동 생성합니다.<br />ID: 이름 · 비밀번호: 123456</p>
        <div className="flex items-center gap-3 mb-3">
          <select
            value={bulkClubId}
            onChange={e => setBulkClubId(e.target.value)}
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">클럽 선택</option>
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            onClick={handleBulkCreate}
            disabled={bulkCreating || !bulkClubId}
            className="px-4 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors font-medium whitespace-nowrap"
          >
            {bulkCreating ? '생성 중...' : '일괄 계정 생성'}
          </button>
        </div>
        {bulkResults.length > 0 && (
          <div className="bg-slate-50 rounded-xl p-4 space-y-1 max-h-48 overflow-y-auto">
            {bulkResults.map((r, i) => <p key={i} className="text-xs text-slate-700">{r}</p>)}
          </div>
        )}
      </div>

      {/* --- 사용자 추가 폼 --- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-4">사용자 추가</h2>
        <form onSubmit={handleAddUser} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">아이디</label>
              <input
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                required
                placeholder="아이디"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">비밀번호</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={6}
                placeholder="최소 6자리"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">역할</label>
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value as AppUser['role'])}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="member">회원</option>
                <option value="admin">관리자</option>
                <option value="superadmin">슈퍼관리자</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">기본 클럽</label>
              <select
                value={newDefaultClub}
                onChange={e => setNewDefaultClub(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">없음</option>
                {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">소속 클럽 (복수 선택)</label>
            <div className="flex flex-wrap gap-2">
              {clubs.map(c => (
                <label key={c.id} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newUserClubs.includes(c.id)}
                    onChange={e => {
                      if (e.target.checked) setNewUserClubs(prev => [...prev, c.id]);
                      else setNewUserClubs(prev => prev.filter(id => id !== c.id));
                    }}
                    className="rounded"
                  />
                  <span className="text-sm text-slate-700">{c.name}</span>
                </label>
              ))}
            </div>
          </div>
          {userError && <p className="text-red-500 text-sm">{userError}</p>}
          {userSuccess && <p className="text-green-600 text-sm">{userSuccess}</p>}
          <div className="flex justify-end">
            <button type="submit" disabled={userSaving} className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50">
              {userSaving ? '추가 중...' : '사용자 추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UserRow({
  user: u,
  clubs,
  onUpdateClubs,
  onUpdateRole,
  onResetPassword,
  onDelete,
}: {
  user: AppUser;
  clubs: Club[];
  onUpdateClubs: (u: AppUser, clubIds: string[], defaultClubId: string | null) => void;
  onUpdateRole: (u: AppUser, role: AppUser['role']) => void;
  onResetPassword: (u: AppUser) => void;
  onDelete: (u: AppUser) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [clubIds, setClubIds] = useState<string[]>(u.clubIds);
  const [defaultClubId, setDefaultClubId] = useState<string>(u.defaultClubId ?? '');

  const clubNames = clubs
    .filter(c => u.clubIds.includes(c.id))
    .map(c => c.name)
    .join(', ') || '없음';

  const roleLabel = { superadmin: '슈퍼관리자', admin: '관리자', member: '회원' }[u.role];

  return (
    <div className="px-5 py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-slate-800">{u.username}</p>
          <p className="text-xs text-slate-400">{roleLabel} · {clubNames}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            u.role === 'superadmin' ? 'bg-red-100 text-red-700' :
            u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'
          }`}>{roleLabel}</span>
          <button onClick={() => setExpanded(!expanded)} className="text-blue-500 hover:text-blue-700 text-sm">
            {expanded ? '닫기' : '편집'}
          </button>
          <button onClick={() => onResetPassword(u)} className="text-amber-500 hover:text-amber-700 text-sm">비번초기화</button>
          <button onClick={() => onDelete(u)} className="text-red-400 hover:text-red-600 text-sm">삭제</button>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">역할</label>
            <select
              value={u.role}
              onChange={e => onUpdateRole(u, e.target.value as AppUser['role'])}
              className="border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none"
            >
              <option value="member">회원</option>
              <option value="admin">관리자</option>
              <option value="superadmin">슈퍼관리자</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">소속 클럽</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {clubs.map(c => (
                <label key={c.id} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={clubIds.includes(c.id)}
                    onChange={e => {
                      if (e.target.checked) setClubIds(prev => [...prev, c.id]);
                      else setClubIds(prev => prev.filter(id => id !== c.id));
                    }}
                    className="rounded"
                  />
                  <span className="text-sm text-slate-700">{c.name}</span>
                </label>
              ))}
            </div>
            <label className="block text-xs font-medium text-slate-500 mb-1">기본 클럽</label>
            <div className="flex items-center gap-2">
              <select
                value={defaultClubId}
                onChange={e => setDefaultClubId(e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none"
              >
                <option value="">없음</option>
                {clubs.filter(c => clubIds.includes(c.id)).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                onClick={() => onUpdateClubs(u, clubIds, defaultClubId || null)}
                className="px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
