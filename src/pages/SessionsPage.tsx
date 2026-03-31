import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSessions, addSession, updateSession, deleteSession, addSessionGroup } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { useClub } from '../contexts/ClubContext';
import { supabase } from '../lib/supabase';
import { getNextDay } from '../utils/matchmaking';
import type { Session, SessionType, GameMode } from '../types';
import { formatDate } from '../utils/formatting';

function getDefaultDeadlineDate(sessionDate: string): string {
  const d = new Date(sessionDate + 'T00:00:00');
  d.setDate(d.getDate() - 1); // 하루 전 (토요일)
  return d.toISOString().split('T')[0];
}

function SessionForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel,
  submitClass,
}: {
  initialValues: {
    date: string;
    title: string | null;
    type: SessionType;
    gameMode: GameMode;
    groupCount: number;
    courts: number;
    rounds: number;
    mixedRounds: number;
    votingDeadline: string | null;
    trackLate: boolean;
  };
  onSubmit: (values: {
    date: string;
    title: string | null;
    type: SessionType;
    gameMode: GameMode;
    groupCount: number;
    courts: number;
    rounds: number;
    mixedRounds: number;
    votingDeadline: string | null;
    trackLate: boolean;
  }) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  submitClass: string;
}) {
  const [date, setDate] = useState(initialValues.date);
  const [useCustomTitle, setUseCustomTitle] = useState(initialValues.title !== null);
  const [customTitle, setCustomTitle] = useState(initialValues.title ?? '');
  const [type, setType] = useState<SessionType>(initialValues.type);
  const [gameMode, setGameMode] = useState<GameMode>(initialValues.gameMode);
  const [groupCount, setGroupCount] = useState(initialValues.groupCount);
  const [courts, setCourts] = useState(initialValues.courts);
  const [rounds, setRounds] = useState(initialValues.rounds);
  const [mixedRounds, setMixedRounds] = useState(initialValues.mixedRounds);
  const [trackLate, setTrackLate] = useState(initialValues.trackLate);
  const [useDeadline, setUseDeadline] = useState(initialValues.votingDeadline !== null);
  const [deadlineDate, setDeadlineDate] = useState(() => {
    if (initialValues.votingDeadline) return initialValues.votingDeadline.split('T')[0];
    return getDefaultDeadlineDate(initialValues.date);
  });
  const [deadlineTime, setDeadlineTime] = useState(() => {
    if (initialValues.votingDeadline) {
      const d = new Date(initialValues.votingDeadline);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return '23:59';
  });
  const [loading, setLoading] = useState(false);

  // 경기 날짜 변경 시 기본 마감일도 같이 이동 (사용자가 마감일을 수동 변경하지 않은 경우)
  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    setDeadlineDate(getDefaultDeadlineDate(newDate));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const votingDeadline = useDeadline
      ? new Date(`${deadlineDate}T${deadlineTime}:00`).toISOString()
      : null;
    await onSubmit({
      date,
      title: useCustomTitle && customTitle.trim() ? customTitle.trim() : null,
      type,
      gameMode,
      groupCount,
      courts,
      rounds,
      mixedRounds: type === 'quarterly' ? 0 : mixedRounds,
      votingDeadline,
      trackLate,
    });
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">경기 날짜</label>
          <input
            type="date"
            value={date}
            onChange={e => handleDateChange(e.target.value)}
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div className="col-span-2">
          <label className="flex items-center gap-2 cursor-pointer select-none mb-1">
            <input
              type="checkbox"
              checked={useCustomTitle}
              onChange={e => { setUseCustomTitle(e.target.checked); if (!e.target.checked) setCustomTitle(''); }}
              className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
            />
            <span className="text-xs font-medium text-slate-600">직접 이름 설정</span>
          </label>
          {useCustomTitle && (
            <input
              type="text"
              value={customTitle}
              onChange={e => setCustomTitle(e.target.value)}
              placeholder="예: 2026 봄 정기대회"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">경기 종류</label>
          <select
            value={type}
            onChange={e => setType(e.target.value as SessionType)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="weekly">주간 경기</option>
            <option value="quarterly">분기대회</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">경기 모드</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setGameMode('normal')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${gameMode === 'normal' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            일반경기
          </button>
          <button
            type="button"
            onClick={() => setGameMode('group')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${gameMode === 'group' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            조별경기
          </button>
        </div>
      </div>
      {gameMode === 'group' && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">조 갯수</label>
          <div className="flex gap-2">
            {[2,3,4,5,6].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setGroupCount(n)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${groupCount === n ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {n}조
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">코트 수</label>
          <select
            value={courts}
            onChange={e => setCourts(parseInt(e.target.value))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}개</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">총 라운드 수</label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setRounds(Math.max(1, rounds - 1))} className="w-8 h-8 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-100">-</button>
            <span className="flex-1 text-center font-medium">{rounds}</span>
            <button type="button" onClick={() => setRounds(rounds + 1)} className="w-8 h-8 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-100">+</button>
          </div>
        </div>
        {type === 'weekly' && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">혼복 라운드 수</label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setMixedRounds(Math.max(0, mixedRounds - 1))} className="w-8 h-8 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-100">-</button>
              <span className="flex-1 text-center font-medium">{mixedRounds}</span>
              <button type="button" onClick={() => setMixedRounds(Math.min(rounds, mixedRounds + 1))} className="w-8 h-8 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-100">+</button>
            </div>
          </div>
        )}
      </div>

      {/* 투표 마감 설정 */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={useDeadline}
            onChange={e => setUseDeadline(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
          />
          <span className="text-sm font-medium text-slate-700">투표 마감 설정</span>
        </label>
        {useDeadline && (
          <div className="flex gap-2 ml-6">
            <div className="flex-1">
              <label className="block text-xs text-slate-500 mb-1">마감 날짜</label>
              <input
                type="date"
                value={deadlineDate}
                onChange={e => setDeadlineDate(e.target.value)}
                required={useDeadline}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">마감 시간</label>
              <input
                type="time"
                value={deadlineTime}
                onChange={e => setDeadlineTime(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
        )}
      </div>

      <div className="pt-1">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={trackLate}
            onChange={e => setTrackLate(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
          />
          <span className="text-sm text-slate-700">지각여부 수집 (참석 투표 시 정시/지각 선택 가능)</span>
        </label>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
          취소
        </button>
        <button type="submit" disabled={loading} className={`px-4 py-2 text-white text-sm rounded-lg disabled:opacity-50 transition-colors ${submitClass}`}>
          {loading ? '저장 중...' : submitLabel}
        </button>
      </div>
    </form>
  );
}

function NewSessionForm({ onSave, onCancel, defaultCourts }: { onSave: () => void; onCancel: () => void; defaultCourts: number }) {
  const { currentClub } = useClub();
  const nextDay = getNextDay(currentClub?.dayOfWeek ?? '일요일');

  const handleSubmit = async (values: Parameters<React.ComponentProps<typeof SessionForm>['onSubmit']>[0]) => {
    if (!currentClub) return;
    const { groupCount, ...sessionData } = values;
    const sessionId = await addSession({
      clubId: currentClub.id,
      ...sessionData,
      title: sessionData.title ?? null,
      isGenerated: false,
      isConfirmed: false,
    });
    if (values.gameMode === 'group') {
      for (let i = 0; i < groupCount; i++) {
        const groupName = String.fromCharCode(65 + i) + '조'; // A조, B조, ...
        await addSessionGroup({ sessionId, name: groupName, orderNum: i });
      }
    }
    onSave();
  };

  return (
    <SessionForm
      initialValues={{
        date: nextDay,
        title: null,
        type: 'weekly',
        gameMode: 'normal',
        groupCount: 2,
        courts: defaultCourts,
        rounds: 6,
        mixedRounds: 2,
        votingDeadline: new Date(`${getDefaultDeadlineDate(nextDay)}T23:59:00`).toISOString(),
        trackLate: false,
      }}
      onSubmit={handleSubmit}
      onCancel={onCancel}
      submitLabel="저장"
      submitClass="bg-green-600 hover:bg-green-700"
    />
  );
}

function EditSessionForm({ session, onSave, onCancel }: { session: Session; onSave: () => void; onCancel: () => void }) {
  const handleSubmit = async (values: Parameters<React.ComponentProps<typeof SessionForm>['onSubmit']>[0]) => {
    const { groupCount: _groupCount, ...sessionData } = values;
    await updateSession(session.id, sessionData);
    onSave();
  };

  return (
    <SessionForm
      initialValues={{
        date: session.date,
        title: session.title ?? null,
        type: session.type,
        gameMode: session.gameMode ?? 'normal',
        groupCount: 2,
        courts: session.courts,
        rounds: session.rounds,
        mixedRounds: session.mixedRounds,
        votingDeadline: session.votingDeadline,
        trackLate: session.trackLate,
      }}
      onSubmit={handleSubmit}
      onCancel={onCancel}
      submitLabel="수정 저장"
      submitClass="bg-blue-600 hover:bg-blue-700"
    />
  );
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const { isAdminUser, loading: authLoading } = useAuth();
  const { currentClub, loadingClubs } = useClub();

  const clubId = currentClub?.id;

  const load = async () => {
    if (!clubId) { setLoading(false); return; }
    try {
      await supabase.auth.getSession();
      const data = await getSessions(clubId);
      setSessions(data);
    } catch (e) {
      console.error('sessions load error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !loadingClubs) load();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !authLoading && !loadingClubs) load();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [authLoading, loadingClubs, clubId]);

  const handleDelete = async (id: string, date: string, title?: string | null) => {
    const label = title ?? formatDate(date);
    if (!confirm(`${label} 경기를 삭제하시겠습니까?`)) return;
    await deleteSession(id);
    load();
  };

  const today = new Date().toISOString().split('T')[0];
  const upcoming = sessions.filter(s => s.date >= today);
  const past = sessions.filter(s => s.date < today);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">경기 일정</h1>
        {isAdminUser && (
          <button
            onClick={() => setShowAdd(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            + 일정 추가
          </button>
        )}
      </div>

      {showAdd && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">새 경기 일정 추가</h2>
          <NewSessionForm
            defaultCourts={currentClub?.defaultCourts ?? 4}
            onSave={() => { setShowAdd(false); load(); }}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-500">불러오는 중...</div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">예정</h2>
              <div className="space-y-3">
                {upcoming.map(s => (
                  <SessionCard key={s.id} session={s} onDelete={handleDelete} onSaved={load} isAdmin={isAdminUser} />
                ))}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div className="mt-4">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">지난 경기</h2>
              <div className="scrollable-box space-y-3 pr-1" style={{ maxHeight: '320px' }}>
                {past.map(s => (
                  <SessionCard key={s.id} session={s} onDelete={handleDelete} onSaved={load} isAdmin={isAdminUser} />
                ))}
              </div>
            </div>
          )}
          {sessions.length === 0 && (
            <div className="text-center py-12 text-slate-400">등록된 경기 일정이 없습니다.</div>
          )}
        </>
      )}
    </div>
  );
}

function SessionCard({ session, onDelete, onSaved, isAdmin }: { session: Session; onDelete: (id: string, date: string, title?: string | null) => void; onSaved: () => void; isAdmin: boolean }) {
  const isPast = session.date < new Date().toISOString().split('T')[0];
  const isVotingClosed = session.votingDeadline ? new Date() > new Date(session.votingDeadline) : false;
  const [editing, setEditing] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="p-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-slate-800">
              {session.title ?? formatDate(session.date)}
            </span>
            {session.title && (
              <span className="text-xs text-slate-400">{formatDate(session.date)}</span>
            )}
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              session.type === 'quarterly' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
            }`}>
              {session.type === 'quarterly' ? '분기대회' : '주간'}
            </span>
            {session.gameMode === 'group' && (
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">조별경기</span>
            )}
            {session.isGenerated && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">대진 완료</span>
            )}
          </div>
          <p className="text-slate-500 text-sm">
            {session.courts}코트 · {session.rounds}라운드
            {session.type === 'weekly' && session.mixedRounds > 0 ? ` · 혼복 ${session.mixedRounds}R` : ''}
            {session.votingDeadline
              ? <>{' · 투표 마감: '}{new Date(session.votingDeadline).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })}{isVotingClosed && !isPast && <span className="ml-1 text-orange-500">(마감)</span>}</>
              : <span className="ml-1 text-green-600"> · 투표 마감 없음</span>
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/sessions/${session.id}`}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
          >
            보기
          </Link>
          {isAdmin && (
            <>
              <button
                onClick={() => setEditing(v => !v)}
                className={`px-3 py-2 text-sm rounded-lg transition-colors ${editing ? 'bg-slate-200 text-slate-700' : 'text-blue-500 hover:text-blue-700'}`}
              >
                수정
              </button>
              <button
                onClick={() => onDelete(session.id, session.date, session.title)}
                className="px-3 py-2 text-red-400 hover:text-red-600 text-sm"
              >
                삭제
              </button>
            </>
          )}
        </div>
      </div>
      {editing && (
        <div className="px-5 pb-5 border-t border-slate-100 pt-4">
          <EditSessionForm
            session={session}
            onSave={() => { setEditing(false); onSaved(); }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </div>
  );
}
