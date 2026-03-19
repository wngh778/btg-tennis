import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSessions } from '../lib/database';
import type { Session } from '../types';

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

export default function HomePage() {
  const [latestSession, setLatestSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSessions()
      .then(sessions => {
        const today = new Date().toISOString().split('T')[0];
        const upcoming = sessions
          .filter(s => s.date >= today)
          .sort((a, b) => a.date.localeCompare(b.date))[0];
        setLatestSession(upcoming || sessions.sort((a, b) => b.date.localeCompare(a.date))[0] || null);
      })
      .catch(err => console.error('getSessions error:', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-green-700 to-green-500 text-white rounded-2xl p-8 shadow-md">
        <h1 className="text-3xl font-bold mb-2">🎾 테니스 대진표</h1>
        <p className="text-green-100 text-lg">매주 일요일 저녁 6시 30분 ~ 9시 30분</p>
        <p className="text-green-200 text-sm mt-1">4개 코트 · 복식 경기</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">불러오는 중...</div>
      ) : latestSession ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">
              {latestSession.type === 'quarterly' ? '🏆 분기대회' : '📅 다음 경기'}
            </h2>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              latestSession.type === 'quarterly'
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-green-100 text-green-700'
            }`}>
              {latestSession.type === 'quarterly' ? '분기대회' : '주간 경기'}
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800 mb-1">{formatDate(latestSession.date)}</p>
          <p className="text-slate-500 text-sm mb-4">
            {latestSession.courts}개 코트 · {latestSession.rounds}라운드
            {latestSession.type === 'weekly' && latestSession.mixedRounds > 0
              ? ` · 혼복 ${latestSession.mixedRounds}라운드`
              : ''}
          </p>
          <div className="flex gap-3">
            <Link
              to={`/sessions/${latestSession.id}`}
              className="flex-1 bg-green-600 text-white text-center rounded-lg py-2.5 font-medium hover:bg-green-700 transition-colors text-sm"
            >
              참석 투표 / 대진표 보기
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <p className="text-slate-500 mb-4">예정된 경기가 없습니다.</p>
          <Link to="/sessions" className="text-green-600 font-medium hover:underline text-sm">
            경기 일정 관리하기 →
          </Link>
        </div>
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
