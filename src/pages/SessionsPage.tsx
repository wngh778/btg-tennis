import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSessions, addSession, updateSession, deleteSession } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { useClub } from '../contexts/ClubContext';
import { getNextSunday, getVotingDeadline } from '../utils/matchmaking';
import type { Session, SessionType } from '../types';

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

function NewSessionForm({ onSave, onCancel, defaultCourts }: { onSave: () => void; onCancel: () => void; defaultCourts: number }) {
  const { currentClub } = useClub();
  const [date, setDate] = useState(getNextSunday());
  const [type, setType] = useState<SessionType>('weekly');
  const [courts, setCourts] = useState(defaultCourts);
  const [rounds, setRounds] = useState(6);
  const [mixedRounds, setMixedRounds] = useState(2);
  const [deadlineDay, setDeadlineDay] = useState<'friday' | 'saturday'>('saturday');
  const [trackLate, setTrackLate] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const votingDeadline = getVotingDeadline(date, deadlineDay);
    if (!currentClub) return;
    await addSession({
      clubId: currentClub.id,
      date,
      type,
      courts,
      rounds,
      mixedRounds: type === 'quarterly' ? 0 : mixedRounds,
      votingDeadline,
      isGenerated: false,
      isConfirmed: false,
      trackLate,
    });
    setLoading(false);
    onSave();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">경기 날짜 (일요일)</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
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
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">투표 마감</label>
          <select
            value={deadlineDay}
            onChange={e => setDeadlineDay(e.target.value as 'friday' | 'saturday')}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="friday">금요일 23:59</option>
            <option value="saturday">토요일 23:59</option>
          </select>
        </div>
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
        <button type="submit" disabled={loading} className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
          {loading ? '저장 중...' : '저장'}
        </button>
      </div>
    </form>
  );
}

function EditSessionForm({ session, onSave, onCancel }: { session: Session; onSave: () => void; onCancel: () => void }) {
  const [date, setDate] = useState(session.date);
  const [type, setType] = useState<SessionType>(session.type);
  const [courts, setCourts] = useState(session.courts);
  const [rounds, setRounds] = useState(session.rounds);
  const [mixedRounds, setMixedRounds] = useState(session.mixedRounds);
  const [deadlineDay, setDeadlineDay] = useState<'friday' | 'saturday'>(
    new Date(session.votingDeadline).getDay() === 5 ? 'friday' : 'saturday'
  );
  const [trackLate, setTrackLate] = useState(session.trackLate);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const votingDeadline = getVotingDeadline(date, deadlineDay);
    await updateSession(session.id, {
      date,
      type,
      courts,
      rounds,
      mixedRounds: type === 'quarterly' ? 0 : mixedRounds,
      votingDeadline,
      trackLate,
    });
    setLoading(false);
    onSave();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">경기 날짜</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
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
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">투표 마감</label>
          <select
            value={deadlineDay}
            onChange={e => setDeadlineDay(e.target.value as 'friday' | 'saturday')}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="friday">금요일 23:59</option>
            <option value="saturday">토요일 23:59</option>
          </select>
        </div>
      </div>
      <div className="pt-1">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={trackLate}
            onChange={e => setTrackLate(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
          />
          <span className="text-sm text-slate-700">지각여부 수집</span>
        </label>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
          취소
        </button>
        <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {loading ? '저장 중...' : '수정 저장'}
        </button>
      </div>
    </form>
  );
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const { isAdminUser, loading: authLoading } = useAuth();
  const { currentClub, loadingClubs } = useClub();

  const load = async () => {
    if (!currentClub) { setLoading(false); return; }
    try {
      const data = await getSessions(currentClub.id);
      setSessions(data);
    } catch (e) {
      console.error('sessions load error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (!authLoading && !loadingClubs) load(); }, [authLoading, loadingClubs, currentClub]);

  const handleDelete = async (id: string, date: string) => {
    if (!confirm(`${formatDate(date)} 경기를 삭제하시겠습니까?`)) return;
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

function SessionCard({ session, onDelete, onSaved, isAdmin }: { session: Session; onDelete: (id: string, date: string) => void; onSaved: () => void; isAdmin: boolean }) {
  const isPast = session.date < new Date().toISOString().split('T')[0];
  const isVotingClosed = new Date() > new Date(session.votingDeadline);
  const [editing, setEditing] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="p-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-slate-800">{formatDate(session.date)}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              session.type === 'quarterly' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
            }`}>
              {session.type === 'quarterly' ? '분기대회' : '주간'}
            </span>
            {session.isGenerated && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">대진 완료</span>
            )}
          </div>
          <p className="text-slate-500 text-sm">
            {session.courts}코트 · {session.rounds}라운드
            {session.type === 'weekly' && session.mixedRounds > 0 ? ` · 혼복 ${session.mixedRounds}R` : ''}
            {' · 투표 마감: '}{new Date(session.votingDeadline).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })}
            {isVotingClosed && !isPast && <span className="ml-1 text-orange-500">(마감)</span>}
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
                onClick={() => onDelete(session.id, session.date)}
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
