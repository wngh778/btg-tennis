import { useEffect, useState, useRef } from 'react';
import { getAllMatches, getMembers, getSessions, getAllAttendance } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import type { Match, Session } from '../types';

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

interface PlayerStat {
  id: string;
  name: string;
  gender: 'male' | 'female';
  wins: number;
  draws: number;
  losses: number;
  points: number;
  attendanceCount: number;
}

interface CachedData {
  allMatches: Match[];
  playerInfo: Map<string, { name: string; gender: 'male' | 'female' }>;
  attendanceCounts: Map<string, number>;
}

export default function StatsPage() {
  const { appUser, isAdminUser } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('all');
  const [stats, setStats] = useState<PlayerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const cachedData = useRef<CachedData | null>(null);

  const computeStats = (
    allMatches: Match[],
    playerInfo: Map<string, { name: string; gender: 'male' | 'female' }>,
    attendanceCounts: Map<string, number>,
    sessionId: string
  ) => {
    const filtered = sessionId === 'all'
      ? allMatches
      : allMatches.filter(m => m.sessionId === sessionId);

    const statMap = new Map<string, PlayerStat>();

    const ensurePlayer = (id: string) => {
      if (!statMap.has(id)) {
        const info = playerInfo.get(id);
        statMap.set(id, {
          id,
          name: info?.name ?? id,
          gender: info?.gender ?? 'male',
          wins: 0,
          draws: 0,
          losses: 0,
          points: 0,
          attendanceCount: attendanceCounts.get(id) ?? 0,
        });
      }
      return statMap.get(id)!;
    };

    filtered.forEach(m => {
      if (!m.isCompleted || !m.score1 || !m.score2) return;
      const s1 = parseInt(m.score1, 10);
      const s2 = parseInt(m.score2, 10);
      if (isNaN(s1) || isNaN(s2)) return;

      const team1Players = [m.team1.player1, m.team1.player2];
      const team2Players = [m.team2.player1, m.team2.player2];

      if (s1 > s2) {
        team1Players.forEach(p => { const s = ensurePlayer(p.id); s.wins += 1; s.points += 3; });
        team2Players.forEach(p => { ensurePlayer(p.id).losses += 1; });
      } else if (s2 > s1) {
        team2Players.forEach(p => { const s = ensurePlayer(p.id); s.wins += 1; s.points += 3; });
        team1Players.forEach(p => { ensurePlayer(p.id).losses += 1; });
      } else {
        [...team1Players, ...team2Players].forEach(p => {
          const s = ensurePlayer(p.id);
          s.draws += 1;
          s.points += 1;
        });
      }
    });

    if (sessionId === 'all') {
      attendanceCounts.forEach((count, playerId) => {
        if (!statMap.has(playerId)) {
          const info = playerInfo.get(playerId);
          if (info) {
            statMap.set(playerId, { id: playerId, name: info.name, gender: info.gender, wins: 0, draws: 0, losses: 0, points: 0, attendanceCount: count });
          }
        }
      });
    }

    const result = Array.from(statMap.values()).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const aTotal = a.wins + a.draws + a.losses;
      const bTotal = b.wins + b.draws + b.losses;
      const aRate = aTotal > 0 ? a.wins / aTotal : 0;
      const bRate = bTotal > 0 ? b.wins / bTotal : 0;
      return bRate - aRate || b.wins - a.wins;
    });

    setStats(result);
  };

  const fetchData = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [allMatches, members, allSessions, allAttendance] = await Promise.all([
        getAllMatches(),
        getMembers(),
        getSessions(),
        getAllAttendance(),
      ]);

      setSessions(allSessions);

      const playerInfo = new Map<string, { name: string; gender: 'male' | 'female' }>();
      members.forEach(m => playerInfo.set(m.id, { name: m.name, gender: m.gender }));
      allMatches.forEach(m => {
        [m.team1.player1, m.team1.player2, m.team2.player1, m.team2.player2].forEach(p => {
          if (!playerInfo.has(p.id)) playerInfo.set(p.id, { name: p.name, gender: p.gender });
        });
      });

      const attendanceCounts = new Map<string, number>();
      allAttendance.forEach(a => {
        attendanceCounts.set(a.playerId, (attendanceCounts.get(a.playerId) ?? 0) + 1);
      });

      cachedData.current = { allMatches, playerInfo, attendanceCounts };
      computeStats(allMatches, playerInfo, attendanceCounts, 'all');
    } catch (e) {
      console.error('stats load error:', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSessionChange = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    if (cachedData.current) {
      computeStats(cachedData.current.allMatches, cachedData.current.playerInfo, cachedData.current.attendanceCounts, sessionId);
    }
  };

  const myUsername = appUser?.username;
  const myStat = myUsername ? stats.find(s => s.name === myUsername) : null;

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-xl font-bold text-slate-800">전적 현황</h1>

      {/* 개인 통계 카드 */}
      {myStat && (
        <div className="bg-gradient-to-br from-green-600 to-green-500 text-white rounded-2xl p-5 shadow-md">
          <p className="text-green-100 text-sm mb-1">내 전적</p>
          <p className="text-2xl font-bold mb-3">{myStat.name}</p>
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white/20 rounded-xl p-3 text-center">
              <p className="text-xl font-bold">{myStat.points}</p>
              <p className="text-xs text-green-100 mt-0.5">승점</p>
            </div>
            <div className="bg-white/20 rounded-xl p-3 text-center">
              <p className="text-xl font-bold">{myStat.wins}</p>
              <p className="text-xs text-green-100 mt-0.5">승</p>
            </div>
            <div className="bg-white/20 rounded-xl p-3 text-center">
              <p className="text-xl font-bold">{myStat.draws}</p>
              <p className="text-xs text-green-100 mt-0.5">무</p>
            </div>
            <div className="bg-white/20 rounded-xl p-3 text-center">
              <p className="text-xl font-bold">{myStat.attendanceCount}</p>
              <p className="text-xs text-green-100 mt-0.5">출석</p>
            </div>
          </div>
        </div>
      )}

      {/* Session filter */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <label className="block text-sm font-medium text-slate-700 mb-2">경기 일정 필터</label>
        <select
          value={selectedSessionId}
          onChange={e => handleSessionChange(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="all">전체</option>
          {sessions.map(s => (
            <option key={s.id} value={s.id}>{formatDate(s.date)}</option>
          ))}
        </select>
      </div>

      {/* Stats table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 rounded-t-2xl">
          <h2 className="font-semibold text-slate-700">선수별 전적 ({stats.length}명)</h2>
        </div>

        {loading ? (
          <div className="text-center py-10 text-slate-500">불러오는 중...</div>
        ) : loadError ? (
          <div className="text-center py-10">
            <p className="text-slate-500 mb-3">불러오기 실패</p>
            <button onClick={fetchData} className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">
              다시 시도
            </button>
          </div>
        ) : stats.length === 0 ? (
          <div className="text-center py-10 text-slate-400">완료된 경기가 없습니다.</div>
        ) : (
          <div className="scrollable-box overflow-x-auto" style={{ maxHeight: '400px' }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="px-4 py-2.5 text-left font-medium">순위</th>
                  <th className="px-4 py-2.5 text-left font-medium">이름</th>
                  <th className="px-3 py-2.5 text-center font-medium">승점</th>
                  <th className="px-3 py-2.5 text-center font-medium">승</th>
                  <th className="px-3 py-2.5 text-center font-medium">무</th>
                  <th className="px-3 py-2.5 text-center font-medium">패</th>
                  {(isAdminUser || selectedSessionId === 'all') && (
                    <th className="px-3 py-2.5 text-center font-medium">출석</th>
                  )}
                  <th className="px-3 py-2.5 text-center font-medium">승률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.map((s, idx) => {
                  const total = s.wins + s.draws + s.losses;
                  const rate = total > 0 ? Math.round((s.wins / total) * 100) : 0;
                  const isMe = myUsername === s.name;
                  return (
                    <tr key={s.id} className={`hover:bg-slate-50 transition-colors ${isMe ? 'bg-green-50' : ''}`}>
                      <td className="px-4 py-3 text-slate-400 text-center">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                          <span className={`font-medium ${isMe ? 'text-green-700' : 'text-slate-800'}`}>{s.name}</span>
                          {isMe && <span className="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full">나</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center"><span className="font-bold text-blue-600">{s.points}</span></td>
                      <td className="px-3 py-3 text-center font-medium text-green-600">{s.wins}</td>
                      <td className="px-3 py-3 text-center text-slate-500">{s.draws}</td>
                      <td className="px-3 py-3 text-center text-red-400">{s.losses}</td>
                      {(isAdminUser || selectedSessionId === 'all') && (
                        <td className="px-3 py-3 text-center text-slate-500">{s.attendanceCount}</td>
                      )}
                      <td className="px-3 py-3 text-center">
                        <span className={`font-semibold ${rate >= 50 ? 'text-green-600' : 'text-slate-500'}`}>
                          {total > 0 ? `${rate}%` : '-'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 text-xs text-slate-500">
        승점: 승리 3점 · 무승부 1점 · 패배 0점
      </div>
    </div>
  );
}
