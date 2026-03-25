import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSessions } from '../lib/database';
import { useClub } from '../contexts/ClubContext';
import type { Session } from '../types';

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

export default function HomePage() {
  const { currentClub, loadingClubs } = useClub();
  const [upcomingSession, setUpcomingSession] = useState<Session | null>(null);
  const [pastSessions, setPastSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (loadingClubs || !currentClub) {
      if (!loadingClubs) setLoading(false);
      return;
    }
    setLoading(true);
    getSessions(currentClub.id)
      .then(sessions => {
        const today = new Date().toISOString().split('T')[0];
        const upcoming = sessions
          .filter(s => s.date >= today)
          .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
        const past = sessions
          .filter(s => s.date < today)
          .sort((a, b) => b.date.localeCompare(a.date));
        setUpcomingSession(upcoming);
        setPastSessions(past);
      })
      .catch(err => console.error('getSessions error:', err))
      .finally(() => setLoading(false));
  }, [currentClub, loadingClubs]);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-green-700 to-green-500 text-white rounded-2xl p-8 shadow-md">
        <h1 className="text-3xl font-bold mb-2">🎾 {currentClub?.name ?? '테니스 대진표'}</h1>
        <p className="text-green-200 text-sm mt-1">{currentClub ? `${currentClub.defaultCourts}개 코트 · 복식 경기` : ''}</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">불러오는 중...</div>
      ) : (
        <>
          {/* 다음 경기 */}
          {upcomingSession ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-800">
                  {upcomingSession.type === 'quarterly' ? '🏆 분기대회' : '📅 다음 경기'}
                </h2>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                  upcomingSession.type === 'quarterly'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-green-100 text-green-700'
                }`}>
                  {upcomingSession.type === 'quarterly' ? '분기대회' : '주간 경기'}
                </span>
              </div>
              <p className="text-2xl font-bold text-slate-800 mb-1">{formatDate(upcomingSession.date)}</p>
              <p className="text-slate-500 text-sm mb-4">
                {upcomingSession.courts}개 코트 · {upcomingSession.rounds}라운드
                {upcomingSession.type === 'weekly' && upcomingSession.mixedRounds > 0
                  ? ` · 혼복 ${upcomingSession.mixedRounds}라운드`
                  : ''}
              </p>
              <Link
                to={`/sessions/${upcomingSession.id}`}
                className="block w-full bg-green-600 text-white text-center rounded-lg py-2.5 font-medium hover:bg-green-700 transition-colors text-sm"
              >
                참석 투표 / 대진표 보기
              </Link>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
              <p className="text-slate-500 mb-4">예정된 경기가 없습니다.</p>
              <Link to="/sessions" className="text-green-600 font-medium hover:underline text-sm">
                경기 일정 관리하기 →
              </Link>
            </div>
          )}

          {/* 이전 경기 */}
          {pastSessions.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
                <h2 className="font-semibold text-slate-700">📂 이전 경기</h2>
              </div>
              <div className="scrollable-box" style={{ maxHeight: '300px' }}>
                <div className="divide-y divide-slate-100">
                  {pastSessions.map(s => (
                    <Link
                      key={s.id}
                      to={`/sessions/${s.id}`}
                      className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-700">{formatDate(s.date)}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {s.courts}코트 · {s.rounds}라운드
                          {s.type === 'quarterly' ? ' · 분기대회' : ''}
                          {s.isGenerated ? ' · 대진 완료' : ''}
                        </p>
                      </div>
                      <span className="text-slate-300 text-sm">→</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Link
          to="/sessions"
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-green-300 hover:shadow-md transition-all"
        >
          <div className="text-3xl mb-2">📋</div>
          <h3 className="font-semibold text-slate-800">경기 일정</h3>
          <p className="text-slate-500 text-sm mt-1">참석 투표 · 대진표</p>
        </Link>
        <Link
          to="/members"
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-green-300 hover:shadow-md transition-all"
        >
          <div className="text-3xl mb-2">👥</div>
          <h3 className="font-semibold text-slate-800">회원 목록</h3>
          <p className="text-slate-500 text-sm mt-1">NTRP · 경기 이력</p>
        </Link>
      </div>
    </div>
  );
}
