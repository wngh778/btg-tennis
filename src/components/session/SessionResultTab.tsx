import { useState } from 'react';
import type { Player, Match } from '../../types';

export function SessionResultTab({ attendingPlayers, matches }: { attendingPlayers: Player[]; matches: Match[] }) {
  const [showGuests, setShowGuests] = useState(false);

  type ResultStat = {
    name: string;
    gender: string;
    wins: number;
    losses: number;
    games: number;
    points: number; // 승점: 획득한 누적 게임 스코어 합계
  };

  const stats = new Map<string, ResultStat>();

  for (const p of attendingPlayers) {
    stats.set(p.id, { name: p.name, gender: p.gender, wins: 0, losses: 0, games: 0, points: 0 });
  }

  for (const m of matches) {
    if (!m.isCompleted || m.score1 === undefined || m.score2 === undefined) continue;
    const s1 = parseInt(m.score1, 10);
    const s2 = parseInt(m.score2, 10);
    if (isNaN(s1) || isNaN(s2)) continue;

    const team1Players = [m.team1.player1, m.team1.player2];
    const team2Players = [m.team2.player1, m.team2.player2];

    const team1Won = s1 > s2;

    for (const p of team1Players) {
      if (!stats.has(p.id)) stats.set(p.id, { name: p.name, gender: p.gender, wins: 0, losses: 0, games: 0, points: 0 });
      const s = stats.get(p.id)!;
      s.games++;
      s.points += s1; // 내 팀 획득 스코어
      if (team1Won) s.wins++; else s.losses++;
    }
    for (const p of team2Players) {
      if (!stats.has(p.id)) stats.set(p.id, { name: p.name, gender: p.gender, wins: 0, losses: 0, games: 0, points: 0 });
      const s = stats.get(p.id)!;
      s.games++;
      s.points += s2; // 내 팀 획득 스코어
      if (!team1Won) s.wins++; else s.losses++;
    }
  }

  const guestIds = new Set(attendingPlayers.filter(p => p.type === 'guest').map(p => p.id));

  const sorted = [...stats.entries()]
    .map(([id, s]) => ({ id, ...s, winRate: s.games > 0 ? Math.round((s.wins / s.games) * 100) : 0 }))
    .sort((a, b) => b.wins - a.wins || b.points - a.points || b.winRate - a.winRate || a.name.localeCompare(b.name, 'ko'));

  const displayPlayers = showGuests ? sorted : sorted.filter(s => !guestIds.has(s.id));

  const completedMatches = matches.filter(m => m.isCompleted).length;

  // 헤더와 데이터 행이 동일한 구조를 공유하기 위한 공통 셀 너비
  const colGrid = "grid grid-cols-[minmax(0,1fr)_2.5rem_2.5rem_2.5rem_3rem_3.5rem] gap-x-1 items-center flex-1";

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-700 mb-3">이번 경기 결과</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-slate-700">{matches.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">전체 매치</p>
          </div>
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{completedMatches}</p>
            <p className="text-xs text-green-500 mt-0.5">완료된 매치</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* 헤더 행 */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-3">
          <div className={colGrid}>
            <span className="text-xs font-semibold text-slate-500">이름</span>
            <span className="text-xs font-semibold text-green-600 text-center">승</span>
            <span className="text-xs font-semibold text-red-500 text-center">패</span>
            <span className="text-xs font-semibold text-slate-500 text-center">게임</span>
            <span className="text-xs font-semibold text-amber-600 text-center">승점</span>
            <span className="text-xs font-semibold text-blue-600 text-center">승률</span>
          </div>
          {/* 버튼 고정 너비 */}
          <button
            onClick={() => setShowGuests(!showGuests)}
            className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-500 hover:bg-slate-100 transition-colors shrink-0 w-20"
          >
            {showGuests ? '게스트 숨기기' : '게스트 포함'}
          </button>
        </div>

        {/* 데이터 행 */}
        <div className="divide-y divide-slate-100">
          {displayPlayers.map((s, i) => (
            <div key={s.id} className="px-5 py-3 flex items-center gap-3">
              <div className={colGrid}>
                {/* 이름 셀 */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-xs font-bold w-5 text-center shrink-0 ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-600' : 'text-slate-300'}`}>
                    {i + 1}
                  </span>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${s.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                  <span className="font-medium text-slate-800 text-sm truncate">{s.name}</span>
                  {guestIds.has(s.id) && (
                    <span className="text-xs bg-orange-100 text-orange-600 px-1 rounded shrink-0">G</span>
                  )}
                </div>
                {/* 승 */}
                <span className="text-sm font-bold text-green-600 text-center">{s.wins}</span>
                {/* 패 */}
                <span className="text-sm text-red-400 text-center">{s.losses}</span>
                {/* 게임 */}
                <span className="text-sm text-slate-500 text-center">{s.games}</span>
                {/* 승점 */}
                <span className="text-sm font-semibold text-amber-600 text-center">{s.games > 0 ? s.points : '-'}</span>
                {/* 승률 */}
                <span className={`text-sm font-bold text-center ${s.winRate >= 70 ? 'text-green-600' : s.winRate >= 50 ? 'text-blue-600' : 'text-slate-500'}`}>
                  {s.games > 0 ? `${s.winRate}%` : '-'}
                </span>
              </div>
              {/* 헤더 버튼 너비와 동일한 스페이서 */}
              <div className="shrink-0 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
