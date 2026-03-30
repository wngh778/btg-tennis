import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  getSession, getMembers, getGuests, getAttendance,
  setAttendance, deleteAttendance, addGuest, deleteGuest,
  getMatches, saveMatches, insertMatch, deleteMatch, updateMatchScore, updateSession, getAllMatches, updateMatch, confirmSession,
} from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { useClub } from '../contexts/ClubContext';
import { generateMatches, isVotingOpen, NTRP_OPTIONS } from '../utils/matchmaking';
import type { Session, Member, Guest, AttendanceRecord, Match, Player, Gender } from '../types';

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

const matchTypeLabel = { male: '남복', female: '여복', mixed: '혼복' };
const matchTypeBg = { male: 'bg-blue-50 border-blue-200', female: 'bg-pink-50 border-pink-200', mixed: 'bg-purple-50 border-purple-200' };
const matchTypeBadge = { male: 'bg-blue-100 text-blue-700', female: 'bg-pink-100 text-pink-700', mixed: 'bg-purple-100 text-purple-700' };

type SubstituteTarget = {
  matchId: string;
  team: 'team1' | 'team2';
  slot: 'player1' | 'player2';
  player: Player;
  round: number;
} | null;

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, appUser, isAdminUser, isSuperAdmin, loading: authLoading } = useAuth();
  const { currentClub } = useClub();

  const [session, setSession] = useState<Session | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [attendance, setAttendanceState] = useState<AttendanceRecord[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'vote' | 'bracket' | 'detail' | 'result'>('vote');

  // Bracket editing
  const [editMode, setEditMode] = useState(false);
  const [pendingMatches, setPendingMatches] = useState<Match[]>([]);
  const [pendingRoundsCount, setPendingRoundsCount] = useState(0);
  const [substituteTarget, setSubstituteTarget] = useState<SubstituteTarget>(null);
  const [saving, setSaving] = useState(false);
  const [dragMatchId, setDragMatchId] = useState<string | null>(null);
  const [dragOverMatchId, setDragOverMatchId] = useState<string | null>(null);
  const [dragOverEmptyRound, setDragOverEmptyRound] = useState<number | null>(null);
  const [deletedMatchIds, setDeletedMatchIds] = useState<Set<string>>(new Set());

  // Generate settings modal
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateCourts, setGenerateCourts] = useState(4);
  const [generateRounds, setGenerateRounds] = useState(6);
  const [generateMixedRounds, setGenerateMixedRounds] = useState(2);

  // Monday schedule modal
  const [showMondayModal, setShowMondayModal] = useState(false);
  const [mondayR1Selection, setMondayR1Selection] = useState<string[]>([]);
  const [mondayCompanion, setMondayCompanion] = useState('');
  const [mondayRounds, setMondayRounds] = useState(5);

  // Guest form
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestGender, setGuestGender] = useState<Gender>('male');
  const [guestNtrp, setGuestNtrp] = useState(3.0);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [s, g, a, mx] = await Promise.all([
        getSession(id), getGuests(id), getAttendance(id), getMatches(id),
      ]);
      const clubId = s?.clubId ?? currentClub?.id;
      const m = clubId ? await getMembers(clubId) : [];
      setSession(s);
      setMembers(m);
      setGuests(g);
      setAttendanceState(a);
      setMatches(mx);
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  // auth 초기화 완료 후에만 데이터 로드 (새로고침 시 세션 미초기화 상태에서 쿼리 실행 방지)
  useEffect(() => { if (!authLoading) load(); }, [load, authLoading]);

  if (loading) return <div className="text-center py-16 text-slate-500">불러오는 중...</div>;
  if (error) return (
    <div className="text-center py-16">
      <p className="text-red-500 font-medium mb-2">오류가 발생했습니다</p>
      <p className="text-slate-500 text-sm break-all max-w-lg mx-auto">{error}</p>
    </div>
  );
  if (!session) return <div className="text-center py-16 text-slate-500">경기를 찾을 수 없습니다.</div>;

  const votingOpen = isVotingOpen(session.votingDeadline);
  const canVote = votingOpen || isAdminUser;
  const attendingIds = new Set(attendance.filter(a => a.attending).map(a => a.playerId));
  const attendingPlayers: Player[] = attendance
    .filter(a => a.attending)
    .map(a => ({ id: a.playerId, name: a.playerName, gender: a.gender, ntrp: a.ntrp, type: a.playerType }));

  // --- Voting ---
  const handleMemberVote = async (member: Member, attending: boolean) => {
    if (!canVote) return;
    await setAttendance({
      sessionId: session.id,
      playerId: member.id,
      playerType: 'member',
      playerName: member.name,
      gender: member.gender,
      ntrp: member.ntrp,
      attending,
      ...(session.trackLate && attending ? { isLate: false } : {}),
    });
    load();
  };

  const handleMemberLate = async (member: Member, isLate: boolean) => {
    if (!canVote) return;
    const rec = attendance.find(a => a.playerId === member.id);
    if (!rec || !rec.attending) return;
    await setAttendance({
      sessionId: session.id,
      playerId: member.id,
      playerType: 'member',
      playerName: member.name,
      gender: member.gender,
      ntrp: member.ntrp,
      attending: true,
      isLate,
    });
    load();
  };

  const handleAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    const guestId = await addGuest({ name: guestName, gender: guestGender, ntrp: guestNtrp, sessionId: session.id });
    await setAttendance({
      sessionId: session.id,
      playerId: guestId,
      playerType: 'guest',
      playerName: guestName,
      gender: guestGender,
      ntrp: guestNtrp,
      attending: true,
    });
    setGuestName(''); setGuestGender('male'); setGuestNtrp(3.0);
    setShowGuestForm(false);
    load();
  };

  const handleRemoveGuest = async (guest: Guest) => {
    await deleteGuest(guest.id);
    await deleteAttendance(session.id, guest.id);
    load();
  };

  // --- Bracket Generation ---
  const handleGenerateClick = () => {
    setGenerateCourts(session.courts);
    setGenerateRounds(session.rounds);
    setGenerateMixedRounds(session.mixedRounds);
    setShowGenerateModal(true);
  };

  const handleGenerate = async () => {
    setShowGenerateModal(false);
    const pastMatches = await getAllMatches(session.clubId);
    const latePlayerIds = session.trackLate
      ? new Set(attendance.filter(a => a.attending && a.isLate === true).map(a => a.playerId))
      : new Set<string>();
    const generated = generateMatches({
      sessionId: session.id,
      players: attendingPlayers,
      courts: generateCourts,
      totalRounds: generateRounds,
      mixedRounds: session.type === 'weekly' ? generateMixedRounds : 0,
      sessionType: session.type,
      pastMatches,
      latePlayerIds,
    });
    await saveMatches(session.id, generated);
    await updateSession(session.id, {
      isGenerated: true,
      courts: generateCourts,
      rounds: generateRounds,
      mixedRounds: session.type === 'weekly' ? generateMixedRounds : 0,
    });
    load();
    setTab('bracket');
  };

  const handleScoreUpdate = async (matchId: string, score1: string, score2: string) => {
    await updateMatchScore(matchId, score1, score2);
    load();
  };

  const handleConfirm = async () => {
    if (!confirm('대진표를 확정하시겠습니까? 확정 후에는 스코어를 수정할 수 없습니다.')) return;
    await confirmSession(session!.id);
    load();
    setTab('result');
  };

  // --- Bracket Editing ---
  const handleEditModeStart = () => {
    const copied: Match[] = JSON.parse(JSON.stringify(matches));
    setPendingMatches(copied);
    const maxRound = copied.length > 0 ? Math.max(...copied.map(m => m.round)) : session.rounds;
    setPendingRoundsCount(Math.max(session.rounds, maxRound));
    setSubstituteTarget(null);
    setDeletedMatchIds(new Set());
    setEditMode(true);
  };

  const handleEditCancel = () => {
    setEditMode(false);
    setPendingMatches([]);
    setPendingRoundsCount(0);
    setSubstituteTarget(null);
    setDeletedMatchIds(new Set());
  };

  const handleRoundCountChange = (delta: number) => {
    const newCount = pendingRoundsCount + delta;
    if (newCount < 1) return;
    if (delta < 0) {
      setPendingMatches(prev => prev.filter(m => m.round <= newCount));
    }
    setPendingRoundsCount(newCount);
  };

  const handleEditSave = async () => {
    setSaving(true);
    try {
      for (const pm of pendingMatches) {
        if (pm.id.startsWith('temp_')) continue;
        const original = matches.find(m => m.id === pm.id);
        if (!original) continue;
        const changed =
          JSON.stringify(original.team1) !== JSON.stringify(pm.team1) ||
          JSON.stringify(original.team2) !== JSON.stringify(pm.team2) ||
          original.round !== pm.round ||
          original.court !== pm.court;
        if (changed) {
          await updateMatch(pm.id, { team1: pm.team1, team2: pm.team2, round: pm.round, court: pm.court });
        }
      }
      for (const nm of pendingMatches.filter(m => m.id.startsWith('temp_'))) {
        const { id: _id, ...matchData } = nm;
        await insertMatch(matchData);
      }
      for (const id of deletedMatchIds) {
        await deleteMatch(id);
      }
      if (pendingRoundsCount !== session.rounds) {
        await updateSession(session.id, { rounds: pendingRoundsCount });
      }
      setEditMode(false);
      setPendingMatches([]);
      setPendingRoundsCount(0);
      setSubstituteTarget(null);
      setDeletedMatchIds(new Set());
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleAutoFillRound = (round: number) => {
    const gameCounts = new Map<string, number>();
    attendingPlayers.forEach(p => gameCounts.set(p.id, 0));
    for (const m of pendingMatches) {
      for (const p of [m.team1.player1, m.team1.player2, m.team2.player1, m.team2.player2]) {
        gameCounts.set(p.id, (gameCounts.get(p.id) || 0) + 1);
      }
    }
    const sorted = [...attendingPlayers].sort((a, b) => {
      const diff = (gameCounts.get(a.id) || 0) - (gameCounts.get(b.id) || 0);
      return diff !== 0 ? diff : b.ntrp - a.ntrp;
    });
    const courts = session!.courts;
    const newMatches: Match[] = [];
    const usedIds = new Set<string>();
    for (let c = 1; c <= courts; c++) {
      const avail = sorted.filter(p => !usedIds.has(p.id));
      if (avail.length < 4) break;
      const [p1, p2, p3, p4] = avail;
      const genders = [p1, p2, p3, p4].map(p => p.gender);
      const matchType = genders.every(g => g === 'male') ? 'male' as const
        : genders.every(g => g === 'female') ? 'female' as const
        : 'mixed' as const;
      newMatches.push({
        id: `temp_${Date.now()}_${c}`,
        sessionId: session!.id,
        round,
        court: c,
        matchType,
        team1: { player1: p1, player2: p2 },
        team2: { player1: p3, player2: p4 },
        isCompleted: false,
      });
      [p1, p2, p3, p4].forEach(p => usedIds.add(p.id));
    }
    if (newMatches.length === 0) { alert('배정할 인원이 부족합니다.'); return; }
    setPendingMatches(prev => [...prev, ...newMatches]);
  };

  const handleDeleteMatch = (matchId: string) => {
    setPendingMatches(prev => prev.filter(m => m.id !== matchId));
    if (!matchId.startsWith('temp_')) {
      setDeletedMatchIds(prev => new Set([...prev, matchId]));
    }
  };

  const handleDeleteRound = (round: number) => {
    const toDelete = pendingMatches.filter(m => m.round === round);
    toDelete.filter(m => !m.id.startsWith('temp_')).forEach(m =>
      setDeletedMatchIds(prev => new Set([...prev, m.id]))
    );
    // 삭제 후 그 위 라운드들을 한 칸씩 앞으로 당김
    setPendingMatches(prev =>
      prev
        .filter(m => m.round !== round)
        .map(m => m.round > round ? { ...m, round: m.round - 1 } : m)
    );
    setPendingRoundsCount(prev => Math.max(1, prev - 1));
  };

  const handleDragToEmptyRound = (targetRound: number) => {
    if (!dragMatchId) return;
    const newPending = pendingMatches.map(m => ({ ...m }));
    const match = newPending.find(m => m.id === dragMatchId);
    if (!match) return;
    const matchesInTargetRound = newPending.filter(m => m.round === targetRound && m.id !== dragMatchId);
    match.round = targetRound;
    match.court = matchesInTargetRound.length + 1;
    setPendingMatches(newPending);
    setDragMatchId(null);
    setDragOverMatchId(null);
    setDragOverEmptyRound(null);
  };

  const handleMondayClick = () => {
    const malePlayers = attendingPlayers.filter(p => p.gender === 'male');
    if (malePlayers.length !== 6) {
      alert(`참석 남성이 ${malePlayers.length}명입니다. 이 기능은 정확히 6명일 때 사용할 수 있습니다.`);
      return;
    }
    setMondayR1Selection([]);
    setMondayCompanion('');
    setMondayRounds(session.rounds >= 6 ? 6 : 5);
    setShowMondayModal(true);
  };

  const handleMondayGenerate = async () => {
    const malePlayers = attendingPlayers.filter(p => p.gender === 'male');
    const Y = malePlayers.find(p => p.name === '염주호');
    if (!Y) { alert('염주호 선수를 찾을 수 없습니다.'); return; }
    if (mondayR1Selection.length !== 3) { alert('첫 경기 선수를 3명 선택하세요.'); return; }
    if (!mondayCompanion) { alert('염주호의 파트너를 선택하세요.'); return; }

    const companion = malePlayers.find(p => p.id === mondayCompanion)!;
    const groupB = mondayR1Selection
      .filter(id => id !== mondayCompanion)
      .map(id => malePlayers.find(p => p.id === id)!);
    const groupC = malePlayers.filter(p => p.id !== Y.id && !mondayR1Selection.includes(p.id));

    const [B1, B2] = groupB;
    const [C1, C2] = groupC;

    setShowMondayModal(false);

    const mk = (round: number, t1p1: Player, t1p2: Player, t2p1: Player, t2p2: Player): Omit<Match, 'id'> => ({
      sessionId: session!.id,
      round,
      court: 1,
      matchType: 'male' as const,
      team1: { player1: t1p1, player2: t1p2 },
      team2: { player1: t2p1, player2: t2p2 },
      score1: undefined,
      score2: undefined,
      isCompleted: false,
    });

    // 5라운드: A(Y+companion): R1,R2,skip R3,R4,R5 | B: R1,skip R2,R3,R4,skip R5 | C: skip R1,R2,R3,skip R4,R5
    // 6라운드: A: R1,R2,skip R3,R4,R5,skip R6 | B: R1,skip R2,R3,R4,skip R5,R6 | C: skip R1,R2,R3,skip R4,R5,R6
    const generated: Omit<Match, 'id'>[] = [
      mk(1, Y, companion, B1, B2),     // A vs B
      mk(2, Y, companion, C1, C2),     // A vs C
      mk(3, B1, C1, B2, C2),           // B vs C
      mk(4, Y, B1, companion, B2),     // A+B mix
      mk(5, Y, C1, companion, C2),     // A+C mix
    ];
    if (mondayRounds >= 6) {
      generated.push(mk(6, B1, C2, B2, C1)); // B vs C (다른 팀 조합)
    }

    await saveMatches(session!.id, generated);
    await updateSession(session!.id, { isGenerated: true, courts: 1, rounds: mondayRounds, mixedRounds: 0 });
    load();
    setTab('bracket');
  };

  const handleDragDrop = (targetMatchId: string) => {
    if (!dragMatchId || dragMatchId === targetMatchId) {
      setDragMatchId(null);
      setDragOverMatchId(null);
      return;
    }
    const newPending = pendingMatches.map(m => ({ ...m }));
    const matchA = newPending.find(m => m.id === dragMatchId)!;
    const matchB = newPending.find(m => m.id === targetMatchId)!;
    [matchA.round, matchB.round] = [matchB.round, matchA.round];
    [matchA.court, matchB.court] = [matchB.court, matchA.court];
    setPendingMatches(newPending);
    setDragMatchId(null);
    setDragOverMatchId(null);
  };

  const handlePlayerClick = (
    matchId: string,
    team: 'team1' | 'team2',
    slot: 'player1' | 'player2',
    player: Player
  ) => {
    const match = pendingMatches.find(m => m.id === matchId);
    if (!match) return;
    // 같은 선수 클릭 시 팝업 닫기
    if (substituteTarget?.matchId === matchId && substituteTarget?.slot === slot && substituteTarget?.team === team) {
      setSubstituteTarget(null);
      return;
    }
    setSubstituteTarget({ matchId, team, slot, player, round: match.round });
  };

  const handleSubstitute = (restingPlayer: Player) => {
    if (!substituteTarget) return;
    const newPending = pendingMatches.map(m => {
      if (m.id !== substituteTarget.matchId) return m;
      const updated = {
        ...m,
        team1: { ...m.team1, player1: { ...m.team1.player1 }, player2: { ...m.team1.player2 } },
        team2: { ...m.team2, player1: { ...m.team2.player1 }, player2: { ...m.team2.player2 } },
      };
      updated[substituteTarget.team][substituteTarget.slot] = restingPlayer;
      return updated;
    });
    setPendingMatches(newPending);
    setSubstituteTarget(null);
  };


  const activeMembers = members.filter(m => m.isActive);
  const maleAttending = attendingPlayers.filter(p => p.gender === 'male').length;
  const femaleAttending = attendingPlayers.filter(p => p.gender === 'female').length;

  // 본인 계정에 연결된 멤버 (username === member.name)
  const myMember = appUser ? activeMembers.find(m => m.name === appUser.username) ?? null : null;
  const myAttendanceRec = myMember ? attendance.find(a => a.playerId === myMember.id) ?? null : null;
  const myAttendance = myAttendanceRec?.attending ?? null;
  const myIsLate = myAttendanceRec?.isLate;

  // 관리자: 모든 멤버 투표 가능 / 일반 유저: 본인만 가능
  const canVoteForMember = (memberId: string) => {
    if (!canVote) return false;
    if (isAdminUser) return true;
    return myMember?.id === memberId;
  };

  // 대진표와 참석 인원 불일치 감지
  const bracketPlayerIds = new Set(
    matches.flatMap(m => [m.team1.player1.id, m.team1.player2.id, m.team2.player1.id, m.team2.player2.id])
  );
  const attendingIdSet = new Set(attendingPlayers.map(p => p.id));
  const removedFromBracket = session.isGenerated && !session.isConfirmed
    ? matches.flatMap(m => [m.team1.player1, m.team1.player2, m.team2.player1, m.team2.player2])
        .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i && !attendingIdSet.has(p.id))
    : [];
  const addedToBracket = session.isGenerated && !session.isConfirmed
    ? attendingPlayers.filter(p => !bracketPlayerIds.has(p.id))
    : [];

  const handleSyncBracket = async () => {
    if (removedFromBracket.length > 0) {
      const removedSet = new Set(removedFromBracket.map(p => p.id));
      const toDelete = matches.filter(m =>
        removedSet.has(m.team1.player1.id) || removedSet.has(m.team1.player2.id) ||
        removedSet.has(m.team2.player1.id) || removedSet.has(m.team2.player2.id)
      );
      for (const m of toDelete) await deleteMatch(m.id);
    }
    load();
  };

  // 선수별 경기 번호 계산 (몇 번째 경기인지)
  const displaySource = editMode ? pendingMatches : matches;
  const matchGameNumbers = new Map<string, number>(); // `${matchId}_${playerId}` → N번째
  const cumGameCount = new Map<string, number>();
  for (const m of [...displaySource].sort((a, b) => a.round - b.round || a.court - b.court)) {
    for (const p of [m.team1.player1, m.team1.player2, m.team2.player1, m.team2.player2]) {
      const n = (cumGameCount.get(p.id) || 0) + 1;
      cumGameCount.set(p.id, n);
      matchGameNumbers.set(`${m.id}_${p.id}`, n);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-slate-800">{formatDate(session.date)}</h1>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                session.type === 'quarterly' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
              }`}>
                {session.type === 'quarterly' ? '🏆 분기대회' : '주간 경기'}
              </span>
            </div>
            <p className="text-slate-500 text-sm">
              {session.courts}개 코트 · {session.rounds}라운드
              {session.type === 'weekly' && session.mixedRounds > 0 ? ` · 혼복 ${session.mixedRounds}R` : ''}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {session.votingDeadline
                ? <>투표 마감: {new Date(session.votingDeadline).toLocaleDateString('ko-KR', {
                    month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit'
                  })}
                  {votingOpen
                    ? <span className="ml-1 text-green-500 font-medium">· 투표 진행 중</span>
                    : <span className="ml-1 text-orange-500 font-medium">· 투표 마감</span>
                  }
                </>
                : <span className="text-green-500 font-medium">투표 마감 없음 · 항상 참여 가능</span>
              }
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-green-600">{attendingIds.size}명</p>
            <p className="text-xs text-slate-400">참석 예정 · 남{maleAttending} 여{femaleAttending}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-2xl overflow-hidden">
        <button
          onClick={() => setTab('vote')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            tab === 'vote' ? 'text-green-600 border-b-2 border-green-600 bg-green-50' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          참석 투표
        </button>
        <button
          onClick={() => setTab('bracket')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            tab === 'bracket' ? 'text-green-600 border-b-2 border-green-600 bg-green-50' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          대진표 {session.isGenerated ? '✓' : ''}
        </button>
        <button
          onClick={() => setTab('detail')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            tab === 'detail' ? 'text-green-600 border-b-2 border-green-600 bg-green-50' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          참석인원상세
        </button>
        {session.isConfirmed && (
          <button
            onClick={() => setTab('result')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === 'result' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            결과 🏆
          </button>
        )}
      </div>

      {/* Vote Tab */}
      {tab === 'vote' && (
        <div className="space-y-4">
          {!votingOpen && !isAdminUser && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-700">
              투표 마감 후에는 관리자만 참석 여부를 변경할 수 있습니다.
            </div>
          )}

          {/* 내 참석 투표 박스 */}
          {user && myMember && (
            <div className={`rounded-2xl border-2 p-5 ${
              myAttendance === true ? 'bg-green-50 border-green-300' :
              myAttendance === false ? 'bg-red-50 border-red-200' :
              'bg-white border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-0.5">내 참석 여부</p>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${myMember.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                    <p className="text-lg font-bold text-slate-800">{myMember.name}</p>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {myAttendance === true ? '✅ 참석 예정' : myAttendance === false ? '❌ 불참' : '미응답'}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => canVote && handleMemberVote(myMember, true)}
                    disabled={!canVote}
                    className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                      myAttendance === true
                        ? 'bg-green-500 text-white shadow-sm'
                        : canVote
                        ? 'bg-slate-100 text-slate-600 hover:bg-green-100 hover:text-green-700'
                        : 'bg-slate-50 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    참석
                  </button>
                  <button
                    onClick={() => canVote && handleMemberVote(myMember, false)}
                    disabled={!canVote}
                    className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                      myAttendance === false
                        ? 'bg-red-400 text-white shadow-sm'
                        : canVote
                        ? 'bg-slate-100 text-slate-600 hover:bg-red-100 hover:text-red-500'
                        : 'bg-slate-50 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    불참
                  </button>
                </div>
              </div>
              {session.trackLate && myAttendance === true && (
                <div className="mt-3 pt-3 border-t border-slate-200 flex items-center gap-2">
                  <span className="text-xs text-slate-500 mr-1">지각여부</span>
                  <button
                    onClick={() => canVote && handleMemberLate(myMember, false)}
                    disabled={!canVote}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      myIsLate === false
                        ? 'bg-green-500 text-white'
                        : canVote
                        ? 'bg-slate-100 text-slate-600 hover:bg-green-100 hover:text-green-700'
                        : 'bg-slate-50 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    정시참여
                  </button>
                  <button
                    onClick={() => canVote && handleMemberLate(myMember, true)}
                    disabled={!canVote}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      myIsLate === true
                        ? 'bg-orange-400 text-white'
                        : canVote
                        ? 'bg-slate-100 text-slate-600 hover:bg-orange-100 hover:text-orange-600'
                        : 'bg-slate-50 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    지각
                  </button>
                </div>
              )}
            </div>
          )}

          {user && !myMember && !isAdminUser && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-500 text-center">
              계정({appUser?.username})과 연결된 회원을 찾을 수 없습니다. 관리자에게 문의하세요.
            </div>
          )}

          {/* Member list */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 rounded-t-2xl flex items-center justify-between">
              <h2 className="font-semibold text-slate-700">회원 참석 여부</h2>
              <span className="text-sm text-slate-400">{activeMembers.length}명</span>
            </div>
            <div className="scrollable-box" style={{ maxHeight: '384px' }}>
              <div className="divide-y divide-slate-100">
              {activeMembers.map(m => {
                const rec = attendance.find(a => a.playerId === m.id);
                const attending = rec?.attending ?? null;
                const canVoteThis = canVoteForMember(m.id);
                const isMe = m.id === myMember?.id;
                return (
                  <div key={m.id} className={`px-5 py-3 flex items-center justify-between ${isMe ? 'bg-green-50' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${m.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                      <span className={`font-medium ${isMe ? 'text-green-700' : 'text-slate-800'}`}>{m.name}</span>
                      {isMe && <span className="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full">나</span>}
                      {isAdminUser && <span className="text-xs font-mono text-slate-400">{m.ntrp.toFixed(1)}</span>}
                    </div>
                    <div className="flex gap-2 items-center">
                      <button
                        onClick={() => canVoteThis && handleMemberVote(m, true)}
                        disabled={!canVoteThis}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          attending === true
                            ? 'bg-green-500 text-white'
                            : canVoteThis
                            ? 'bg-slate-100 text-slate-600 hover:bg-green-100 hover:text-green-700'
                            : 'bg-slate-50 text-slate-300 cursor-not-allowed'
                        }`}
                      >
                        참석
                      </button>
                      <button
                        onClick={() => canVoteThis && handleMemberVote(m, false)}
                        disabled={!canVoteThis}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          attending === false
                            ? 'bg-red-400 text-white'
                            : canVoteThis
                            ? 'bg-slate-100 text-slate-600 hover:bg-red-100 hover:text-red-600'
                            : 'bg-slate-50 text-slate-300 cursor-not-allowed'
                        }`}
                      >
                        불참
                      </button>
                      {session.trackLate && attending === true && (
                        canVoteThis ? (
                          <button
                            onClick={() => handleMemberLate(m, !(rec?.isLate ?? false))}
                            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                              rec?.isLate
                                ? 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                                : 'bg-green-50 text-green-600 hover:bg-green-100'
                            }`}
                          >
                            {rec?.isLate ? '지각' : '정시'}
                          </button>
                        ) : (
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            rec?.isLate
                              ? 'bg-orange-100 text-orange-600'
                              : rec?.isLate === false
                              ? 'bg-green-50 text-green-600'
                              : 'bg-slate-100 text-slate-400'
                          }`}>
                            {rec?.isLate ? '지각' : rec?.isLate === false ? '정시' : '-'}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </div>

          {/* Guests */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="font-semibold text-slate-700">게스트 ({guests.length}명)</h2>
              {isAdminUser && (
                <button
                  onClick={() => setShowGuestForm(!showGuestForm)}
                  className="text-sm text-green-600 font-medium hover:text-green-700"
                >
                  + 게스트 추가
                </button>
              )}
            </div>

            {showGuestForm && (
              <form onSubmit={handleAddGuest} className="px-5 py-4 border-b border-slate-100 bg-green-50">
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">이름</label>
                    <input
                      value={guestName}
                      onChange={e => setGuestName(e.target.value)}
                      required
                      placeholder="게스트 이름"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">성별</label>
                    <select
                      value={guestGender}
                      onChange={e => setGuestGender(e.target.value as Gender)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="male">남성</option>
                      <option value="female">여성</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">NTRP</label>
                    <select
                      value={guestNtrp}
                      onChange={e => setGuestNtrp(parseFloat(e.target.value))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      {NTRP_OPTIONS.map(n => <option key={n} value={n}>{n.toFixed(1)}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowGuestForm(false)} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5">취소</button>
                  <button type="submit" className="px-4 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors">추가</button>
                </div>
              </form>
            )}

            <div className="divide-y divide-slate-100">
              {guests.length === 0 ? (
                <p className="px-5 py-4 text-slate-400 text-sm text-center">등록된 게스트가 없습니다.</p>
              ) : (
                guests.map(g => (
                  <div key={g.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded text-xs font-medium">게스트</span>
                      <span className={`w-2 h-2 rounded-full ${g.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                      <span className="font-medium text-slate-800">{g.name}</span>
                      {isAdminUser && <span className="text-xs font-mono text-slate-400">{g.ntrp.toFixed(1)}</span>}
                      <span className="text-xs text-slate-400">{g.gender === 'male' ? '남' : '여'}</span>
                    </div>
                    {isAdminUser && (
                      <button
                        onClick={() => handleRemoveGuest(g)}
                        className="text-red-400 hover:text-red-600 text-sm"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Monday Schedule Modal */}
      {showMondayModal && (() => {
        const malePlayers = attendingPlayers.filter(p => p.gender === 'male');
        const yomPlayer = malePlayers.find(p => p.name === '염주호');
        const othersForR1 = malePlayers.filter(p => p.name !== '염주호');
        const toggleR1 = (id: string) => {
          setMondayR1Selection(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 3 ? [...prev, id] : prev
          );
          setMondayCompanion(prev => prev === id ? '' : prev);
        };
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800">월요일 편성</h3>
                <p className="text-xs text-slate-500 mt-1">첫 경기 4명 선택 후 염주호 파트너를 지정하세요.</p>
              </div>

              {/* Step 1: R1 선수 선택 */}
              <div className="px-5 pt-4 pb-2">
                <p className="text-xs font-semibold text-slate-500 mb-2">
                  1단계 — 첫 경기(R1) 참여 선수 선택 <span className="text-indigo-500">({mondayR1Selection.length}/3 선택)</span>
                </p>
                {/* 염주호 고정 */}
                {yomPlayer && (
                  <div className="flex items-center gap-3 p-2.5 rounded-xl border mb-1 bg-indigo-50 border-indigo-300">
                    <input type="checkbox" checked disabled className="accent-indigo-600" />
                    <span className="font-medium text-indigo-800">{yomPlayer.name}</span>
                    <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 rounded">고정</span>
                    <span className="ml-auto text-xs text-slate-400 font-mono">{yomPlayer.ntrp.toFixed(1)}</span>
                  </div>
                )}
                {othersForR1.map(p => {
                  const selected = mondayR1Selection.includes(p.id);
                  return (
                    <label key={p.id}
                      className="flex items-center gap-3 p-2.5 rounded-xl border mb-1 cursor-pointer hover:bg-slate-50 transition-colors"
                      style={{ borderColor: selected ? '#6366f1' : '#e2e8f0', backgroundColor: selected ? '#eef2ff' : '' }}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleR1(p.id)}
                        disabled={!selected && mondayR1Selection.length >= 3}
                        className="accent-indigo-600"
                      />
                      <span className="font-medium text-slate-800">{p.name}</span>
                      <span className="ml-auto text-xs text-slate-400 font-mono">{p.ntrp.toFixed(1)}</span>
                    </label>
                  );
                })}
              </div>

              {/* Step 2: 파트너 선택 */}
              {mondayR1Selection.length === 3 && (
                <div className="px-5 pb-3 pt-1">
                  <p className="text-xs font-semibold text-slate-500 mb-2">
                    2단계 — 염주호 파트너 선택 <span className="text-xs font-normal text-slate-400">(함께 R1·R2·R4·R5 출전)</span>
                  </p>
                  {mondayR1Selection.map(id => {
                    const p = malePlayers.find(mp => mp.id === id)!;
                    return (
                      <label key={id}
                        className="flex items-center gap-3 p-2.5 rounded-xl border mb-1 cursor-pointer hover:bg-slate-50 transition-colors"
                        style={{ borderColor: mondayCompanion === id ? '#6366f1' : '#e2e8f0', backgroundColor: mondayCompanion === id ? '#eef2ff' : '' }}>
                        <input
                          type="radio"
                          name="mondayCompanion"
                          checked={mondayCompanion === id}
                          onChange={() => setMondayCompanion(id)}
                          className="accent-indigo-600"
                        />
                        <span className="font-medium text-slate-800">{p.name}</span>
                        <span className="ml-auto text-xs text-slate-400 font-mono">{p.ntrp.toFixed(1)}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Step 3: 라운드 수 */}
              <div className="px-5 pb-3 pt-1">
                <p className="text-xs font-semibold text-slate-500 mb-2">3단계 — 라운드 수</p>
                <div className="flex gap-2">
                  {[5, 6].map(r => (
                    <button
                      key={r}
                      onClick={() => setMondayRounds(r)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mondayRounds === r ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {r}라운드
                    </button>
                  ))}
                </div>
              </div>

              <div className="px-5 py-4 border-t border-slate-100 flex gap-2 justify-end">
                <button onClick={() => setShowMondayModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">취소</button>
                <button
                  onClick={handleMondayGenerate}
                  disabled={mondayR1Selection.length !== 3 || !mondayCompanion}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-40"
                >
                  편성 생성
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Substitute Player Modal */}
      {substituteTarget && (() => {
        const playingInRound = new Set(
          pendingMatches
            .filter(m => m.round === substituteTarget.round)
            .flatMap(m => [m.team1.player1.id, m.team1.player2.id, m.team2.player1.id, m.team2.player2.id])
        );
        const restingPlayers = attendingPlayers.filter(p => !playingInRound.has(p.id));
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800">선수 교체</h3>
                <p className="text-xs text-slate-500 mt-1">
                  <span className="font-medium text-amber-600">{substituteTarget.player.name}</span>을(를) 대기 선수로 교체
                </p>
              </div>
              <div className="px-5 py-3 max-h-72 overflow-y-auto">
                {restingPlayers.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">대기 중인 선수가 없습니다.</p>
                ) : (
                  <div className="space-y-1.5">
                    {restingPlayers.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handleSubstitute(p)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-green-400 hover:bg-green-50 transition-colors text-left"
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${p.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                        <span className="font-medium text-slate-800 text-sm">{p.name}</span>
                        {p.type === 'guest' && (
                          <span className="text-xs bg-orange-100 text-orange-600 px-1 rounded">G</span>
                        )}
                        <span className="ml-auto text-xs text-slate-400 font-mono">{p.ntrp.toFixed(1)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-5 py-3 border-t border-slate-100">
                <button
                  onClick={() => setSubstituteTarget(null)}
                  className="w-full py-2 text-sm text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Generate Settings Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800 text-lg">
                {session.isGenerated ? '대진표 재생성 설정' : '대진표 생성 설정'}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">참석 인원 {attendingPlayers.length}명 · 남{maleAttending} 여{femaleAttending}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">코트 수</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5, 6].map(n => (
                    <button
                      key={n}
                      onClick={() => setGenerateCourts(n)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        generateCourts === n
                          ? 'bg-green-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">총 라운드 수</label>
                <div className="flex gap-2">
                  {[4, 5, 6, 7, 8].map(n => (
                    <button
                      key={n}
                      onClick={() => {
                        setGenerateRounds(n);
                        setGenerateMixedRounds(prev => Math.min(prev, n));
                      }}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        generateRounds === n
                          ? 'bg-green-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              {session.type === 'weekly' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    혼복 라운드 수
                    <span className="text-xs text-slate-400 font-normal ml-1">(전체 {generateRounds}R 중)</span>
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {Array.from({ length: generateRounds + 1 }, (_, i) => i).map(n => (
                      <button
                        key={n}
                        onClick={() => setGenerateMixedRounds(Math.min(n, generateRounds))}
                        className={`w-10 py-2 rounded-lg text-sm font-medium transition-colors ${
                          generateMixedRounds === n
                            ? 'bg-purple-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setShowGenerateModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleGenerate}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
              >
                {session.isGenerated ? '재생성' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bracket Tab */}
      {tab === 'bracket' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              참석 인원 {attendingPlayers.length}명 · 남{maleAttending} 여{femaleAttending}
            </p>
            <div className="flex items-center gap-2">
              {isAdminUser && !editMode && matches.length > 0 && (
                <button
                  onClick={handleEditModeStart}
                  className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
                >
                  편집
                </button>
              )}
              {isAdminUser && editMode && (
                <>
                  <div className="flex items-center gap-1 border border-slate-300 rounded-lg overflow-hidden">
                    <button
                      onClick={() => handleRoundCountChange(-1)}
                      disabled={pendingRoundsCount <= 1}
                      className="px-2.5 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                    >
                      −
                    </button>
                    <span className="px-2 text-sm font-medium text-slate-700">{pendingRoundsCount}R</span>
                    <button
                      onClick={() => handleRoundCountChange(1)}
                      className="px-2.5 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={handleEditCancel}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleEditSave}
                    disabled={saving}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </>
              )}
              {isAdminUser && !editMode && session.isGenerated && !session.isConfirmed && (
                <button
                  onClick={handleConfirm}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  확정
                </button>
              )}
              {isSuperAdmin && !editMode && (
                <button
                  onClick={handleMondayClick}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  월요일 편성
                </button>
              )}
              {isAdminUser && !editMode && (
                <button
                  onClick={handleGenerateClick}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  {session.isGenerated ? '대진표 재생성' : '대진표 생성'}
                </button>
              )}
            </div>
          </div>

          {session.isConfirmed && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700">
              ✓ 확정된 결과입니다. 스코어 수정이 잠겨 있습니다.
            </div>
          )}
          {!editMode && (removedFromBracket.length > 0 || addedToBracket.length > 0) && isAdminUser && (
            <div className="bg-orange-50 border border-orange-300 rounded-xl p-3 text-sm text-orange-800">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="font-semibold">참석 인원 변경 감지됨</p>
                  {removedFromBracket.length > 0 && (
                    <p className="text-xs">불참으로 변경: {removedFromBracket.map(p => p.name).join(', ')} → 해당 경기 삭제</p>
                  )}
                  {addedToBracket.length > 0 && (
                    <p className="text-xs">새 참석: {addedToBracket.map(p => p.name).join(', ')} → 편집 모드에서 추가 필요</p>
                  )}
                </div>
                {removedFromBracket.length > 0 && (
                  <button
                    onClick={handleSyncBracket}
                    className="shrink-0 px-3 py-1.5 bg-orange-600 text-white text-xs rounded-lg hover:bg-orange-700 font-medium"
                  >
                    대진표 업데이트
                  </button>
                )}
              </div>
            </div>
          )}
          {editMode && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
              선수 이름 클릭 → 위치 교환 &nbsp;|&nbsp; 경기 카드 드래그 → 순서 이동
            </div>
          )}

          {matches.length === 0 && !editMode ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
              <p className="text-slate-400 text-lg mb-2">아직 대진표가 없습니다.</p>
              {isAdminUser && <p className="text-slate-400 text-sm">참석 투표 완료 후 대진표를 생성하세요.</p>}
            </div>
          ) : (() => {
            const displaySource = editMode ? pendingMatches : matches;
            const displayRounds = editMode
              ? Array.from({ length: pendingRoundsCount }, (_, i) => i + 1)
              : Array.from(new Set(displaySource.map(m => m.round))).sort((a, b) => a - b);
            return displayRounds.map(round => (
              <RoundCard
                key={round}
                round={round}
                matches={matches.filter(m => m.round === round)}
                attendingPlayers={attendingPlayers}
                canEditScore={!!user && !session.isConfirmed}
                onScoreUpdate={handleScoreUpdate}
                editMode={editMode}
                pendingMatches={displaySource.filter(m => m.round === round)}
                substituteTarget={substituteTarget}
                onPlayerClick={handlePlayerClick}
                showNtrp={isAdminUser}
                dragMatchId={dragMatchId}
                dragOverMatchId={dragOverMatchId}
                onDragStart={setDragMatchId}
                onDragOver={setDragOverMatchId}
                onDrop={handleDragDrop}
                dragOverEmptyRound={dragOverEmptyRound}
                onDragOverEmptyRound={setDragOverEmptyRound}
                onDropIntoRound={handleDragToEmptyRound}
                matchGameNumbers={matchGameNumbers}
                onAutoFillRound={handleAutoFillRound}
                onDeleteMatch={handleDeleteMatch}
                onDeleteRound={handleDeleteRound}
              />
            ));
          })()}
        </div>
      )}

      {/* Detail Tab */}
      {tab === 'detail' && (
        <PlayerDetailTab attendingPlayers={attendingPlayers} matches={matches} showNtrp={isAdminUser} />
      )}

      {/* Result Tab */}
      {tab === 'result' && session.isConfirmed && (
        <SessionResultTab attendingPlayers={attendingPlayers} matches={matches} />
      )}
    </div>
  );
}

function PlayerDetailTab({ attendingPlayers, matches, showNtrp }: { attendingPlayers: Player[]; matches: Match[]; showNtrp: boolean }) {
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
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center">
          <span className="text-xs font-semibold text-slate-500">이름</span>
          <span className="text-xs font-semibold text-blue-500 w-10 text-center">남복</span>
          <span className="text-xs font-semibold text-purple-500 w-10 text-center">혼복</span>
          <span className="text-xs font-semibold text-pink-500 w-10 text-center">여복</span>
          <span className="text-xs font-semibold text-slate-600 w-12 text-center">합계</span>
        </div>
        <div className="divide-y divide-slate-100">
          {sorted.map(p => {
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

function SessionResultTab({ attendingPlayers, matches }: { attendingPlayers: Player[]; matches: Match[] }) {
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

  const sorted = [...stats.entries()]
    .map(([id, s]) => ({ id, ...s, winRate: s.games > 0 ? Math.round((s.wins / s.games) * 100) : 0 }))
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || a.name.localeCompare(b.name, 'ko'));

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
    </div>
  );
}

function RoundCard({
  round, matches, attendingPlayers, canEditScore, onScoreUpdate,
  editMode, pendingMatches, substituteTarget, onPlayerClick, showNtrp,
  dragMatchId, dragOverMatchId, onDragStart, onDragOver, onDrop,
  dragOverEmptyRound, onDragOverEmptyRound, onDropIntoRound,
  matchGameNumbers, onAutoFillRound, onDeleteMatch, onDeleteRound,
}: {
  round: number;
  matches: Match[];
  attendingPlayers: Player[];
  canEditScore: boolean;
  onScoreUpdate: (id: string, s1: string, s2: string) => void;
  editMode: boolean;
  pendingMatches: Match[];
  substituteTarget: SubstituteTarget;
  onPlayerClick: (matchId: string, team: 'team1' | 'team2', slot: 'player1' | 'player2', player: Player) => void;
  showNtrp: boolean;
  dragMatchId: string | null;
  dragOverMatchId: string | null;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: (id: string) => void;
  dragOverEmptyRound?: number | null;
  onDragOverEmptyRound?: (round: number | null) => void;
  onDropIntoRound?: (round: number) => void;
  matchGameNumbers?: Map<string, number>;
  onAutoFillRound?: (round: number) => void;
  onDeleteMatch?: (matchId: string) => void;
  onDeleteRound?: (round: number) => void;
}) {
  const displayMatches = editMode ? pendingMatches : matches;
  const playingIds = new Set(
    displayMatches.flatMap(m => [m.team1.player1.id, m.team1.player2.id, m.team2.player1.id, m.team2.player2.id])
  );
  const restingPlayers = attendingPlayers.filter(p => !playingIds.has(p.id));
  const isEmptyRound = editMode && displayMatches.length === 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <h2 className="font-semibold text-slate-700">{round}라운드</h2>
        {editMode && onDeleteRound && (
          <button
            onClick={() => onDeleteRound(round)}
            className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors"
          >
            라운드 삭제
          </button>
        )}
      </div>
      {isEmptyRound ? (
        <div
          className={`px-5 py-6 text-center transition-colors ${dragOverEmptyRound === round ? 'bg-indigo-50 border-2 border-dashed border-indigo-400' : 'border-2 border-dashed border-slate-200'}`}
          onDragOver={e => { e.preventDefault(); onDragOverEmptyRound?.(round); }}
          onDragLeave={() => onDragOverEmptyRound?.(null)}
          onDrop={e => { e.preventDefault(); onDropIntoRound?.(round); onDragOverEmptyRound?.(null); }}
        >
          <p className="text-sm text-slate-400 mb-3">경기 카드를 여기로 드래그하세요</p>
          {onAutoFillRound && (
            <button
              onClick={() => onAutoFillRound(round)}
              className="px-4 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 font-medium"
            >
              자동 배정
            </button>
          )}
        </div>
      ) : (
        <div
          className={`divide-y divide-slate-100 ${editMode && dragOverEmptyRound === round ? 'bg-indigo-50' : ''}`}
          onDragOver={e => { if (displayMatches.length > 0) return; e.preventDefault(); onDragOverEmptyRound?.(round); }}
          onDrop={e => { if (displayMatches.length > 0) return; e.preventDefault(); onDropIntoRound?.(round); }}
        >
          {displayMatches.sort((a, b) => a.court - b.court).map(m => (
            <MatchCard
              key={m.id}
              match={m}
              canEditScore={canEditScore}
              onScoreUpdate={onScoreUpdate}
              editMode={editMode}
              substituteTarget={substituteTarget}
              onPlayerClick={onPlayerClick}
              showNtrp={showNtrp}
              onDragStart={onDragStart}
              onDragOver={() => onDragOver(m.id)}
              onDrop={onDrop}
              isDragOver={dragOverMatchId === m.id && dragMatchId !== m.id}
              matchGameNumbers={matchGameNumbers}
              onDeleteMatch={onDeleteMatch}
            />
          ))}
        </div>
      )}
      {restingPlayers.length > 0 && (
        <div className="px-5 py-2.5 bg-amber-50 border-t border-amber-100 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-amber-600 shrink-0">휴식</span>
          {restingPlayers.map(p => (
            <span key={p.id} className="flex items-center gap-1 text-xs text-amber-700">
              <span className={`w-1.5 h-1.5 rounded-full ${p.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
              {p.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MatchCard({
  match, canEditScore, onScoreUpdate, editMode, substituteTarget, onPlayerClick, showNtrp,
  onDragStart, onDragOver, onDrop, isDragOver, matchGameNumbers, onDeleteMatch,
}: {
  match: Match;
  canEditScore: boolean;
  onScoreUpdate: (id: string, s1: string, s2: string) => void;
  editMode: boolean;
  substituteTarget: SubstituteTarget;
  onPlayerClick: (matchId: string, team: 'team1' | 'team2', slot: 'player1' | 'player2', player: Player) => void;
  showNtrp: boolean;
  onDragStart?: (matchId: string) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (matchId: string) => void;
  isDragOver?: boolean;
  matchGameNumbers?: Map<string, number>;
  onDeleteMatch?: (matchId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [score1, setScore1] = useState(match.score1 || '');
  const [score2, setScore2] = useState(match.score2 || '');

  const handleSave = () => {
    onScoreUpdate(match.id, score1, score2);
    setEditing(false);
  };

  const t1Ntrp = ((match.team1.player1.ntrp + match.team1.player2.ntrp) / 2).toFixed(1);
  const t2Ntrp = ((match.team2.player1.ntrp + match.team2.player2.ntrp) / 2).toFixed(1);

  return (
    <div
      className={`p-4 border-l-4 ${matchTypeBg[match.matchType]} ${isDragOver ? 'ring-2 ring-inset ring-blue-400 bg-blue-50' : ''} ${editMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
      draggable={editMode}
      onDragStart={editMode ? () => onDragStart?.(match.id) : undefined}
      onDragOver={editMode ? (e) => { e.preventDefault(); onDragOver?.(e); } : undefined}
      onDrop={editMode ? () => onDrop?.(match.id) : undefined}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {editMode && <span className="text-slate-300 text-sm select-none">⠿</span>}
          <span className="font-semibold text-slate-600 text-sm">{match.round}R {match.court}코트</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${matchTypeBadge[match.matchType]}`}>
            {matchTypeLabel[match.matchType]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {match.isCompleted && <span className="text-xs text-slate-400">✓ 완료</span>}
          {editMode && onDeleteMatch && (
            <button
              onClick={e => { e.stopPropagation(); onDeleteMatch(match.id); }}
              className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-0.5 rounded transition-colors"
            >
              경기 삭제
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Team 1 */}
        <div className="flex-1 bg-white rounded-xl p-3 border border-slate-200">
          <div className="space-y-1">
            <PlayerBadge
              player={match.team1.player1}
              editMode={editMode}
              isSelected={substituteTarget?.matchId === match.id && substituteTarget?.team === 'team1' && substituteTarget?.slot === 'player1'}
              onClick={() => onPlayerClick(match.id, 'team1', 'player1', match.team1.player1)}
              showNtrp={showNtrp}
              gameNum={matchGameNumbers?.get(`${match.id}_${match.team1.player1.id}`)}
            />
            <PlayerBadge
              player={match.team1.player2}
              editMode={editMode}
              isSelected={substituteTarget?.matchId === match.id && substituteTarget?.team === 'team1' && substituteTarget?.slot === 'player2'}
              onClick={() => onPlayerClick(match.id, 'team1', 'player2', match.team1.player2)}
              showNtrp={showNtrp}
              gameNum={matchGameNumbers?.get(`${match.id}_${match.team1.player2.id}`)}
            />
          </div>
          {showNtrp && <div className="text-xs text-slate-400 mt-2">평균 {t1Ntrp}</div>}
        </div>

        {/* Score */}
        <div className="text-center px-1 flex flex-col items-center gap-1">
          {editing ? (
            <>
              <div className="flex items-center gap-1">
                <input
                  value={score1}
                  onChange={e => setScore1(e.target.value)}
                  className="w-10 text-center border border-slate-300 rounded-lg py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="0"
                />
                <span className="text-slate-400 text-xs font-bold">:</span>
                <input
                  value={score2}
                  onChange={e => setScore2(e.target.value)}
                  className="w-10 text-center border border-slate-300 rounded-lg py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="0"
                />
              </div>
              <div className="flex gap-1">
                <button onClick={handleSave} className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700">저장</button>
                <button onClick={() => setEditing(false)} className="px-2 py-1 bg-slate-200 text-slate-600 text-xs rounded hover:bg-slate-300">취소</button>
              </div>
            </>
          ) : (
            <>
              {match.isCompleted ? (
                <div className="flex items-center gap-1">
                  <span className="text-lg font-bold text-slate-800">{match.score1}</span>
                  <span className="text-xs text-slate-400 font-bold">:</span>
                  <span className="text-lg font-bold text-slate-800">{match.score2}</span>
                </div>
              ) : (
                <div className="text-slate-300 text-sm">vs</div>
              )}
              {canEditScore && !editMode && (
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs text-slate-400 hover:text-green-600"
                >
                  {match.isCompleted ? '수정' : '입력'}
                </button>
              )}
            </>
          )}
        </div>

        {/* Team 2 */}
        <div className="flex-1 bg-white rounded-xl p-3 border border-slate-200">
          <div className="space-y-1">
            <PlayerBadge
              player={match.team2.player1}
              editMode={editMode}
              isSelected={substituteTarget?.matchId === match.id && substituteTarget?.team === 'team2' && substituteTarget?.slot === 'player1'}
              onClick={() => onPlayerClick(match.id, 'team2', 'player1', match.team2.player1)}
              showNtrp={showNtrp}
              gameNum={matchGameNumbers?.get(`${match.id}_${match.team2.player1.id}`)}
            />
            <PlayerBadge
              player={match.team2.player2}
              editMode={editMode}
              isSelected={substituteTarget?.matchId === match.id && substituteTarget?.team === 'team2' && substituteTarget?.slot === 'player2'}
              onClick={() => onPlayerClick(match.id, 'team2', 'player2', match.team2.player2)}
              showNtrp={showNtrp}
              gameNum={matchGameNumbers?.get(`${match.id}_${match.team2.player2.id}`)}
            />
          </div>
          {showNtrp && <div className="text-xs text-slate-400 mt-2">평균 {t2Ntrp}</div>}
        </div>
      </div>
    </div>
  );
}

function PlayerBadge({
  player, editMode, isSelected, onClick, showNtrp, gameNum,
}: {
  player: Player;
  editMode: boolean;
  isSelected: boolean;
  onClick: () => void;
  showNtrp: boolean;
  gameNum?: number;
}) {
  const content = (
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${player.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
      <span className="text-sm font-medium text-slate-800 truncate">{player.name}</span>
      {player.type === 'guest' && (
        <span className="text-xs bg-orange-100 text-orange-600 px-1 rounded">G</span>
      )}
      {gameNum !== undefined && (
        <span className="text-xs bg-slate-100 text-slate-500 px-1 rounded font-mono">{gameNum}번째</span>
      )}
      {showNtrp && <span className="text-xs font-mono text-slate-400 ml-auto">{player.ntrp.toFixed(1)}</span>}
    </div>
  );

  if (editMode) {
    return (
      <button
        onClick={onClick}
        className={`w-full text-left rounded-lg px-1.5 py-0.5 transition-colors ${
          isSelected
            ? 'bg-yellow-300 border border-yellow-500'
            : 'hover:bg-yellow-100 border border-transparent'
        }`}
      >
        {content}
      </button>
    );
  }

  return <div>{content}</div>;
}
