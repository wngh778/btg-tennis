import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  getClubs, addClub, updateClub, deleteClub,
  getAllAppUsers, updateAppUser, deleteAppUser, resetUserPassword, usernameToEmail,
  getMembers, addMember, deleteMember,
} from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import type { Club, AppUser, Member, Gender } from '../types';
import { NTRP_OPTIONS } from '../utils/matchmaking';

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
  const [newClubDay, setNewClubDay] = useState('일요일');
  const [editClub, setEditClub] = useState<Club | null>(null);
  const [clubSaving, setClubSaving] = useState(false);

  // Bulk create
  const [bulkClubId, setBulkClubId] = useState('');
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkResults, setBulkResults] = useState<string[]>([]);

  // Unified member+account management
  const [memberClubId, setMemberClubId] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  // Add member form
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberGender, setNewMemberGender] = useState<Gender>('male');
  const [newMemberNtrp, setNewMemberNtrp] = useState(3.0);
  const [newMemberCreateAccount, setNewMemberCreateAccount] = useState(false);
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberError, setMemberError] = useState('');
  // Import from another club
  const [importSourceClubId, setImportSourceClubId] = useState('');
  const [importSourceMembers, setImportSourceMembers] = useState<Member[]>([]);
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !isSuperAdmin)) navigate('/');
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
      await addClub({ name: newClubName.trim(), defaultCourts: newClubCourts, color: newClubColor, dayOfWeek: newClubDay });
      setNewClubName(''); setNewClubCourts(4); setNewClubColor('#15803d'); setNewClubDay('일요일');
      load();
    } finally { setClubSaving(false); }
  };

  const handleUpdateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editClub) return;
    setClubSaving(true);
    try {
      await updateClub(editClub.id, { name: editClub.name, defaultCourts: editClub.defaultCourts, color: editClub.color, dayOfWeek: editClub.dayOfWeek });
      setEditClub(null); load();
    } finally { setClubSaving(false); }
  };

  const handleDeleteClub = async (club: Club) => {
    if (!confirm(`"${club.name}" 클럽을 삭제하시겠습니까?\n(해당 클럽의 모든 세션·멤버 데이터도 삭제됩니다)`)) return;
    await deleteClub(club.id); load();
  };

  const makeTempClient = () => createClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'temp-signup-sa' } }
  );

  // --- Bulk create ---
  const handleBulkCreate = async () => {
    if (!bulkClubId) { alert('클럽을 선택해주세요.'); return; }
    const club = clubs.find(c => c.id === bulkClubId);
    if (!club) return;
    if (!confirm(`"${club.name}" 클럽의 활동 회원 전체에 대해\nID: 이름, 비밀번호: 123456\n으로 계정을 생성하시겠습니까?\n(이미 계정이 있는 회원은 건너뜁니다)`)) return;
    setBulkCreating(true); setBulkResults([]);
    try {
      const mbs = await getMembers(bulkClubId);
      const existingUsernames = new Set(appUsers.map(u => u.username));
      const results: string[] = [];
      for (const member of mbs.filter(m => m.isActive)) {
        if (existingUsernames.has(member.name)) { results.push(`✓ ${member.name}: 이미 계정 있음`); continue; }
        try {
          const tempClient = makeTempClient();
          const { data, error: signUpError } = await tempClient.auth.signUp({
            email: usernameToEmail(member.name), password: '123456', options: { emailRedirectTo: undefined },
          });
          if (signUpError) throw signUpError;
          if (!data.user) throw new Error('user null');
          const { error: insertError } = await tempClient.from('app_users').insert({
            id: data.user.id, username: member.name, role: 'member',
            club_ids: [bulkClubId], default_club_id: bulkClubId,
          });
          if (insertError) throw insertError;
          results.push(`✅ ${member.name}: 생성 완료`);
        } catch (e: unknown) { results.push(`❌ ${member.name}: 실패 - ${e instanceof Error ? e.message : String(e)}`); }
      }
      setBulkResults(results); load();
    } finally { setBulkCreating(false); }
  };

  // --- Member management ---
  const loadMembers = async (clubId: string) => {
    if (!clubId) { setMembers([]); return; }
    setLoadingMembers(true);
    setMembers(await getMembers(clubId));
    setLoadingMembers(false);
  };

  const handleMemberClubChange = (clubId: string) => {
    setMemberClubId(clubId);
    setShowImport(false); setShowMemberForm(false);
    setImportSourceClubId(''); setImportSourceMembers([]); setImportSelected(new Set());
    loadMembers(clubId);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberClubId) return;
    setMemberSaving(true); setMemberError('');
    try {
      const name = newMemberName.trim();
      await addMember({ clubId: memberClubId, name, gender: newMemberGender, ntrp: newMemberNtrp, isActive: true });
      if (newMemberCreateAccount && newMemberPassword) {
        const tempClient = makeTempClient();
        const { data, error: signUpError } = await tempClient.auth.signUp({
          email: usernameToEmail(name), password: newMemberPassword, options: { emailRedirectTo: undefined },
        });
        if (signUpError) throw signUpError;
        if (data.user) {
          const { error: insertError } = await tempClient.from('app_users').insert({
            id: data.user.id, username: name, role: 'member',
            club_ids: [memberClubId], default_club_id: memberClubId,
          });
          if (insertError) throw insertError;
        }
      }
      setNewMemberName(''); setNewMemberGender('male'); setNewMemberNtrp(3.0);
      setNewMemberCreateAccount(false); setNewMemberPassword('');
      setShowMemberForm(false);
      await load();
      loadMembers(memberClubId);
    } catch (err: unknown) {
      setMemberError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally { setMemberSaving(false); }
  };

  const handleDeleteMember = async (member: Member) => {
    if (!confirm(`"${member.name}" 회원을 삭제하시겠습니까?`)) return;
    await deleteMember(member.id);
    loadMembers(memberClubId);
  };

  const handleImportSourceChange = async (clubId: string) => {
    setImportSourceClubId(clubId); setImportSelected(new Set());
    if (!clubId) { setImportSourceMembers([]); return; }
    const m = await getMembers(clubId);
    const existingNames = new Set(members.map(m => m.name));
    setImportSourceMembers(m.filter(m => !existingNames.has(m.name)));
  };

  const handleImport = async () => {
    if (!memberClubId || importSelected.size === 0) return;
    setImporting(true);
    for (const m of importSourceMembers.filter(m => importSelected.has(m.id))) {
      await addMember({ clubId: memberClubId, name: m.name, gender: m.gender, ntrp: m.ntrp, isActive: true });
      const appUser = appUsers.find(u => u.username === m.name);
      if (appUser && !appUser.clubIds.includes(memberClubId)) {
        await updateAppUser(appUser.id, { clubIds: [...appUser.clubIds, memberClubId] });
      }
    }
    setImporting(false); setShowImport(false);
    setImportSourceClubId(''); setImportSourceMembers([]); setImportSelected(new Set());
    await load();
    loadMembers(memberClubId);
  };

  const handleUpdateUserClubs = async (u: AppUser, clubIds: string[], defaultClubId: string | null) => {
    await updateAppUser(u.id, { clubIds, defaultClubId }); load();
  };
  const handleUpdateUserRole = async (u: AppUser, role: AppUser['role']) => {
    await updateAppUser(u.id, { role }); load();
  };
  const handleResetPassword = async (u: AppUser) => {
    if (!confirm(`"${u.username}" 비밀번호를 123456으로 초기화하시겠습니까?`)) return;
    try { await resetUserPassword(u.id); alert('초기화 완료'); }
    catch (err: unknown) { alert('초기화 실패: ' + (err instanceof Error ? err.message : String(err))); }
  };
  const handleDeleteUser = async (u: AppUser) => {
    if (!confirm(`"${u.username}" 계정을 삭제하시겠습니까?`)) return;
    await deleteAppUser(u.id); load();
  };

  if (loading || loadingData) return <div className="text-center py-16 text-slate-500">불러오는 중...</div>;
  if (!isSuperAdmin) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-bold text-slate-800">슈퍼관리자</h1>

      {/* --- 클럽 관리 --- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 rounded-t-2xl">
          <h2 className="font-semibold text-slate-700">클럽 관리 ({clubs.length}개)</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {clubs.length === 0 ? (
            <p className="px-5 py-4 text-slate-400 text-sm text-center">등록된 클럽이 없습니다.</p>
          ) : clubs.map(club => (
            <div key={club.id} className="px-5 py-3">
              {editClub?.id === club.id ? (
                <form onSubmit={handleUpdateClub} className="flex items-center gap-2 flex-wrap">
                  <input value={editClub.name} onChange={e => setEditClub({ ...editClub, name: e.target.value })} required className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  <select value={editClub.dayOfWeek} onChange={e => setEditClub({ ...editClub, dayOfWeek: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                    {['월요일','화요일','수요일','목요일','금요일','토요일','일요일'].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select value={editClub.defaultCourts} onChange={e => setEditClub({ ...editClub, defaultCourts: parseInt(e.target.value) })} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                    {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}코트</option>)}
                  </select>
                  <input type="color" value={editClub.color ?? '#15803d'} onChange={e => setEditClub({ ...editClub, color: e.target.value })} className="w-8 h-8 rounded cursor-pointer border border-slate-300" />
                  <button type="submit" disabled={clubSaving} className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50">저장</button>
                  <button type="button" onClick={() => setEditClub(null)} className="px-3 py-1.5 text-slate-500 text-sm hover:text-slate-700">취소</button>
                </form>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: club.color ?? '#15803d' }} />
                    <div>
                      <p className="font-medium text-slate-800">{club.name}</p>
                      <p className="text-xs text-slate-400">{club.dayOfWeek} · {club.defaultCourts}코트</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditClub(club)} className="text-blue-500 hover:text-blue-700 text-sm">수정</button>
                    <button onClick={() => handleDeleteClub(club)} className="text-red-400 hover:text-red-600 text-sm">삭제</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <form onSubmit={handleAddClub} className="flex items-center gap-2 flex-wrap">
            <input value={newClubName} onChange={e => setNewClubName(e.target.value)} required placeholder="클럽 이름" className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            <select value={newClubDay} onChange={e => setNewClubDay(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
              {['월요일','화요일','수요일','목요일','금요일','토요일','일요일'].map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={newClubCourts} onChange={e => setNewClubCourts(parseInt(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
              {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}코트</option>)}
            </select>
            <input type="color" value={newClubColor} onChange={e => setNewClubColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border border-slate-300" />
            <button type="submit" disabled={clubSaving} className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 whitespace-nowrap">
              {clubSaving ? '추가 중...' : '+ 클럽 추가'}
            </button>
          </form>
        </div>
      </div>

      {/* --- 회원 일괄 계정 생성 --- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-800 mb-2">회원 일괄 계정 생성</h2>
        <p className="text-sm text-slate-500 mb-4">클럽의 활동 회원 전체에 대해 계정을 자동 생성합니다.<br />ID: 이름 · 비밀번호: 123456</p>
        <div className="flex items-center gap-3 mb-3">
          <select value={bulkClubId} onChange={e => setBulkClubId(e.target.value)} className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="">클럽 선택</option>
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={handleBulkCreate} disabled={bulkCreating || !bulkClubId} className="px-4 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors font-medium whitespace-nowrap">
            {bulkCreating ? '생성 중...' : '일괄 계정 생성'}
          </button>
        </div>
        {bulkResults.length > 0 && (
          <div className="bg-slate-50 rounded-xl p-4 space-y-1 max-h-48 overflow-y-auto">
            {bulkResults.map((r, i) => <p key={i} className="text-xs text-slate-700">{r}</p>)}
          </div>
        )}
      </div>

      {/* --- 통합 회원 관리 (members 기준) --- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 rounded-t-2xl flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-700 whitespace-nowrap">
            회원 관리 {memberClubId ? `(${members.length}명)` : ''}
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={memberClubId}
              onChange={e => handleMemberClubChange(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">클럽 선택</option>
              {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {memberClubId && (
              <button
                onClick={() => { setShowMemberForm(v => !v); setMemberError(''); }}
                className="px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 whitespace-nowrap"
              >
                + 추가
              </button>
            )}
          </div>
        </div>

        {!memberClubId ? (
          <p className="px-5 py-6 text-slate-400 text-sm text-center">클럽을 선택하면 회원 목록이 표시됩니다.</p>
        ) : (
          <>
            {/* 회원 목록 (members 기준, 계정 정보 통합) */}
            <div className="scrollable-box divide-y divide-slate-100" style={{ maxHeight: '400px' }}>
              {loadingMembers ? (
                <p className="px-5 py-4 text-slate-400 text-sm text-center">불러오는 중...</p>
              ) : members.length === 0 ? (
                <p className="px-5 py-4 text-slate-400 text-sm text-center">등록된 회원이 없습니다.</p>
              ) : members.map(m => {
                const accountUser = appUsers.find(u => u.username === m.name);
                return (
                  <MemberAccountRow
                    key={m.id}
                    member={m}
                    accountUser={accountUser}
                    clubs={clubs}
                    onDeleteMember={handleDeleteMember}
                    onUpdateUserClubs={handleUpdateUserClubs}
                    onUpdateUserRole={handleUpdateUserRole}
                    onResetPassword={handleResetPassword}
                    onDeleteUser={handleDeleteUser}
                  />
                );
              })}
            </div>

            {/* 신규 추가 폼 */}
            {showMemberForm && (
              <div className="px-5 py-4 border-t border-slate-100 bg-slate-50">
                <form onSubmit={handleAddMember} className="space-y-3">
                  <div className="flex items-end gap-2 flex-wrap">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">이름</label>
                      <input value={newMemberName} onChange={e => setNewMemberName(e.target.value)} required placeholder="이름" className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-28" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">성별</label>
                      <select value={newMemberGender} onChange={e => setNewMemberGender(e.target.value as Gender)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                        <option value="male">남</option>
                        <option value="female">여</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">NTRP</label>
                      <select value={newMemberNtrp} onChange={e => setNewMemberNtrp(parseFloat(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                        {NTRP_OPTIONS.map(n => <option key={n} value={n}>{n.toFixed(1)}</option>)}
                      </select>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={newMemberCreateAccount} onChange={e => setNewMemberCreateAccount(e.target.checked)} className="rounded" />
                    <span className="text-sm text-slate-700">계정도 함께 생성</span>
                  </label>
                  {newMemberCreateAccount && (
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">비밀번호 (아이디 = 이름)</label>
                      <input type="password" value={newMemberPassword} onChange={e => setNewMemberPassword(e.target.value)} required={newMemberCreateAccount} minLength={6} placeholder="최소 6자리" className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-48" />
                    </div>
                  )}
                  {memberError && <p className="text-red-500 text-sm">{memberError}</p>}
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setShowMemberForm(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">취소</button>
                    <button type="submit" disabled={memberSaving} className="px-4 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 whitespace-nowrap">
                      {memberSaving ? '추가 중...' : '추가'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* 다른 클럽에서 가져오기 */}
            <div className="px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowImport(v => !v)} className="text-sm text-blue-600 font-medium hover:text-blue-800">
                {showImport ? '▲ 닫기' : '▼ 다른 클럽 회원 가져오기'}
              </button>
              {showImport && (
                <div className="mt-3 space-y-3">
                  <select value={importSourceClubId} onChange={e => handleImportSourceChange(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">가져올 클럽 선택</option>
                    {clubs.filter(c => c.id !== memberClubId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {importSourceClubId && (
                    importSourceMembers.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-2">가져올 회원이 없습니다 (이미 모두 등록됨)</p>
                    ) : (
                      <>
                        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-48 overflow-y-auto">
                          <div className="px-4 py-2 bg-slate-50 flex items-center justify-between">
                            <span className="text-xs text-slate-500">{importSourceMembers.length}명 (이미 등록된 회원 제외)</span>
                            <button type="button" onClick={() => setImportSelected(importSelected.size === importSourceMembers.length ? new Set() : new Set(importSourceMembers.map(m => m.id)))} className="text-xs text-blue-600 hover:text-blue-800">
                              {importSelected.size === importSourceMembers.length ? '전체 해제' : '전체 선택'}
                            </button>
                          </div>
                          {importSourceMembers.map(m => (
                            <label key={m.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50">
                              <input type="checkbox" checked={importSelected.has(m.id)} onChange={e => { const s = new Set(importSelected); e.target.checked ? s.add(m.id) : s.delete(m.id); setImportSelected(s); }} className="rounded" />
                              <span className={`w-2 h-2 rounded-full ${m.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                              <span className="font-medium text-slate-800 flex-1">{m.name}</span>
                              <span className="text-xs text-slate-400">{m.gender === 'male' ? '남' : '여'} · {m.ntrp.toFixed(1)}</span>
                            </label>
                          ))}
                        </div>
                        <button onClick={handleImport} disabled={importing || importSelected.size === 0} className="w-full py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium">
                          {importing ? '가져오는 중...' : `선택한 ${importSelected.size}명 가져오기`}
                        </button>
                      </>
                    )
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MemberAccountRow({
  member, accountUser, clubs,
  onDeleteMember, onUpdateUserClubs, onUpdateUserRole, onResetPassword, onDeleteUser,
}: {
  member: Member;
  accountUser?: AppUser;
  clubs: Club[];
  onDeleteMember: (m: Member) => void;
  onUpdateUserClubs: (u: AppUser, clubIds: string[], defaultClubId: string | null) => void;
  onUpdateUserRole: (u: AppUser, role: AppUser['role']) => void;
  onResetPassword: (u: AppUser) => void;
  onDeleteUser: (u: AppUser) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [clubIds, setClubIds] = useState<string[]>(accountUser?.clubIds ?? []);
  const [defaultClubId, setDefaultClubId] = useState<string>(accountUser?.defaultClubId ?? '');

  const roleLabel = accountUser
    ? { superadmin: '슈퍼관리자', admin: '관리자', member: '회원' }[accountUser.role]
    : null;

  return (
    <div>
      <div className="px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${member.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
          <span className="font-medium text-slate-800">{member.name}</span>
          <span className="text-xs text-slate-400">{member.gender === 'male' ? '남' : '여'} · {member.ntrp.toFixed(1)}</span>
          {accountUser ? (
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
              accountUser.role === 'superadmin' ? 'bg-red-100 text-red-700' :
              accountUser.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'
            }`}>{roleLabel}</span>
          ) : (
            <span className="text-xs bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">계정없음</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {accountUser && (
            <>
              <button onClick={() => setExpanded(v => !v)} className="text-blue-500 hover:text-blue-700 text-sm">{expanded ? '닫기' : '편집'}</button>
              <button onClick={() => onResetPassword(accountUser)} className="text-amber-500 hover:text-amber-700 text-sm">비번초기화</button>
              <button onClick={() => onDeleteUser(accountUser)} className="text-orange-400 hover:text-orange-600 text-sm">계정삭제</button>
            </>
          )}
          <button onClick={() => onDeleteMember(member)} className="text-red-400 hover:text-red-600 text-sm">삭제</button>
        </div>
      </div>
      {expanded && accountUser && (
        <div className="px-5 pb-4 pt-2 border-t border-slate-50 bg-slate-50 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">역할</label>
            <select value={accountUser.role} onChange={e => onUpdateUserRole(accountUser, e.target.value as AppUser['role'])} className="border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none">
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
                  <input type="checkbox" checked={clubIds.includes(c.id)} onChange={e => { if (e.target.checked) setClubIds(p => [...p, c.id]); else setClubIds(p => p.filter(id => id !== c.id)); }} className="rounded" />
                  <span className="text-sm text-slate-700">{c.name}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <select value={defaultClubId} onChange={e => setDefaultClubId(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none">
                <option value="">기본 클럽 없음</option>
                {clubs.filter(c => clubIds.includes(c.id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={() => onUpdateUserClubs(accountUser, clubIds, defaultClubId || null)} className="px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
