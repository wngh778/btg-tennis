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
  // 조간 대진 경기 (groupId 없음)
  const crossMatches = matches.filter(m => !m.groupId);
  const hasCrossMatches = crossMatches.length > 0;

  // 조간 대진이 있으면 'cross' 탭을 우선 선택 (조 내부 경기가 없거나 조간만 생성된 경우 유용)
  // 조간 대진이 없으면 첫 번째 조 선택
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    hasCrossMatches ? 'cross' : (groups.length > 0 ? groups[0].id : null)
  );
  const showAll = isAdmin && selectedGroupId === null;

  // 선수→조 매핑 (조간 대진 결과 계산용)
  const playerGroupMap = new Map<string, SessionGroup>();
  for (const g of groups) {
    for (const id of g.memberIds) playerGroupMap.set(id, g);
  }

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
        s.scoreDiff += diff;
      }
      for (const p of [m.team2.player1, m.team2.player2]) {
        if (!stats.has(p.id)) stats.set(p.id, { name: p.name, wins: 0, losses: 0, scoreDiff: 0, games: 0 });
        const s = stats.get(p.id)!;
        s.games++;
        if (!team1Won) s.wins++; else s.losses++;
        s.scoreDiff -= diff;
      }
    }

    return [...stats.entries()]
      .map(([id, s]) => ({ id, ...s }))
      .sort((a, b) => b.wins - a.wins || b.scoreDiff - a.scoreDiff || a.name.localeCompare(b.name, 'ko'));
  }

  // 조간 대진 쌍별 집계
  type PairResult = {
    groupA: SessionGroup; groupB: SessionGroup;
    aWins: number; bWins: number;
    matchCount: number; completedCount: number;
    pairMatches: Match[];
  };

  const crossPairsMap = new Map<string, PairResult>();
  for (const m of crossMatches) {
    const gA = playerGroupMap.get(m.team1.player1.id);
    const gB = playerGroupMap.get(m.team2.player1.id);
    if (!gA || !gB) continue;
    // pairKey는 정렬해서 동일 방향 유지
    const [keyA, keyB] = gA.id < gB.id ? [gA, gB] : [gB, gA];
    const pairKey = `${keyA.id}|${keyB.id}`;
    if (!crossPairsMap.has(pairKey)) {
      crossPairsMap.set(pairKey, { groupA: keyA, groupB: keyB, aWins: 0, bWins: 0, matchCount: 0, completedCount: 0, pairMatches: [] });
    }
    const pr = crossPairsMap.get(pairKey)!;
    pr.matchCount++;
    pr.pairMatches.push(m);
    if (m.isCompleted && m.score1 !== undefined && m.score2 !== undefined) {
      const s1 = parseInt(m.score1, 10);
      const s2 = parseInt(m.score2, 10);
      if (!isNaN(s1) && !isNaN(s2)) {
        pr.completedCount++;
        // team1이 keyA 소속이면 s1>s2면 A승
        const team1IsA = playerGroupMap.get(m.team1.player1.id)?.id === keyA.id;
        if (team1IsA ? s1 > s2 : s2 > s1) pr.aWins++; else pr.bWins++;
      }
    }
  }
  const crossPairs = [...crossPairsMap.values()];

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
        {hasCrossMatches && (
          <button
            onClick={() => setSelectedGroupId('cross')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedGroupId === 'cross' ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            조간 대진
          </button>
        )}
      </div>

      {/* 개별 조 순위 */}
      {!showAll && selectedGroupId && selectedGroupId !== 'cross' && (() => {
        const group = groups.find(g => g.id === selectedGroupId)!;
        if (!group) return null;
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

      {/* 조간 대진 결과 */}
      {selectedGroupId === 'cross' && (
        <div className="space-y-6">
          {crossPairs.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">조간 대진 결과가 없습니다.</div>
          ) : crossPairs.map(pr => {
            const sortedMatches = [...pr.pairMatches].sort((a, b) => a.round - b.round || a.court - b.court);
            const aLeading = pr.aWins > pr.bWins;
            const bLeading = pr.bWins > pr.aWins;
            return (
              <div key={`${pr.groupA.id}|${pr.groupB.id}`} className="space-y-3">
                {/* 쌍별 전적 카드 */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 text-center">
                      <p className={`font-bold text-base ${aLeading ? 'text-green-600' : 'text-slate-500'}`}>{pr.groupA.name}</p>
                      <p className={`text-4xl font-bold mt-1 ${aLeading ? 'text-green-600' : 'text-slate-700'}`}>{pr.aWins}</p>
                    </div>
                    <div className="text-center shrink-0">
                      <p className="text-slate-300 text-xl font-light">vs</p>
                      <p className="text-xs text-slate-400 mt-1">{pr.completedCount}/{pr.matchCount} 완료</p>
                    </div>
                    <div className="flex-1 text-center">
                      <p className={`font-bold text-base ${bLeading ? 'text-green-600' : 'text-slate-500'}`}>{pr.groupB.name}</p>
                      <p className={`text-4xl font-bold mt-1 ${bLeading ? 'text-green-600' : 'text-slate-700'}`}>{pr.bWins}</p>
                    </div>
                  </div>
                </div>

                {/* 경기별 결과 */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 bg-orange-50 border-b border-orange-100">
                    <p className="text-xs font-semibold text-orange-700">경기별 결과</p>
                  </div>
                  {sortedMatches.map((m, idx) => {
                    const completed = m.isCompleted && m.score1 !== undefined && m.score2 !== undefined;
                    const s1 = completed ? parseInt(m.score1!, 10) : 0;
                    const s2 = completed ? parseInt(m.score2!, 10) : 0;
                    const team1Won = s1 > s2;
                    const gTeam1 = playerGroupMap.get(m.team1.player1.id);
                    const gTeam2 = playerGroupMap.get(m.team2.player1.id);
                    return (
                      <div key={m.id} className={`px-4 py-3 border-b border-slate-50 last:border-0 ${idx % 2 === 0 ? '' : 'bg-slate-50/50'}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 w-5 shrink-0">{m.round}R</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              {gTeam1 && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 shrink-0">{gTeam1.name}</span>
                              )}
                              <span className={`text-sm truncate ${completed && team1Won ? 'font-bold text-green-700' : 'text-slate-600'}`}>
                                {m.team1.player1.name} / {m.team1.player2.name}
                              </span>
                            </div>
                          </div>
                          <div className="shrink-0 px-2 text-center min-w-14">
                            {completed ? (
                              <span className="font-bold text-slate-800 tabular-nums">{m.score1} : {m.score2}</span>
                            ) : (
                              <span className="text-slate-300 text-sm">vs</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 text-right">
                            <div className="flex items-center gap-1 justify-end">
                              <span className={`text-sm truncate ${completed && !team1Won ? 'font-bold text-green-700' : 'text-slate-600'}`}>
                                {m.team2.player1.name} / {m.team2.player2.name}
                              </span>
                              {gTeam2 && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 shrink-0">{gTeam2.name}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
          {hasCrossMatches && crossPairs.map(pr => (
            <div key={`cross_${pr.groupA.id}|${pr.groupB.id}`} className="bg-white rounded-2xl border border-orange-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-orange-50 border-b border-orange-100">
                <h3 className="font-bold text-orange-700">조간 대진 — {pr.groupA.name} vs {pr.groupB.name}</h3>
              </div>
              <div className="px-5 py-4 flex items-center gap-4">
                <div className="flex-1 text-center">
                  <p className="text-sm font-semibold text-slate-600">{pr.groupA.name}</p>
                  <p className="text-2xl font-bold text-slate-800">{pr.aWins}승</p>
                </div>
                <span className="text-slate-300 font-light text-xl">vs</span>
                <div className="flex-1 text-center">
                  <p className="text-sm font-semibold text-slate-600">{pr.groupB.name}</p>
                  <p className="text-2xl font-bold text-slate-800">{pr.bWins}승</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
