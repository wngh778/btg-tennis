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
  };

  const stats = new Map<string, ResultStat>();

  for (const p of attendingPlayers) {
    stats.set(p.id, { name: p.name, gender: p.gender, wins: 0, losses: 0, games: 0 });
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
      if (!stats.has(p.id)) stats.set(p.id, { name: p.name, gender: p.gender, wins: 0, losses: 0, games: 0 });
      const s = stats.get(p.id)!;
      s.games++;
      if (team1Won) s.wins++; else s.losses++;
    }
    for (const p of team2Players) {
      if (!stats.has(p.id)) stats.set(p.id, { name: p.name, gender: p.gender, wins: 0, losses: 0, games: 0 });
      const s = stats.get(p.id)!;
      s.games++;
      if (!team1Won) s.wins++; else s.losses++;
    }
  }

  const guestIds = new Set(attendingPlayers.filter(p => p.type === 'guest').map(p => p.id));

  const sorted = [...stats.entries()]
    .map(([id, s]) => ({ id, ...s, winRate: s.games > 0 ? Math.round((s.wins / s.games) * 100) : 0 }))
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || a.name.localeCompare(b.name, 'ko'));

  const displayPlayers = showGuests ? sorted : sorted.filter(s => !guestIds.has(s.id));

  const completedMatches = matches.filter(m => m.isCompleted).length;

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
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center flex-1">
            <span className="text-xs font-semibold text-slate-500">이름</span>
            <span className="text-xs font-semibold text-green-600 w-10 text-center">승</span>
            <span className="text-xs font-semibold text-red-500 w-10 text-center">패</span>
            <span className="text-xs font-semibold text-slate-500 w-12 text-center">게임</span>
            <span className="text-xs font-semibold text-blue-600 w-14 text-center">승률</span>
          </div>
          <button
            onClick={() => setShowGuests(!showGuests)}
            className="ml-3 text-xs px-2 py-1 rounded border border-slate-300 text-slate-500 hover:bg-slate-100 transition-colors shrink-0"
          >
            {showGuests ? '게스트 숨기기' : '게스트 포함'}
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {displayPlayers.map((s, i) => (
            <div key={s.id} className="px-5 py-3 grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold w-5 text-center ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-600' : 'text-slate-300'}`}>
                  {i + 1}
                </span>
                <span className={`w-2 h-2 rounded-full shrink-0 ${s.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                <span className="font-medium text-slate-800 text-sm">{s.name}</span>
                {guestIds.has(s.id) && (
                  <span className="text-xs bg-orange-100 text-orange-600 px-1 rounded">G</span>
                )}
              </div>
              <span className="text-sm font-bold text-green-600 w-10 text-center">{s.wins}</span>
              <span className="text-sm text-red-400 w-10 text-center">{s.losses}</span>
              <span className="text-sm text-slate-500 w-12 text-center">{s.games}</span>
              <div className="w-14 text-center">
                <span className={`text-sm font-bold ${s.winRate >= 70 ? 'text-green-600' : s.winRate >= 50 ? 'text-blue-600' : 'text-slate-500'}`}>
                  {s.games > 0 ? `${s.winRate}%` : '-'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
