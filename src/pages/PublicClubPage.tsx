import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getClub, getSessions, getMatches, getAttendance } from '../lib/database';
import type { Club, Session, Match, AttendanceRecord, Player } from '../types';
import { formatDate } from '../utils/formatting';

const matchTypeLabel = { male: '남복', female: '여복', mixed: '혼복' };
const matchTypeBg = { male: 'bg-blue-50 border-blue-200', female: 'bg-pink-50 border-pink-200', mixed: 'bg-purple-50 border-purple-200' };
const matchTypeBadge = { male: 'bg-blue-100 text-blue-700', female: 'bg-pink-100 text-pink-700', mixed: 'bg-purple-100 text-purple-700' };

function PublicMatchCard({ match }: { match: Match }) {
  const renderPlayer = (p: Player) => (
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
      <span className="text-sm font-medium text-slate-800 truncate">{p.name}</span>
      {p.type === 'guest' && (
        <span className="text-xs bg-orange-100 text-orange-600 px-1 rounded">G</span>
      )}
    </div>
  );

  return (
    <div className={`p-4 border-l-4 ${matchTypeBg[match.matchType]}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="font-semibold text-slate-600 text-sm">{match.round}R {match.court}코트</span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${matchTypeBadge[match.matchType]}`}>
          {matchTypeLabel[match.matchType]}
        </span>
        {match.isCompleted && <span className="text-xs text-slate-400 ml-auto">✓ 완료</span>}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-white rounded-xl p-3 border border-slate-200">
          <div className="space-y-1">
            {renderPlayer(match.team1.player1)}
            {renderPlayer(match.team1.player2)}
          </div>
        </div>
        <div className="text-center px-1">
          {match.isCompleted ? (
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold text-slate-800">{match.score1}</span>
              <span className="text-xs text-slate-400 font-bold">:</span>
              <span className="text-lg font-bold text-slate-800">{match.score2}</span>
            </div>
          ) : (
            <div className="text-slate-300 text-sm">vs</div>
          )}
        </div>
        <div className="flex-1 bg-white rounded-xl p-3 border border-slate-200">
          <div className="space-y-1">
            {renderPlayer(match.team2.player1)}
            {renderPlayer(match.team2.player2)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PublicClubPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const [club, setClub] = useState<Club | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [sessionMatches, setSessionMatches] = useState<Match[]>([]);
  const [sessionAttendance, setSessionAttendance] = useState<AttendanceRecord[]>([]);
  const [loadingSession, setLoadingSession] = useState(false);

  useEffect(() => {
    if (!clubId) return;
    (async () => {
      try {
        const [c, s] = await Promise.all([getClub(clubId), getSessions(clubId)]);
        if (!c) {
          setError('공개 접근이 설정되지 않았습니다. 관리자에게 문의하세요.');
          return;
        }
        setClub(c);
        setSessions(s.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      } catch {
        setError('공개 접근이 설정되지 않았습니다. 관리자에게 문의하세요.');
      } finally {
        setLoading(false);
      }
    })();
  }, [clubId]);

  const handleSelectSession = async (session: Session) => {
    setSelectedSession(session);
    setLoadingSession(true);
    try {
      const [m, a] = await Promise.all([getMatches(session.id), getAttendance(session.id)]);
      setSessionMatches(m);
      setSessionAttendance(a);
    } catch {
      setSessionMatches([]);
      setSessionAttendance([]);
    } finally {
      setLoadingSession(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500 text-sm">불러오는 중...</div>
      </div>
    );
  }

  if (error || !club) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-slate-600 text-base font-medium">
            {error ?? '공개 접근이 설정되지 않았습니다. 관리자에게 문의하세요.'}
          </p>
        </div>
      </div>
    );
  }

  // Compute result stats for confirmed session
  const renderResult = (matches: Match[], attendance: AttendanceRecord[]) => {
    type ResultStat = { name: string; gender: string; wins: number; losses: number; games: number };
    const statsMap = new Map<string, ResultStat>();
    const players = attendance.filter(a => a.attending).map(a => ({ id: a.playerId, name: a.playerName, gender: a.gender }));
    for (const p of players) {
      statsMap.set(p.id, { name: p.name, gender: p.gender, wins: 0, losses: 0, games: 0 });
    }
    for (const m of matches) {
      if (!m.isCompleted || m.score1 === undefined || m.score2 === undefined) continue;
      const s1 = parseInt(m.score1, 10);
      const s2 = parseInt(m.score2, 10);
      if (isNaN(s1) || isNaN(s2)) continue;
      const team1Won = s1 > s2;
      for (const p of [m.team1.player1, m.team1.player2]) {
        if (!statsMap.has(p.id)) statsMap.set(p.id, { name: p.name, gender: p.gender, wins: 0, losses: 0, games: 0 });
        const s = statsMap.get(p.id)!;
        s.games++;
        if (team1Won) s.wins++; else s.losses++;
      }
      for (const p of [m.team2.player1, m.team2.player2]) {
        if (!statsMap.has(p.id)) statsMap.set(p.id, { name: p.name, gender: p.gender, wins: 0, losses: 0, games: 0 });
        const s = statsMap.get(p.id)!;
        s.games++;
        if (!team1Won) s.wins++; else s.losses++;
      }
    }
    const sorted = [...statsMap.entries()]
      .map(([id, s]) => ({ id, ...s, winRate: s.games > 0 ? Math.round((s.wins / s.games) * 100) : 0 }))
      .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || a.name.localeCompare(b.name, 'ko'));

    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mt-4">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
          <h3 className="font-semibold text-slate-700">결과 순위</h3>
        </div>
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center">
          <span className="text-xs font-semibold text-slate-500">이름</span>
          <span className="text-xs font-semibold text-green-600 w-10 text-center">승</span>
          <span className="text-xs font-semibold text-red-500 w-10 text-center">패</span>
          <span className="text-xs font-semibold text-slate-500 w-12 text-center">게임</span>
          <span className="text-xs font-semibold text-blue-600 w-14 text-center">승률</span>
        </div>
        <div className="divide-y divide-slate-100">
          {sorted.map((s, i) => (
            <div key={s.id} className="px-5 py-3 grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold w-5 text-center ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-600' : 'text-slate-300'}`}>
                  {i + 1}
                </span>
                <span className={`w-2 h-2 rounded-full shrink-0 ${s.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                <span className="font-medium text-slate-800 text-sm">{s.name}</span>
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
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="text-white shadow-md" style={{ backgroundColor: club.color ?? '#15803d' }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-xl font-bold tracking-tight">🎾 {club.name}</span>
          <span className="text-xs text-green-100 opacity-80">공개 대진표</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {!selectedSession ? (
          <>
            <h2 className="text-base font-semibold text-slate-700">경기 일정</h2>
            {sessions.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                <p className="text-slate-400">등록된 경기 일정이 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleSelectSession(s)}
                    className="w-full text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:border-green-400 hover:shadow-md transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">
                          {s.title ?? formatDate(s.date)}
                        </p>
                        {s.title && (
                          <p className="text-xs text-slate-400 mt-0.5">{formatDate(s.date)}</p>
                        )}
                        <p className="text-xs text-slate-500 mt-0.5">
                          {s.courts}개 코트 · {s.rounds}라운드
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          s.type === 'quarterly' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {s.type === 'quarterly' ? '🏆 분기대회' : '주간 경기'}
                        </span>
                        {s.isConfirmed && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                            확정 완료
                          </span>
                        )}
                        {s.isGenerated && !s.isConfirmed && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                            대진표 있음
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <button
              onClick={() => { setSelectedSession(null); setSessionMatches([]); setSessionAttendance([]); }}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              ← 목록으로
            </button>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">
                    {selectedSession.title ?? formatDate(selectedSession.date)}
                  </h2>
                  {selectedSession.title && (
                    <p className="text-xs text-slate-400 mt-0.5">{formatDate(selectedSession.date)}</p>
                  )}
                  <p className="text-slate-500 text-sm mt-1">
                    {selectedSession.courts}개 코트 · {selectedSession.rounds}라운드
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    selectedSession.type === 'quarterly' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {selectedSession.type === 'quarterly' ? '🏆 분기대회' : '주간 경기'}
                  </span>
                  {selectedSession.isConfirmed && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                      ✓ 확정 완료
                    </span>
                  )}
                </div>
              </div>
            </div>

            {loadingSession ? (
              <div className="text-center py-10 text-slate-500 text-sm">불러오는 중...</div>
            ) : (
              <>
                {selectedSession.isConfirmed && sessionMatches.length > 0 && renderResult(sessionMatches, sessionAttendance)}

                {sessionMatches.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                    <p className="text-slate-400">아직 대진표가 없습니다.</p>
                  </div>
                ) : (() => {
                  const rounds = [...new Set(sessionMatches.map(m => m.round))].sort((a, b) => a - b);
                  return (
                    <div className="space-y-4">
                      {rounds.map(round => {
                        const roundMatches = sessionMatches.filter(m => m.round === round).sort((a, b) => a.court - b.court);
                        return (
                          <div key={round} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
                              <h3 className="font-semibold text-slate-700">{round}라운드</h3>
                            </div>
                            <div className="divide-y divide-slate-100">
                              {roundMatches.map(m => (
                                <PublicMatchCard key={m.id} match={m} />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
