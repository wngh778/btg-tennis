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

  // Quick-setup wizard (새 클럽 + 관리자 한 번에)
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [wizardClubName, setWizardClubName] = useState('');
  const [wizardClubDay, setWizardClubDay] = useState('일요일');
  const [wizardClubCourts, setWizardClubCourts] = useState(4);
  const [wizardClubColor, setWizardClubColor] = useState('#15803d');
  const [wizardCreatedClubId, setWizardCreatedClubId] = useState('');
  const [wizardCreatedClubName, setWizardCreatedClubName] = useState('');
  const [wizardAdminMode, setWizardAdminMode] = useState<'existing' | 'new'>('existing');
  const [wizardSearchName, setWizardSearchName] = useState('');
  const [wizardFoundUser, setWizardFoundUser] = useState<AppUser | null | undefined>(undefined);
  const [wizardNewAdminName, setWizardNewAdminName] = useState('');
  const [wizardNewAdminPassword, setWizardNewAdminPassword] = useState('');
  const [wizardSaving, setWizardSaving] = useState(false);
  const [wizardError, setWizardError] = useState('');
  const [wizardDone, setWizardDone] = useState(false);

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
      await updateClub(editClub.id, { name: editClub.name, defaultCourts: editClub.defaultCourts, color: editClub.color, dayOfWeek: editClub.dayOfWeek, autoCreateSession: editClub.autoCreateSession });
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

      // 이미 계정이 있으면 club_ids에 현재 클럽 추가
      const existingUser = appUsers.find(u => u.username === name);
      if (existingUser) {
        if (!existingUser.clubIds.includes(memberClubId)) {
          await updateAppUser(existingUser.id, { clubIds: [...existingUser.clubIds, memberClubId] });
        }
      } else if (newMemberCreateAccount && newMemberPassword) {
        // 기존 계정 없을 때만 신규 계정 생성
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

  const handleCreateAccount = async (member: Member, password: string) => {
    if (!memberClubId) return;
    const tempClient = makeTempClient();
    const { data, error: signUpError } = await tempClient.auth.signUp({
      email: usernameToEmail(member.name), password, options: { emailRedirectTo: undefined },
    });
    if (signUpError) throw signUpError;
    if (data.user) {
      const { error: insertError } = await tempClient.from('app_users').insert({
        id: data.user.id, username: member.name, role: 'member',
        club_ids: [memberClubId], default_club_id: memberClubId,
      });
      if (insertError) throw insertError;
    }
    await load();
  };

  const handleUpdateUserClubs = async (u: AppUser, clubIds: string[], defaultClubId: string | null) => {
    await updateAppUser(u.id, { clubIds, defaultClubId }); load();
  };
  const handleUpdateUserRole = async (u: AppUser, role: AppUser['role']) => {
    // 역할 변경 시 현재 선택된 클럽이 club_ids에 없으면 자동 추가
    const updates: { role: AppUser['role']; clubIds?: string[] } = { role };
    if (memberClubId && !u.clubIds.includes(memberClubId)) {
      updates.clubIds = [...u.clubIds, memberClubId];
    }
    await updateAppUser(u.id, updates); load();
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

  // --- Quick-setup wizard handlers ---
  const openWizard = () => {
    setShowWizard(true); setWizardStep(1); setWizardDone(false);
    setWizardClubName(''); setWizardClubDay('일요일'); setWizardClubCourts(4); setWizardClubColor('#15803d');
    setWizardCreatedClubId(''); setWizardCreatedClubName('');
    setWizardAdminMode('existing'); setWizardSearchName(''); setWizardFoundUser(undefined);
    setWizardNewAdminName(''); setWizardNewAdminPassword(''); setWizardError('');
  };

  const handleWizardStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setWizardSaving(true); setWizardError('');
    try {
      const clubId = await addClub({ name: wizardClubName.trim(), defaultCourts: wizardClubCourts, color: wizardClubColor, dayOfWeek: wizardClubDay });
      setWizardCreatedClubId(clubId);
      setWizardCreatedClubName(wizardClubName.trim());
      setWizardStep(2);
      await load();
    } catch (err: unknown) {
      setWizardError(err instanceof Error ? err.message : '클럽 생성 실패');
    } finally { setWizardSaving(false); }
  };

  const handleWizardSearchUser = () => {
    const name = wizardSearchName.trim();
    if (!name) { setWizardFoundUser(undefined); return; }
    const found = appUsers.find(u => u.username === name);
    setWizardFoundUser(found ?? null);
  };

  const handleWizardAssignExisting = async () => {
    if (!wizardFoundUser || !wizardCreatedClubId) return;
    setWizardSaving(true); setWizardError('');
    try {
      const newClubIds = wizardFoundUser.clubIds.includes(wizardCreatedClubId)
        ? wizardFoundUser.clubIds
        : [...wizardFoundUser.clubIds, wizardCreatedClubId];
      await updateAppUser(wizardFoundUser.id, { role: 'admin', clubIds: newClubIds, defaultClubId: wizardCreatedClubId });
      await load();
      setWizardDone(true);
    } catch (err: unknown) {
      setWizardError(err instanceof Error ? err.message : '관리자 지정 실패');
    } finally { setWizardSaving(false); }
  };

  const handleWizardCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wizardCreatedClubId) return;
    const name = wizardNewAdminName.trim();
    if (!name) { setWizardError('이름을 입력해주세요.'); return; }
    if (appUsers.find(u => u.username === name)) {
      setWizardError(`"${name}" 계정이 이미 존재합니다. 기존 계정 탭을 이용해주세요.`); return;
    }
    setWizardSaving(true); setWizardError('');
    try {
      const tempClient = makeTempClient();
      const { data, error: signUpError } = await tempClient.auth.signUp({
        email: usernameToEmail(name), password: wizardNewAdminPassword, options: { emailRedirectTo: undefined },
      });
      if (signUpError) throw signUpError;
      if (!data.user) throw new Error('user null');
      const { error: insertError } = await tempClient.from('app_users').insert({
        id: data.user.id, username: name, role: 'admin',
        club_ids: [wizardCreatedClubId], default_club_id: wizardCreatedClubId,
      });
      if (insertError) throw insertError;
      await load();
      setWizardDone(true);
    } catch (err: unknown) {
      setWizardError(err instanceof Error ? err.message : '계정 생성 실패');
    } finally { setWizardSaving(false); }
  };

  if (loading || loadingData) return <div className="text-center py-16 text-slate-500">불러오는 중...</div>;
  if (!isSuperAdmin) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">슈퍼관리자</h1>
        <button
          onClick={openWizard}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm rounded-xl font-medium hover:bg-green-700 transition-colors shadow-sm"
        >
          <span className="text-base">⚡</span>
          새 클럽 + 관리자 설정
        </button>
      </div>

      {/* Quick-setup wizard modal */}
      {showWizard && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-800">
                    {wizardDone ? '✅ 설정 완료!' : wizardStep === 1 ? '1단계: 클럽 정보' : '2단계: 관리자 지정'}
                  </h3>
                  {!wizardDone && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {wizardStep === 1 ? '새 클럽 정보를 입력하세요.' : `"${wizardCreatedClubName}" 클럽에 관리자를 지정하세요.`}
                    </p>
                  )}
                </div>
                <button onClick={() => setShowWizard(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
              </div>
              {/* Progress dots */}
              {!wizardDone && (
                <div className="flex gap-1.5 mt-3">
                  <div className={`h-1.5 flex-1 rounded-full transition-colors ${wizardStep >= 1 ? 'bg-green-500' : 'bg-slate-200'}`} />
                  <div className={`h-1.5 flex-1 rounded-full transition-colors ${wizardStep >= 2 ? 'bg-green-500' : 'bg-slate-200'}`} />
                </div>
              )}
            </div>

            {wizardDone ? (
              /* Done screen */
              <div className="px-6 py-8 text-center space-y-4">
                <div className="text-5xl">🎉</div>
                <div>
                  <p className="font-semibold text-slate-800">"{wizardCreatedClubName}" 클럽이 생성되었습니다.</p>
                  <p className="text-sm text-slate-500 mt-1">관리자가 로그인하면 해당 클럽을 관리할 수 있습니다.</p>
                </div>
                <div className="flex gap-2 justify-center">
                  <button onClick={openWizard} className="px-4 py-2 bg-green-600 text-white text-sm rounded-xl hover:bg-green-700 font-medium">
                    또 설정하기
                  </button>
                  <button onClick={() => setShowWizard(false)} className="px-4 py-2 bg-slate-100 text-slate-700 text-sm rounded-xl hover:bg-slate-200 font-medium">
                    닫기
                  </button>
                </div>
              </div>
            ) : wizardStep === 1 ? (
              /* Step 1: Club info */
              <form onSubmit={handleWizardStep1} className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">클럽 이름 *</label>
                  <input
                    value={wizardClubName}
                    onChange={e => setWizardClubName(e.target.value)}
                    required
                    placeholder="예) 신종언 클럽"
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">요일</label>
                    <select value={wizardClubDay} onChange={e => setWizardClubDay(e.target.value)} className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                      {['월요일','화요일','수요일','목요일','금요일','토요일','일요일'].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">코트 수</label>
                    <select value={wizardClubCourts} onChange={e => setWizardClubCourts(parseInt(e.target.value))} className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                      {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}코트</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">클럽 색상</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={wizardClubColor} onChange={e => setWizardClubColor(e.target.value)} className="w-10 h-10 rounded-xl cursor-pointer border border-slate-300" />
                    <span className="text-sm text-slate-500">{wizardClubColor}</span>
                  </div>
                </div>
                {wizardError && <p className="text-red-500 text-sm">{wizardError}</p>}
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setShowWizard(false)} className="flex-1 py-2.5 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl">취소</button>
                  <button type="submit" disabled={wizardSaving} className="flex-1 py-2.5 bg-green-600 text-white text-sm rounded-xl font-medium hover:bg-green-700 disabled:opacity-50">
                    {wizardSaving ? '생성 중...' : '클럽 생성 →'}
                  </button>
                </div>
              </form>
            ) : (
              /* Step 2: Assign admin */
              <div className="px-6 py-5 space-y-4">
                {/* Tab switcher */}
                <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                  <button
                    onClick={() => { setWizardAdminMode('existing'); setWizardSearchName(''); setWizardFoundUser(undefined); setWizardError(''); }}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${wizardAdminMode === 'existing' ? 'bg-green-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    기존 계정 검색
                  </button>
                  <button
                    onClick={() => { setWizardAdminMode('new'); setWizardFoundUser(undefined); setWizardError(''); }}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${wizardAdminMode === 'new' ? 'bg-green-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    새 계정 생성
                  </button>
                </div>

                {wizardAdminMode === 'existing' ? (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-500">이미 앱 계정이 있는 사용자를 관리자로 지정합니다.</p>
                    <div className="flex gap-2">
                      <input
                        value={wizardSearchName}
                        onChange={e => { setWizardSearchName(e.target.value); setWizardFoundUser(undefined); }}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleWizardSearchUser())}
                        placeholder="아이디(이름) 입력"
                        className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <button type="button" onClick={handleWizardSearchUser} className="px-4 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 whitespace-nowrap">
                        검색
                      </button>
                    </div>
                    {wizardFoundUser === null && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
                        "{wizardSearchName}" 계정을 찾을 수 없습니다. 새 계정 생성 탭을 이용해주세요.
                      </div>
                    )}
                    {wizardError && wizardFoundUser !== null && <p className="text-red-500 text-sm">{wizardError}</p>}
                    {wizardFoundUser && (
                      <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-bold text-sm">
                            {wizardFoundUser.username[0]}
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">{wizardFoundUser.username}</p>
                            <p className="text-xs text-slate-500">
                              현재 역할: {{'superadmin':'슈퍼관리자','admin':'관리자','member':'회원'}[wizardFoundUser.role]}
                              {wizardFoundUser.clubIds.length > 0 && ` · ${wizardFoundUser.clubIds.length}개 클럽 소속`}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-slate-600 bg-white rounded-lg px-3 py-2 border border-green-200">
                          "{wizardCreatedClubName}" 클럽의 <span className="font-semibold text-purple-600">관리자</span>로 지정됩니다.
                        </p>
                        <button
                          onClick={handleWizardAssignExisting}
                          disabled={wizardSaving}
                          className="w-full py-2.5 bg-green-600 text-white text-sm rounded-xl font-medium hover:bg-green-700 disabled:opacity-50"
                        >
                          {wizardSaving ? '지정 중...' : '관리자로 지정'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <form onSubmit={handleWizardCreateAdmin} className="space-y-3">
                    <p className="text-xs text-slate-500">새 관리자 계정을 생성합니다. 아이디 = 이름으로 설정됩니다.</p>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">이름 (아이디) *</label>
                      <input
                        value={wizardNewAdminName}
                        onChange={e => setWizardNewAdminName(e.target.value)}
                        required
                        placeholder="예) 신종언"
                        className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">비밀번호 *</label>
                      <input
                        type="password"
                        value={wizardNewAdminPassword}
                        onChange={e => setWizardNewAdminPassword(e.target.value)}
                        required
                        minLength={6}
                        placeholder="최소 6자리"
                        className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <div className="bg-purple-50 border border-purple-200 rounded-xl px-3 py-2.5 text-xs text-purple-700">
                      역할: <span className="font-semibold">관리자</span> · 클럽: <span className="font-semibold">{wizardCreatedClubName}</span>
                    </div>
                    {wizardError && <p className="text-red-500 text-sm">{wizardError}</p>}
                    <button type="submit" disabled={wizardSaving || wizardNewAdminPassword.length < 6} className="w-full py-2.5 bg-green-600 text-white text-sm rounded-xl font-medium hover:bg-green-700 disabled:opacity-50">
                      {wizardSaving ? '생성 중...' : '관리자 계정 생성'}
                    </button>
                  </form>
                )}

                {/* Skip option */}
                <div className="pt-1 border-t border-slate-100 text-center">
                  <button
                    onClick={() => { setWizardDone(true); }}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    관리자 지정 없이 완료 →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
                  <label className="flex items-center gap-1.5 cursor-pointer text-sm text-slate-600">
                    <input type="checkbox" checked={editClub.autoCreateSession} onChange={e => setEditClub({ ...editClub, autoCreateSession: e.target.checked })} className="w-3.5 h-3.5 text-green-600 rounded" />
                    자동생성
                  </label>
                  <button type="submit" disabled={clubSaving} className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50">저장</button>
                  <button type="button" onClick={() => setEditClub(null)} className="px-3 py-1.5 text-slate-500 text-sm hover:text-slate-700">취소</button>
                </form>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: club.color ?? '#15803d' }} />
                    <div>
                      <p className="font-medium text-slate-800">{club.name}</p>
                      <p className="text-xs text-slate-400">{club.dayOfWeek} · {club.defaultCourts}코트{club.autoCreateSession ? ' · 자동생성' : ''}</p>
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
                    onCreateAccount={handleCreateAccount}
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
                              <input type="checkbox" checked={importSelected.has(m.id)} onChange={e => { const s = new Set(importSelected); if (e.target.checked) { s.add(m.id); } else { s.delete(m.id); } setImportSelected(s); }} className="rounded" />
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
  onDeleteMember, onCreateAccount, onUpdateUserClubs, onUpdateUserRole, onResetPassword, onDeleteUser,
}: {
  member: Member;
  accountUser?: AppUser;
  clubs: Club[];
  onDeleteMember: (m: Member) => void;
  onCreateAccount: (member: Member, password: string) => Promise<void>;
  onUpdateUserClubs: (u: AppUser, clubIds: string[], defaultClubId: string | null) => void;
  onUpdateUserRole: (u: AppUser, role: AppUser['role']) => void;
  onResetPassword: (u: AppUser) => void;
  onDeleteUser: (u: AppUser) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [clubIds, setClubIds] = useState<string[]>(accountUser?.clubIds ?? []);
  const [defaultClubId, setDefaultClubId] = useState<string>(accountUser?.defaultClubId ?? '');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createPassword, setCreatePassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

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
          {accountUser ? (
            <>
              {accountUser.role !== 'superadmin' && (
                <button
                  onClick={() => onUpdateUserRole(accountUser, accountUser.role === 'admin' ? 'member' : 'admin')}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                    accountUser.role === 'admin'
                      ? 'border-slate-300 text-slate-500 hover:bg-slate-50'
                      : 'border-purple-300 text-purple-600 hover:bg-purple-50'
                  }`}
                >
                  {accountUser.role === 'admin' ? '회원으로 변경' : '관리자 설정'}
                </button>
              )}
              <button onClick={() => setExpanded(v => !v)} className="text-blue-500 hover:text-blue-700 text-sm">{expanded ? '닫기' : '편집'}</button>
              <button onClick={() => onResetPassword(accountUser)} className="text-amber-500 hover:text-amber-700 text-sm">비번초기화</button>
              <button onClick={() => onDeleteUser(accountUser)} className="text-orange-400 hover:text-orange-600 text-sm">계정삭제</button>
            </>
          ) : (
            <button
              onClick={() => { setShowCreateForm(v => !v); setCreatePassword(''); setCreateError(''); }}
              className="text-xs px-2 py-0.5 rounded border border-green-300 text-green-600 hover:bg-green-50 transition-colors"
            >
              {showCreateForm ? '취소' : '계정 생성'}
            </button>
          )}
          <button onClick={() => onDeleteMember(member)} className="text-red-400 hover:text-red-600 text-sm">삭제</button>
        </div>
      </div>
      {/* 계정 없을 때 인라인 계정 생성 폼 */}
      {!accountUser && showCreateForm && (
        <div className="px-5 pb-4 pt-2 border-t border-slate-50 bg-slate-50">
          <p className="text-xs text-slate-500 mb-2">아이디: <span className="font-medium text-slate-700">{member.name}</span></p>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={createPassword}
              onChange={e => setCreatePassword(e.target.value)}
              placeholder="비밀번호 (최소 6자리)"
              minLength={6}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-44"
            />
            <button
              onClick={async () => {
                if (createPassword.length < 6) { setCreateError('비밀번호는 6자리 이상이어야 합니다.'); return; }
                setCreating(true); setCreateError('');
                try {
                  await onCreateAccount(member, createPassword);
                  setShowCreateForm(false); setCreatePassword('');
                } catch (err: unknown) {
                  setCreateError(err instanceof Error ? err.message : '계정 생성 실패');
                } finally { setCreating(false); }
              }}
              disabled={creating || createPassword.length < 6}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
            >
              {creating ? '생성 중...' : '생성'}
            </button>
          </div>
          {createError && <p className="text-red-500 text-xs mt-1">{createError}</p>}
        </div>
      )}
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
