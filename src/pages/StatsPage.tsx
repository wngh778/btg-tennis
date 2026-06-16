import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { getAllMatches, getMembers, getSessions, getAllAttendance } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { useClub } from '../contexts/ClubContext';
import type { Match, Session } from '../types';
import { formatDate } from '../utils/formatting';

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
  memberIds: Set<string>;
  sessions: Session[];
}

type SessionTypeFilter = 'all' | 'weekly' | 'quarterly';

export default function StatsPage() {
  const { appUser, isAdminUser } = useAuth();
  const { currentClub, loadingClubs } = useClub();
  const [selectedSessionId, setSelectedSessionId] = useState<string>('all');
  const [stats, setStats] = useState<PlayerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showGuests, setShowGuests] = useState(false);
  const cachedData = useRef<CachedData | null>(null);

  // 필터 상태
  const [sessionTypeFilter, setSessionTypeFilter] = useState<SessionTypeFilter>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const computeStats = useCallback((
    allMatches: Match[],
    playerInfo: Map<string, { name: string; gender: 'male' | 'female' }>,
    attendanceCounts: Map<string, number>,
    sessionId: string,
    filteredSessionIds?: Set<string>
  ) => {
    let filtered: Match[];
    if (sessionId !== 'all') {
      filtered = allMatches.filter(m => m.sessionId === sessionId);
    } else if (filteredSessionIds) {
      filtered = allMatches.filter(m => filteredSessionIds.has(m.sessionId));
    } else {
      filtered = allMatches;
    }

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
        team1Players.forEach(p => { const s = ensurePlayer(p.id); s.wins += 1; s.points += 1; });
        team2Players.forEach(p => { const s = ensurePlayer(p.id); s.losses += 1; s.points -= 1; });
      } else if (s2 > s1) {
        team2Players.forEach(p => { const s = ensurePlayer(p.id); s.wins += 1; s.points += 1; });
        team1Players.forEach(p => { const s = ensurePlayer(p.id); s.losses += 1; s.points -= 1; });
      } else {
        [...team1Players, ...team2Players].forEach(p => {
          ensurePlayer(p.id).draws += 1;
          // 무승부: 승점 변화 없음 (+0)
        });
      }
    });

    // 출석 가산점: 출석 1회당 +0.5점 (경기 결과와 별개로 출석 자체를 보상)
    statMap.forEach((stat) => {
      stat.points += stat.attendanceCount * 1;
    });

    if (sessionId === 'all' && !filteredSessionIds) {
      attendanceCounts.forEach((count, playerId) => {
        if (!statMap.has(playerId)) {
          const info = playerInfo.get(playerId);
          if (info) {
            const bonus = count * 1;
            statMap.set(playerId, { id: playerId, name: info.name, gender: info.gender, wins: 0, draws: 0, losses: 0, points: bonus, attendanceCount: count });
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
  }, []);

  // currentClub?.id를 추적하여 안정적인 의존성 관리
  const clubId = currentClub?.id;
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!clubId || !currentClub) {
        if (!loadingClubs) setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(false);

      try {
        const [allMatches, members, allSessions, allAttendance] = await Promise.all([
          getAllMatches(clubId),
          getMembers(clubId),
          getSessions(clubId),
          getAllAttendance(clubId),
        ]);

        if (cancelled) return;

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

        const memberIds = new Set(members.map(m => m.id));
        cachedData.current = { allMatches, playerInfo, attendanceCounts, memberIds, sessions: allSessions };

        // 필터 초기화
        setSelectedSessionId('all');
        setSessionTypeFilter('all');
        setDateFrom('');
        setDateTo('');

        computeStats(allMatches, playerInfo, attendanceCounts, 'all');
      } catch (e) {
        if (cancelled) return;
        console.error('stats load error:', e);
        setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [clubId, loadingClubs, currentClub, computeStats, retryCount]);

  // 세션 타입 + 날짜 범위로 필터된 세션 목록
  const filteredSessions = useMemo(() => {
    if (!cachedData.current) return [];
    let sessions = cachedData.current.sessions;

    if (sessionTypeFilter !== 'all') {
      sessions = sessions.filter(s => s.type === sessionTypeFilter);
    }
    if (dateFrom) {
      sessions = sessions.filter(s => s.date >= dateFrom);
    }
    if (dateTo) {
      sessions = sessions.filter(s => s.date <= dateTo);
    }

    return sessions;
  }, [cachedData.current?.sessions, sessionTypeFilter, dateFrom, dateTo]);

  // 필터가 활성화되어 있는지 여부
  const hasActiveFilter = sessionTypeFilter !== 'all' || dateFrom !== '' || dateTo !== '';

  // 필터 변경 시 통계 재계산
  const recomputeWithFilters = useCallback((
    sessionId: string,
    typeFilter: SessionTypeFilter,
    from: string,
    to: string,
  ) => {
    if (!cachedData.current) return;
    const { allMatches, playerInfo, attendanceCounts, sessions } = cachedData.current;

    if (sessionId !== 'all') {
      computeStats(allMatches, playerInfo, attendanceCounts, sessionId);
      return;
    }

    // 필터가 없으면 전체
    const hasFilter = typeFilter !== 'all' || from !== '' || to !== '';
    if (!hasFilter) {
      computeStats(allMatches, playerInfo, attendanceCounts, 'all');
      return;
    }

    // 필터된 세션 ID 집합
    let filtered = sessions;
    if (typeFilter !== 'all') {
      filtered = filtered.filter(s => s.type === typeFilter);
    }
    if (from) {
      filtered = filtered.filter(s => s.date >= from);
    }
    if (to) {
      filtered = filtered.filter(s => s.date <= to);
    }
    const sessionIds = new Set(filtered.map(s => s.id));
    computeStats(allMatches, playerInfo, attendanceCounts, 'all', sessionIds);
  }, [computeStats]);

  const handleSessionChange = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    recomputeWithFilters(sessionId, sessionTypeFilter, dateFrom, dateTo);
  };

  const handleTypeFilterChange = (type: SessionTypeFilter) => {
    setSessionTypeFilter(type);
    setSelectedSessionId('all');
    recomputeWithFilters('all', type, dateFrom, dateTo);
  };

  const handleDateFromChange = (val: string) => {
    setDateFrom(val);
    setSelectedSessionId('all');
    recomputeWithFilters('all', sessionTypeFilter, val, dateTo);
  };

  const handleDateToChange = (val: string) => {
    setDateTo(val);
    setSelectedSessionId('all');
    recomputeWithFilters('all', sessionTypeFilter, dateFrom, val);
  };

  const handleResetFilters = () => {
    setSessionTypeFilter('all');
    setDateFrom('');
    setDateTo('');
    setSelectedSessionId('all');
    if (cachedData.current) {
      computeStats(cachedData.current.allMatches, cachedData.current.playerInfo, cachedData.current.attendanceCounts, 'all');
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

      {/* 필터 영역 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-slate-700">필터</label>
          {hasActiveFilter && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-green-600 hover:text-green-700 font-medium"
            >
              필터 초기화
            </button>
          )}
        </div>

        {/* 세션 타입 필터 */}
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">대회 유형</label>
          <div className="flex gap-2">
            {([['all', '전체'], ['weekly', '주간'], ['quarterly', '분기대회']] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => handleTypeFilterChange(val)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  sessionTypeFilter === val
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 날짜 범위 필터 */}
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">기간</label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={e => handleDateFromChange(e.target.value)}
              className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <span className="text-slate-400 text-sm">~</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => handleDateToChange(e.target.value)}
              className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        {/* 세션 드롭다운 */}
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">경기 일정</label>
          <select
            value={selectedSessionId}
            onChange={e => handleSessionChange(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="all">전체{hasActiveFilter ? ` (${filteredSessions.length}개 일정)` : ''}</option>
            {filteredSessions.map(s => (
              <option key={s.id} value={s.id}>
                {formatDate(s.date)}
                {s.type === 'quarterly' ? ' [분기대회]' : ''}
                {s.title ? ` - ${s.title}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 rounded-t-2xl flex items-center justify-between">
          <h2 className="font-semibold text-slate-700">선수별 전적 ({showGuests ? stats.length : (cachedData.current ? stats.filter(s => cachedData.current!.memberIds.has(s.id)).length : stats.length)}명)</h2>
          <button
            onClick={() => setShowGuests(!showGuests)}
            className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-500 hover:bg-slate-100 transition-colors"
          >
            {showGuests ? '게스트 숨기기' : '게스트 포함'}
          </button>
        </div>

        {loading ? (
          <div className="text-center py-10 text-slate-500">불러오는 중...</div>
        ) : loadError ? (
          <div className="text-center py-10">
            <p className="text-slate-500 mb-3">불러오기 실패</p>
            <button onClick={() => setRetryCount(c => c + 1)} className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">
              다시 시도
            </button>
          </div>
        ) : stats.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            {hasActiveFilter ? '필터 조건에 맞는 경기가 없습니다.' : '완료된 경기가 없습니다.'}
          </div>
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
                {(showGuests ? stats : stats.filter(s => cachedData.current?.memberIds.has(s.id))).map((s, idx) => {
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
        승점: 승리 +1점 · 무승부 0점 · 패배 -1점 · 출석 +1점
      </div>
    </div>
  );
}
