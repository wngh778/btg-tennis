import { useState } from 'react';
import type { Player, Match } from '../../types';

export function PlayerDetailTab({ attendingPlayers, matches, showNtrp }: { attendingPlayers: Player[]; matches: Match[]; showNtrp: boolean }) {
  const [showGuests, setShowGuests] = useState(false);

  // Per-player game count by type
  type PlayerStat = { male: number; female: number; mixed: number; total: number };
  const stats = new Map<string, PlayerStat>();

  for (const p of attendingPlayers) {
    stats.set(p.id, { male: 0, female: 0, mixed: 0, total: 0 });
  }

  for (const m of matches) {
    const players = [m.team1.player1, m.team1.player2, m.team2.player1, m.team2.player2];
    for (const p of players) {
      if (!stats.has(p.id)) stats.set(p.id, { male: 0, female: 0, mixed: 0, total: 0 });
      const s = stats.get(p.id)!;
      s[m.matchType]++;
      s.total++;
    }
  }

  // Summary: total games by type across all matches
  const totalMale = matches.filter(m => m.matchType === 'male').length;
  const totalFemale = matches.filter(m => m.matchType === 'female').length;
  const totalMixed = matches.filter(m => m.matchType === 'mixed').length;

  const sorted = [...attendingPlayers].sort((a, b) => {
    // Sort: male first, then female; within same gender sort by name
    if (a.gender !== b.gender) return a.gender === 'male' ? -1 : 1;
    return a.name.localeCompare(b.name, 'ko');
  });

  const displayPlayers = showGuests ? sorted : sorted.filter(p => p.type !== 'guest');

  if (attendingPlayers.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
        <p className="text-slate-400">참석 예정 인원이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-700 mb-3">라운드 구성 요약</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{totalMale}</p>
            <p className="text-xs text-blue-500 mt-0.5">남복 게임</p>
          </div>
          <div className="bg-purple-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-purple-600">{totalMixed}</p>
            <p className="text-xs text-purple-500 mt-0.5">혼복 게임</p>
          </div>
          <div className="bg-pink-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-pink-600">{totalFemale}</p>
            <p className="text-xs text-pink-500 mt-0.5">여복 게임</p>
          </div>
        </div>
      </div>

      {/* Per player list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center flex-1">
            <span className="text-xs font-semibold text-slate-500">이름</span>
            <span className="text-xs font-semibold text-blue-500 w-10 text-center">남복</span>
            <span className="text-xs font-semibold text-purple-500 w-10 text-center">혼복</span>
            <span className="text-xs font-semibold text-pink-500 w-10 text-center">여복</span>
            <span className="text-xs font-semibold text-slate-600 w-12 text-center">합계</span>
          </div>
          <button
            onClick={() => setShowGuests(!showGuests)}
            className="ml-3 text-xs px-2 py-1 rounded border border-slate-300 text-slate-500 hover:bg-slate-100 transition-colors shrink-0"
          >
            {showGuests ? '게스트 숨기기' : '게스트 포함'}
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {displayPlayers.map(p => {
            const s = stats.get(p.id) ?? { male: 0, female: 0, mixed: 0, total: 0 };
            return (
              <div key={p.id} className="px-5 py-3 grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${p.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                  <span className="font-medium text-slate-800 text-sm">{p.name}</span>
                  {p.type === 'guest' && (
                    <span className="text-xs bg-orange-100 text-orange-600 px-1 rounded">G</span>
                  )}
                  {showNtrp && <span className="text-xs font-mono text-slate-400">{p.ntrp.toFixed(1)}</span>}
                </div>
                <span className="text-sm text-blue-600 font-medium w-10 text-center">{s.male > 0 ? s.male : '-'}</span>
                <span className="text-sm text-purple-600 font-medium w-10 text-center">{s.mixed > 0 ? s.mixed : '-'}</span>
                <span className="text-sm text-pink-600 font-medium w-10 text-center">{s.female > 0 ? s.female : '-'}</span>
                <span className={`text-sm font-bold w-12 text-center ${s.total === 0 ? 'text-slate-300' : 'text-slate-700'}`}>
                  {s.total}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {matches.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700 text-center">
          대진표가 생성되면 각 인원의 게임 배정 현황을 볼 수 있습니다.
        </div>
      )}
    </div>
  );
}
