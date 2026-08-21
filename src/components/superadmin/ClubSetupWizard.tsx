import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { addClub, updateAppUser, usernameToEmail } from '../../lib/database';
import type { AppUser } from '../../types';

interface Props {
  appUsers: AppUser[];
  onClose: () => void;
  onComplete: () => Promise<void>;
}

const DAYS = ['월요일','화요일','수요일','목요일','금요일','토요일','일요일'];

/** SuperAdminPage에서 사용하는 임시 Supabase 클라이언트 (세션 격리) */
function makeTempClient() {
  return createClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'temp-signup-wizard' } },
  );
}

export function ClubSetupWizard({ appUsers, onClose, onComplete }: Props) {
  // ── Step 1: 클럽 정보 ──────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2>(1);
  const [clubName, setClubName] = useState('');
  const [clubDay, setClubDay] = useState('일요일');
  const [clubCourts, setClubCourts] = useState(4);
  const [clubColor, setClubColor] = useState('#15803d');

  // ── Step 2: 관리자 지정 ────────────────────────────────────────────────────
  const [createdClubId, setCreatedClubId] = useState('');
  const [createdClubName, setCreatedClubName] = useState('');
  const [adminMode, setAdminMode] = useState<'existing' | 'new'>('existing');
  const [searchName, setSearchName] = useState('');
  const [foundUser, setFoundUser] = useState<AppUser | null | undefined>(undefined);
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');

  // ── 공통 ───────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // ── 핸들러: Step 1 ─────────────────────────────────────────────────────────
  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const clubId = await addClub({
        name: clubName.trim(),
        defaultCourts: clubCourts,
        color: clubColor,
        dayOfWeek: clubDay,
      });
      setCreatedClubId(clubId);
      setCreatedClubName(clubName.trim());
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '클럽 생성 실패');
    } finally { setSaving(false); }
  };

  // ── 핸들러: 기존 계정 검색 ──────────────────────────────────────────────────
  const handleSearchUser = () => {
    const name = searchName.trim();
    if (!name) { setFoundUser(undefined); return; }
    const found = appUsers.find(u => u.username === name);
    setFoundUser(found ?? null);
  };

  // ── 핸들러: 기존 계정 → 관리자 지정 ──────────────────────────────────────
  const handleAssignExisting = async () => {
    if (!foundUser || !createdClubId) return;
    setSaving(true); setError('');
    try {
      const newClubIds = foundUser.clubIds.includes(createdClubId)
        ? foundUser.clubIds
        : [...foundUser.clubIds, createdClubId];
      await updateAppUser(foundUser.id, {
        role: 'admin',
        clubIds: newClubIds,
        defaultClubId: createdClubId,
      });
      await onComplete();
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '관리자 지정 실패');
    } finally { setSaving(false); }
  };

  // ── 핸들러: 새 계정 생성 → 관리자 ────────────────────────────────────────
  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createdClubId) return;
    const name = newAdminName.trim();
    if (!name) { setError('이름을 입력해주세요.'); return; }
    if (appUsers.find(u => u.username === name)) {
      setError(`"${name}" 계정이 이미 존재합니다. 기존 계정 탭을 이용해주세요.`);
      return;
    }
    setSaving(true); setError('');
    try {
      const tempClient = makeTempClient();
      const { data, error: signUpError } = await tempClient.auth.signUp({
        email: usernameToEmail(name),
        password: newAdminPassword,
        options: { emailRedirectTo: undefined },
      });
      if (signUpError) throw signUpError;
      if (!data.user) throw new Error('user null');
      const { error: insertError } = await tempClient.from('app_users').insert({
        id: data.user.id, username: name, role: 'admin',
        club_ids: [createdClubId], default_club_id: createdClubId,
      });
      if (insertError) throw insertError;
      await onComplete();
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '계정 생성 실패');
    } finally { setSaving(false); }
  };

  // ── 탭 전환 시 에러 초기화 ──────────────────────────────────────────────────
  const switchTab = (mode: 'existing' | 'new') => {
    setAdminMode(mode);
    setFoundUser(undefined);
    setSearchName('');
    setError('');
  };

  // ── JSX ────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800">
                {done ? '✅ 설정 완료!' : step === 1 ? '1단계: 클럽 정보' : '2단계: 관리자 지정'}
              </h3>
              {!done && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {step === 1
                    ? '새 클럽 정보를 입력하세요.'
                    : `"${createdClubName}" 클럽에 관리자를 지정하세요.`}
                </p>
              )}
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
          </div>
          {!done && (
            <div className="flex gap-1.5 mt-3">
              <div className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 1 ? 'bg-green-500' : 'bg-slate-200'}`} />
              <div className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 2 ? 'bg-green-500' : 'bg-slate-200'}`} />
            </div>
          )}
        </div>

        {/* Done */}
        {done ? (
          <div className="px-6 py-8 text-center space-y-4">
            <div className="text-5xl">🎉</div>
            <div>
              <p className="font-semibold text-slate-800">"{createdClubName}" 클럽이 생성되었습니다.</p>
              <p className="text-sm text-slate-500 mt-1">관리자가 로그인하면 해당 클럽을 관리할 수 있습니다.</p>
            </div>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => { setStep(1); setDone(false); setClubName(''); setClubDay('일요일'); setClubCourts(4); setClubColor('#15803d'); setCreatedClubId(''); setCreatedClubName(''); setAdminMode('existing'); setSearchName(''); setFoundUser(undefined); setNewAdminName(''); setNewAdminPassword(''); setError(''); }}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-xl hover:bg-green-700 font-medium"
              >
                또 설정하기
              </button>
              <button onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-700 text-sm rounded-xl hover:bg-slate-200 font-medium">
                닫기
              </button>
            </div>
          </div>

        ) : step === 1 ? (
          /* Step 1: Club info */
          <form onSubmit={handleStep1} className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">클럽 이름 *</label>
              <input
                value={clubName}
                onChange={e => setClubName(e.target.value)}
                required
                placeholder="예) 신종언 클럽"
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">요일</label>
                <select
                  value={clubDay}
                  onChange={e => setClubDay(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">코트 수</label>
                <select
                  value={clubCourts}
                  onChange={e => setClubCourts(parseInt(e.target.value))}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}코트</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">클럽 색상</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={clubColor}
                  onChange={e => setClubColor(e.target.value)}
                  className="w-10 h-10 rounded-xl cursor-pointer border border-slate-300"
                />
                <span className="text-sm text-slate-500">{clubColor}</span>
              </div>
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 bg-green-600 text-white text-sm rounded-xl font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? '생성 중...' : '클럽 생성 →'}
              </button>
            </div>
          </form>

        ) : (
          /* Step 2: Assign admin */
          <div className="px-6 py-5 space-y-4">
            {/* Tab switcher */}
            <div className="flex rounded-xl border border-slate-200 overflow-hidden">
              <button
                onClick={() => switchTab('existing')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${adminMode === 'existing' ? 'bg-green-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                기존 계정 검색
              </button>
              <button
                onClick={() => switchTab('new')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${adminMode === 'new' ? 'bg-green-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                새 계정 생성
              </button>
            </div>

            {adminMode === 'existing' ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">이미 앱 계정이 있는 사용자를 관리자로 지정합니다.</p>
                <div className="flex gap-2">
                  <input
                    value={searchName}
                    onChange={e => { setSearchName(e.target.value); setFoundUser(undefined); }}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleSearchUser())}
                    placeholder="아이디(이름) 입력"
                    className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button
                    type="button"
                    onClick={handleSearchUser}
                    className="px-4 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 whitespace-nowrap"
                  >
                    검색
                  </button>
                </div>
                {foundUser === null && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
                    "{searchName}" 계정을 찾을 수 없습니다. 새 계정 생성 탭을 이용해주세요.
                  </div>
                )}
                {error && foundUser !== null && <p className="text-red-500 text-sm">{error}</p>}
                {foundUser && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-bold text-sm">
                        {foundUser.username[0]}
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{foundUser.username}</p>
                        <p className="text-xs text-slate-500">
                          현재 역할: {{'superadmin':'슈퍼관리자','admin':'관리자','member':'회원'}[foundUser.role]}
                          {foundUser.clubIds.length > 0 && ` · ${foundUser.clubIds.length}개 클럽 소속`}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 bg-white rounded-lg px-3 py-2 border border-green-200">
                      "{createdClubName}" 클럽의{' '}
                      <span className="font-semibold text-purple-600">관리자</span>로 지정됩니다.
                    </p>
                    <button
                      onClick={handleAssignExisting}
                      disabled={saving}
                      className="w-full py-2.5 bg-green-600 text-white text-sm rounded-xl font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      {saving ? '지정 중...' : '관리자로 지정'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleCreateAdmin} className="space-y-3">
                <p className="text-xs text-slate-500">새 관리자 계정을 생성합니다. 아이디 = 이름으로 설정됩니다.</p>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">이름 (아이디) *</label>
                  <input
                    value={newAdminName}
                    onChange={e => setNewAdminName(e.target.value)}
                    required
                    placeholder="예) 신종언"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">비밀번호 *</label>
                  <input
                    type="password"
                    value={newAdminPassword}
                    onChange={e => setNewAdminPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="최소 6자리"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-xl px-3 py-2.5 text-xs text-purple-700">
                  역할: <span className="font-semibold">관리자</span> · 클럽:{' '}
                  <span className="font-semibold">{createdClubName}</span>
                </div>
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={saving || newAdminPassword.length < 6}
                  className="w-full py-2.5 bg-green-600 text-white text-sm rounded-xl font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? '생성 중...' : '관리자 계정 생성'}
                </button>
              </form>
            )}

            {/* 관리자 없이 완료 */}
            <div className="pt-1 border-t border-slate-100 text-center">
              <button
                onClick={async () => { await onComplete(); setDone(true); }}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                관리자 지정 없이 완료 →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
