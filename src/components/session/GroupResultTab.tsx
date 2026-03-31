import { useState } from 'react';
import type { Player, Match, SessionGroup } from '../../types';

export function GroupResultTab({
  groups, matches, attendingPlayers, isAdmin
}: {
  groups: SessionGroup[];
  matches: Match[];
  attendingPlayers: Player[];
  isAdmin: boolean;
}) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    groups.length > 0 ? groups[0].id : null
  );
  const showAll = isAdmin && selectedGroupId === null;

  function calcGroupStandings(group: SessionGroup) {
    const groupMatches = matches.filter(m => m.groupId === group.id && m.isCompleted);
    const stats = new Map<string, { name: string; wins: number; losses: number; scoreDiff: number; games: number }>();

    for (const pid of group.memberIds) {
      const player = attendingPlayers.find(p => p.id === pid);
      if (player) stats.set(pid, { name: player.name, wins: 0, losses: 0, scoreDiff: 0, games: 0 });
    }

    for (const m of groupMatches) {
      if (m.score1 === undefined || m.score2 === undefined) continue;
      const s1 = parseInt(m.score1, 10);
      const s2 = parseInt(m.score2, 10);
      if (isNaN(s1) || isNaN(s2)) continue;
      const team1Won = s1 > s2;
      const diff = s1 - s2;
      for (const p of [m.team1.player1, m.team1.player2]) {
        if (!stats.has(p.id)) stats.set(p.id, { name: p.name, wins: 0, losses: 0, scoreDiff: 0, games: 0 });
        const s = stats.get(p.id)!;
        s.games++;
        if (team1Won) s.wins++; else s.losses++;
        s.scoreDiff += diff; // s1 - s2
      }
      for (const p of [m.team2.player1, m.team2.player2]) {
        if (!stats.has(p.id)) stats.set(p.id, { name: p.name, wins: 0, losses: 0, scoreDiff: 0, games: 0 });
        const s = stats.get(p.id)!;
        s.games++;
        if (!team1Won) s.wins++; else s.losses++;
        s.scoreDiff -= diff; // s2 - s1
      }
    }

    return [...stats.entries()]
      .map(([id, s]) => ({ id, ...s }))
      .sort((a, b) => b.wins - a.wins || b.scoreDiff - a.scoreDiff || a.name.localeCompare(b.name, 'ko'));
  }

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="space-y-4">
      {/* 그룹 셀렉터 */}
      <div className="flex gap-2 flex-wrap">
        {isAdmin && (
          <button
            onClick={() => setSelectedGroupId(null)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedGroupId === null ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            전체 통합
          </button>
        )}
        {groups.map(g => (
          <button
            key={g.id}
            onClick={() => setSelectedGroupId(g.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedGroupId === g.id ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            {g.name}
          </button>
        ))}
      </div>

      {/* 조별 순위 */}
      {!showAll && selectedGroupId && (() => {
        const group = groups.find(g => g.id === selectedGroupId)!;
        const standings = calcGroupStandings(group);
        const groupMatches = matches.filter(m => m.groupId === group.id);
        const completedCount = groupMatches.filter(m => m.isCompleted).length;
        return (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h2 className="font-bold text-slate-800 text-lg mb-1">{group.name} 순위</h2>
              <p className="text-sm text-slate-500">{completedCount}/{groupMatches.length} 경기 완료</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-2 items-center">
                <span className="text-xs font-semibold text-slate-400 w-8 text-center">순위</span>
                <span className="text-xs font-semibold text-slate-500">이름</span>
                <span className="text-xs font-semibold text-green-600 w-8 text-center">승</span>
                <span className="text-xs font-semibold text-red-500 w-8 text-center">패</span>
                <span className="text-xs font-semibold text-blue-600 w-12 text-center">득실</span>
                <span className="text-xs font-semibold text-slate-500 w-10 text-center">게임</span>
              </div>
              <div className="divide-y divide-slate-100">
                {standings.map((s, i) => (
                  <div key={s.id} className={`px-5 py-3 grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-2 items-center ${i < 3 ? 'bg-gradient-to-r from-slate-50 to-white' : ''}`}>
                    <div className="w-8 text-center">
                      {i < 3 ? (
                        <span className="text-lg">{medals[i]}</span>
                      ) : (
                        <span className="text-sm text-slate-400 font-medium">{i + 1}</span>
                      )}
                    </div>
                    <span className={`font-medium text-sm ${i < 3 ? 'text-slate-800 font-semibold' : 'text-slate-700'}`}>{s.name}</span>
                    <span className="text-sm font-bold text-green-600 w-8 text-center">{s.wins}</span>
                    <span className="text-sm text-red-400 w-8 text-center">{s.losses}</span>
                    <span className={`text-sm font-medium w-12 text-center ${s.scoreDiff > 0 ? 'text-blue-600' : s.scoreDiff < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                      {s.scoreDiff > 0 ? `+${s.scoreDiff}` : s.scoreDiff}
                    </span>
                    <span className="text-sm text-slate-400 w-10 text-center">{s.games}</span>
                  </div>
                ))}
                {standings.length === 0 && (
                  <div className="px-5 py-8 text-center text-slate-400 text-sm">아직 완료된 경기가 없습니다.</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 전체 통합 뷰 (관리자) */}
      {showAll && (
        <div className="space-y-4">
          {groups.map(group => {
            const standings = calcGroupStandings(group);
            const top3 = standings.slice(0, 3);
            return (
              <div key={group.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-purple-50 border-b border-purple-100">
                  <h3 className="font-bold text-purple-800">{group.name}</h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {top3.map((s, i) => (
                    <div key={s.id} className="px-5 py-3 flex items-center gap-3">
                      <span className="text-xl w-8">{medals[i] ?? ''}</span>
                      <span className="font-semibold text-slate-800">{s.name}</span>
                      <span className="ml-auto text-sm text-slate-500">{s.wins}승 {s.losses}패</span>
                    </div>
                  ))}
                  {top3.length === 0 && (
                    <div className="px-5 py-4 text-center text-slate-400 text-sm">아직 완료된 경기가 없습니다.</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
