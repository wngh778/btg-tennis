import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  getSession, getMembers, getGuests, getAttendance,
  setAttendance, deleteAttendance, addGuest, deleteGuest, updateGuest,
  getMatches, saveMatches, insertMatch, deleteMatch, updateMatchScore, updateSession, getAllMatches, updateMatch, confirmSession,
  getSessionGroups, unconfirmSession,
} from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { useClub } from '../contexts/ClubContext';
import { generateMatches, generateGroupMatches, calcOptimalGroupRounds, isVotingOpen, NTRP_OPTIONS } from '../utils/matchmaking';
import type { Session, Member, Guest, AttendanceRecord, Match, Player, Gender, SessionGroup } from '../types';
import { formatDate } from '../utils/formatting';
import { LoadingState, ErrorState } from '../components/ui/PageState';
import { RoundCard } from '../components/session/RoundCard';
import type { SubstituteTarget } from '../components/session/RoundCard';
import { PlayerDetailTab } from '../components/session/PlayerDetailTab';
import { SessionResultTab } from '../components/session/SessionResultTab';
import { GroupResultTab } from '../components/session/GroupResultTab';
import { GroupsTab } from '../components/session/GroupsTab';

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
  const [tab, setTab] = useState<'vote' | 'groups' | 'bracket' | 'detail' | 'result'>('vote');
  const [groups, setGroups] = useState<SessionGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

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
  const [dragPlayerSource, setDragPlayerSource] = useState<{matchId: string, team: 'team1'|'team2', slot: 'player1'|'player2'} | null>(null);

  // Generate settings modal
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateCourts, setGenerateCourts] = useState(4);
  const [generateRounds, setGenerateRounds] = useState(6);
  const [generateMixedRounds, setGenerateMixedRounds] = useState(2);
  const [generateTargetGroup, setGenerateTargetGroup] = useState<string | 'all'>('all');
  const [generateMode, setGenerateMode] = useState<'rounds' | 'games'>('rounds');
  const [generateTargetGames, setGenerateTargetGames] = useState(4);
  const [showSimpleView, setShowSimpleView] = useState(false);

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

  // Guest edit
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [editGuestName, setEditGuestName] = useState('');
  const [editGuestGender, setEditGuestGender] = useState<Gender>('male');
  const [editGuestNtrp, setEditGuestNtrp] = useState(3.0);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('요청 시간이 초과되었습니다. 새로고침 해주세요.')), 10000)
      );
      const fetchData = async () => {
        const [s, g, a, mx, grps] = await Promise.all([
          getSession(id), getGuests(id), getAttendance(id), getMatches(id), getSessionGroups(id),
        ]);
        const clubId = s?.clubId ?? currentClub?.id;
        const m = clubId ? await getMembers(clubId) : [];
        return { s, m, g, a, mx, grps };
      };
      const { s, m, g, a, mx, grps } = await Promise.race([fetchData(), timeout]);
      setSession(s);
      setMembers(m);
      setGuests(g);
      setAttendanceState(a);
      setMatches(mx);
      setGroups(grps);
      setError(null);
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  // auth 초기화 완료 후에만 데이터 로드 (새로고침 시 세션 미초기화 상태에서 쿼리 실행 방지)
  useEffect(() => { if (!authLoading) load(); }, [load, authLoading]);

  // 조별경기: 그룹 로드 후 내 그룹 자동 선택
  useEffect(() => {
    if (groups.length > 0 && selectedGroupId === null && session?.gameMode === 'group') {
      const myMemberInEffect = appUser ? members.filter(m => m.isActive).find(m => m.name === appUser.username) ?? null : null;
      const myGroupInEffect = myMemberInEffect ? groups.find(g => g.memberIds.includes(myMemberInEffect.id)) ?? null : null;
      setSelectedGroupId(myGroupInEffect?.id ?? groups[0]?.id ?? null);
    }
  }, [groups, session?.gameMode]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;
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

  const handleStartEditGuest = (guest: Guest) => {
    setEditingGuestId(guest.id);
    setEditGuestName(guest.name);
    setEditGuestGender(guest.gender);
    setEditGuestNtrp(guest.ntrp);
  };

  const handleSaveEditGuest = async () => {
    if (!editingGuestId) return;
    const oldGuest = guests.find(g => g.id === editingGuestId);
    // 게스트 테이블 업데이트
    await updateGuest(editingGuestId, { name: editGuestName, gender: editGuestGender, ntrp: editGuestNtrp });
    // attendance 업데이트 (이름, 성별, NTRP 동기화)
    await setAttendance({
      sessionId: session.id,
      playerId: editingGuestId,
      playerType: 'guest',
      playerName: editGuestName,
      gender: editGuestGender,
      ntrp: editGuestNtrp,
      attending: true,
    });
    // 대진표에 해당 게스트가 포함되어 있으면 match 내 player 정보도 업데이트
    if (oldGuest) {
      for (const m of matches) {
        let changed = false;
        const updated = { team1: { ...m.team1 }, team2: { ...m.team2 } };
        for (const team of ['team1', 'team2'] as const) {
          for (const slot of ['player1', 'player2'] as const) {
            if (m[team][slot].id === editingGuestId) {
              updated[team][slot] = { ...m[team][slot], name: editGuestName, gender: editGuestGender, ntrp: editGuestNtrp };
              changed = true;
            }
          }
        }
        if (changed) {
          await updateMatch(m.id, { team1: updated.team1, team2: updated.team2 });
        }
      }
    }
    setEditingGuestId(null);
    load();
  };

  // --- Bracket Generation ---
  const handleGenerateClick = () => {
    setGenerateCourts(session.courts);
    setGenerateRounds(session.rounds);
    setGenerateMixedRounds(session.mixedRounds);
    setGenerateTargetGroup('all');
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

  const handlePlayerDragStart = (matchId: string, team: 'team1'|'team2', slot: 'player1'|'player2') => {
    setDragPlayerSource({ matchId, team, slot });
  };

  const handlePlayerDrop = (targetMatchId: string, targetTeam: 'team1'|'team2', targetSlot: 'player1'|'player2') => {
    if (!dragPlayerSource) return;
    const { matchId: srcMatchId, team: srcTeam, slot: srcSlot } = dragPlayerSource;
    if (srcMatchId === targetMatchId && srcTeam === targetTeam && srcSlot === targetSlot) {
      setDragPlayerSource(null);
      return;
    }
    const newPending = pendingMatches.map(m => ({
      ...m,
      team1: { ...m.team1, player1: { ...m.team1.player1 }, player2: { ...m.team1.player2 } },
      team2: { ...m.team2, player1: { ...m.team2.player1 }, player2: { ...m.team2.player2 } },
    }));
    const srcMatch = newPending.find(m => m.id === srcMatchId);
    const tgtMatch = newPending.find(m => m.id === targetMatchId);
    if (!srcMatch || !tgtMatch) { setDragPlayerSource(null); return; }
    const srcPlayer = srcMatch[srcTeam][srcSlot];
    const tgtPlayer = tgtMatch[targetTeam][targetSlot];
    srcMatch[srcTeam][srcSlot] = tgtPlayer;
    tgtMatch[targetTeam][targetSlot] = srcPlayer;
    setPendingMatches(newPending);
    setDragPlayerSource(null);
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

  const handleSubstitute = (replacementPlayer: Player) => {
    if (!substituteTarget) return;
    const newPending = pendingMatches.map(m => {
      const updated = {
        ...m,
        team1: { ...m.team1, player1: { ...m.team1.player1 }, player2: { ...m.team1.player2 } },
        team2: { ...m.team2, player1: { ...m.team2.player1 }, player2: { ...m.team2.player2 } },
      };
      // Replace target slot with replacementPlayer
      if (m.id === substituteTarget.matchId) {
        updated[substituteTarget.team][substituteTarget.slot] = replacementPlayer;
      }
      // If replacementPlayer was in another slot, replace it with the target player
      for (const team of ['team1', 'team2'] as const) {
        for (const slot of ['player1', 'player2'] as const) {
          if (!(m.id === substituteTarget.matchId && team === substituteTarget.team && slot === substituteTarget.slot)) {
            if (updated[team][slot].id === replacementPlayer.id) {
              updated[team][slot] = substituteTarget.player;
            }
          }
        }
      }
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

  const loadGroups = async () => {
    if (!id) return;
    const g = await getSessionGroups(id);
    setGroups(g);
  };

  const handleGenerateGroupMatches = async (groupId: string | 'all') => {
    setShowGenerateModal(false);
    const targetGroups = groupId === 'all' ? groups : groups.filter(g => g.id === groupId);

    for (const group of targetGroups) {
      const groupPlayers = attendingPlayers.filter(p => group.memberIds.includes(p.id));
      if (groupPlayers.length < 4) continue;

      let totalRounds = generateRounds;
      if (generateMode === 'games') {
        const activeCourts = Math.min(generateCourts, Math.floor(groupPlayers.length / 4));
        const playing = activeCourts * 4;
        totalRounds = playing > 0 ? Math.round(generateTargetGames * groupPlayers.length / playing) : generateRounds;
        if (totalRounds < 1) totalRounds = 1;
      }

      const generated = generateGroupMatches({
        sessionId: session!.id,
        groupId: group.id,
        players: groupPlayers,
        courts: generateCourts,
        totalRounds,
      });

      // 해당 그룹의 기존 매치 삭제
      const existingGroupMatches = matches.filter(m => m.groupId === group.id);
      for (const m of existingGroupMatches) await deleteMatch(m.id);

      // 새 매치 삽입
      for (const m of generated) await insertMatch(m);
    }

    await updateSession(session!.id, { isGenerated: true, courts: generateCourts, rounds: generateRounds });
    load();
    setTab('bracket');
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold text-slate-800 truncate">
                {session.title ?? formatDate(session.date)}
              </h1>
              {session.title && (
                <span className="text-xs text-slate-400">{formatDate(session.date)}</span>
              )}
              <span className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-medium ${
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
      <div className="flex border-b border-slate-200 bg-white rounded-t-2xl overflow-x-auto">
        <button
          onClick={() => setTab('vote')}
          className={`flex-1 flex-shrink-0 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
            tab === 'vote' ? 'text-green-600 border-b-2 border-green-600 bg-green-50' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="sm:hidden">투표</span><span className="hidden sm:inline">참석 투표</span>
        </button>
        {session.gameMode === 'group' && isAdminUser && (
          <button
            onClick={() => setTab('groups')}
            className={`flex-1 flex-shrink-0 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              tab === 'groups' ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            조 편성
          </button>
        )}
        <button
          onClick={() => setTab('bracket')}
          className={`flex-1 flex-shrink-0 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
            tab === 'bracket' ? 'text-green-600 border-b-2 border-green-600 bg-green-50' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          대진표 {session.isGenerated ? '✓' : ''}
        </button>
        <button
          onClick={() => setTab('detail')}
          className={`flex-1 flex-shrink-0 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
            tab === 'detail' ? 'text-green-600 border-b-2 border-green-600 bg-green-50' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="sm:hidden">상세</span><span className="hidden sm:inline">참석인원상세</span>
        </button>
        {session.isConfirmed && (
          <button
            onClick={() => setTab('result')}
            className={`flex-1 flex-shrink-0 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
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
                  <div key={m.id} className={`px-5 py-3 flex items-center justify-between transition-colors ${
                    attending === true
                      ? isMe ? 'bg-green-100' : 'bg-green-50'
                      : isMe ? 'bg-green-50' : ''
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${m.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                      <span className={`font-medium ${attending === true ? 'text-green-700' : isMe ? 'text-green-700' : 'text-slate-800'}`}>{m.name}</span>
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
                      {session.trackLate ? (
                        attending === true ? (
                          canVoteThis ? (
                            <button
                              onClick={() => handleMemberLate(m, !(rec?.isLate ?? false))}
                              className={`w-10 py-1 rounded text-xs font-medium text-center transition-colors ${
                                rec?.isLate
                                  ? 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                                  : 'bg-green-50 text-green-600 hover:bg-green-100'
                              }`}
                            >
                              {rec?.isLate ? '지각' : '정시'}
                            </button>
                          ) : (
                            <span className={`w-10 py-1 rounded text-xs font-medium text-center ${
                              rec?.isLate
                                ? 'bg-orange-100 text-orange-600'
                                : rec?.isLate === false
                                ? 'bg-green-50 text-green-600'
                                : 'bg-slate-100 text-slate-400'
                            }`}>
                              {rec?.isLate ? '지각' : rec?.isLate === false ? '정시' : '-'}
                            </span>
                          )
                        ) : (
                          <span className="w-10 py-1 rounded text-xs font-medium text-center bg-slate-100 text-slate-300">-</span>
                        )
                      ) : null}
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
              <form onSubmit={handleAddGuest} className="px-4 sm:px-5 py-4 border-b border-slate-100 bg-green-50">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
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
                  editingGuestId === g.id ? (
                    <div key={g.id} className="px-4 sm:px-5 py-3 bg-amber-50 border-b border-amber-100">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                        <input
                          value={editGuestName}
                          onChange={e => setEditGuestName(e.target.value)}
                          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                          placeholder="이름"
                        />
                        <select
                          value={editGuestGender}
                          onChange={e => setEditGuestGender(e.target.value as Gender)}
                          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="male">남성</option>
                          <option value="female">여성</option>
                        </select>
                        <select
                          value={editGuestNtrp}
                          onChange={e => setEditGuestNtrp(parseFloat(e.target.value))}
                          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                        >
                          {NTRP_OPTIONS.map(n => <option key={n} value={n}>{n.toFixed(1)}</option>)}
                        </select>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingGuestId(null)} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1">취소</button>
                        <button onClick={handleSaveEditGuest} className="px-3 py-1 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600">저장</button>
                      </div>
                    </div>
                  ) : (
                    <div key={g.id} className="px-4 sm:px-5 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded text-xs font-medium">게스트</span>
                        <span className={`w-2 h-2 rounded-full ${g.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                        <span className="font-medium text-slate-800">{g.name}</span>
                        {isAdminUser && <span className="text-xs font-mono text-slate-400">{g.ntrp.toFixed(1)}</span>}
                        <span className="text-xs text-slate-400">{g.gender === 'male' ? '남' : '여'}</span>
                      </div>
                      {isAdminUser && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleStartEditGuest(g)}
                            className="text-amber-500 hover:text-amber-700 text-sm"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleRemoveGuest(g)}
                            className="text-red-400 hover:text-red-600 text-sm"
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </div>
                  )
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
        const restingPlayers = attendingPlayers.filter(p => !playingInRound.has(p.id) && p.id !== substituteTarget.player.id);
        const playingPlayers = attendingPlayers.filter(p => playingInRound.has(p.id) && p.id !== substituteTarget.player.id);
        const hasAny = restingPlayers.length > 0 || playingPlayers.length > 0;
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800">선수 교체</h3>
                <p className="text-xs text-slate-500 mt-1">
                  <span className="font-medium text-amber-600">{substituteTarget.player.name}</span>을(를) 교체할 선수 선택
                </p>
              </div>
              <div className="px-5 py-3 max-h-80 overflow-y-auto space-y-3">
                {!hasAny ? (
                  <p className="text-sm text-slate-400 text-center py-4">교체 가능한 선수가 없습니다.</p>
                ) : (
                  <>
                    {restingPlayers.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-1.5">대기 선수</p>
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
                      </div>
                    )}
                    {playingPlayers.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-1.5">경기 중인 선수 (자리 교환됨)</p>
                        <div className="space-y-1.5">
                          {playingPlayers.map(p => (
                            <button
                              key={p.id}
                              onClick={() => handleSubstitute(p)}
                              className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors text-left"
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
                      </div>
                    )}
                  </>
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
      {/* 간소화 보기 - 작은 팝업, 캡처 최적화 */}
      {showSimpleView && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowSimpleView(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 shrink-0">
              <button
                onClick={() => setShowSimpleView(false)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                닫기
              </button>
              <span className="font-bold text-slate-800 text-sm">
                {session.title ?? formatDate(session.date)}
              </span>
              <button
                onClick={() => {
                  const url = window.location.origin + '/c/' + session.clubId + '/' + session.id;
                  navigator.clipboard.writeText(url).then(() => alert('링크가 복사되었습니다')).catch(() => alert('링크가 복사되었습니다'));
                }}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                공유
              </button>
            </div>

            {/* 경기 목록 */}
            <div className="flex-1 overflow-y-auto">
              {session.gameMode === 'group' && groups.length > 0 ? (
                groups.map(group => {
                  const groupMatches = [...matches]
                    .filter(m => m.groupId === group.id)
                    .sort((a, b) => a.round - b.round || a.court - b.court);
                  if (groupMatches.length === 0) return null;
                  const playerNumMap = new Map<string, number>();
                  group.memberIds.forEach((id, i) => playerNumMap.set(id, i + 1));
                  const pLabel = (p: Player) => {
                    const n = playerNumMap.get(p.id);
                    return n ? `${n}${p.name}` : p.name;
                  };
                  return (
                    <div key={group.id}>
                      <div className="px-3 py-1 bg-slate-100 border-b border-slate-200">
                        <span className="font-bold text-slate-700 text-xs">{group.name}</span>
                      </div>
                      {groupMatches.map(m => (
                        <div key={m.id} className="grid grid-cols-[1fr_auto_1fr] items-center px-2 py-0.5 border-b border-slate-50 text-xs leading-tight">
                          <span className="text-slate-700 truncate text-right pr-1">{pLabel(m.team1.player1)} {pLabel(m.team1.player2)}</span>
                          <span className="font-bold text-slate-800 px-1 shrink-0 tabular-nums text-center">
                            {m.isCompleted ? `${m.score1}:${m.score2}` : 'vs'}
                          </span>
                          <span className="text-slate-700 truncate pl-1">{pLabel(m.team2.player1)} {pLabel(m.team2.player2)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })
              ) : (
                (() => {
                  const rounds = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b);
                  return rounds.map(round => {
                    const roundMatches = matches
                      .filter(m => m.round === round)
                      .sort((a, b) => a.court - b.court);
                    return (
                      <div key={round}>
                        <div className="px-3 py-1 bg-slate-100 border-b border-slate-200">
                          <span className="font-bold text-slate-700 text-xs">{round}R</span>
                        </div>
                        {roundMatches.map(m => (
                          <div key={m.id} className="grid grid-cols-[1fr_auto_1fr] items-center px-2 py-0.5 border-b border-slate-50 text-xs leading-tight">
                            <span className="text-slate-700 truncate text-right pr-1">{m.team1.player1.name} {m.team1.player2.name}</span>
                            <span className="font-bold text-slate-800 px-1 shrink-0 tabular-nums text-center">
                              {m.isCompleted ? `${m.score1}:${m.score2}` : 'vs'}
                            </span>
                            <span className="text-slate-700 truncate pl-1">{m.team2.player1.name} {m.team2.player2.name}</span>
                          </div>
                        ))}
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </div>
        </div>
      )}

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
              {session.gameMode === 'group' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">입력 방식</label>
                  <div className="flex gap-2">
                    {(['rounds', 'games'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => {
                          setGenerateMode(m);
                          if (m === 'games') {
                            // 선택된 조 기준으로 최적 게임수 계산
                            const targetGrps = generateTargetGroup === 'all' ? groups : groups.filter(g => g.id === generateTargetGroup);
                            const firstGrp = targetGrps[0];
                            if (firstGrp) {
                              const gp = attendingPlayers.filter(p => firstGrp.memberIds.includes(p.id));
                              const ac = Math.min(generateCourts, Math.floor(gp.length / 4));
                              const pl = ac * 4;
                              const optR = calcOptimalGroupRounds(gp.length, generateCourts, generateRounds);
                              const optG = gp.length > 0 && pl > 0 ? Math.round(optR * pl / gp.length) : generateRounds;
                              setGenerateTargetGames(optG > 0 ? optG : 1);
                            }
                          }
                        }}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                          generateMode === m ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {m === 'rounds' ? '총 라운드 수' : '총 경기 수'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(generateMode === 'rounds' || session.gameMode !== 'group') && (
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
              )}
              {generateMode === 'games' && session.gameMode === 'group' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">인당 경기 수</label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setGenerateTargetGames(prev => Math.max(1, prev - 1))}
                      className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 text-xl font-bold hover:bg-slate-200 transition-colors"
                    >
                      −
                    </button>
                    <span className="text-2xl font-bold text-slate-800 w-12 text-center">{generateTargetGames}</span>
                    <button
                      onClick={() => setGenerateTargetGames(prev => prev + 1)}
                      className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 text-xl font-bold hover:bg-slate-200 transition-colors"
                    >
                      +
                    </button>
                    <span className="text-xs text-slate-400">게임/명</span>
                  </div>
                </div>
              )}
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
            {session.gameMode === 'group' && groups.length > 0 && (
              <div className="px-6 pb-2 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">대진 생성 조</label>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setGenerateTargetGroup('all')}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        generateTargetGroup === 'all' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      전체 조
                    </button>
                    {groups.map(g => (
                      <button
                        key={g.id}
                        onClick={() => setGenerateTargetGroup(g.id)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                          generateTargetGroup === g.id ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                </div>
                {/* 조별 예상 라운드 안내 */}
                <div className="bg-purple-50 rounded-xl p-3 space-y-1.5">
                  {(generateTargetGroup === 'all' ? groups : groups.filter(g => g.id === generateTargetGroup)).map(g => {
                    const groupPlayers = attendingPlayers.filter(p => g.memberIds.includes(p.id));
                    const activeCourts = Math.min(generateCourts, Math.floor(groupPlayers.length / 4));
                    const playing = activeCourts * 4;
                    const optRounds = calcOptimalGroupRounds(groupPlayers.length, generateCourts, generateRounds);
                    const optGames = groupPlayers.length > 0 && playing > 0
                      ? Math.round(optRounds * playing / groupPlayers.length) : 0;

                    if (generateMode === 'games') {
                      const derivedRounds = playing > 0
                        ? Math.round(generateTargetGames * groupPlayers.length / playing) : 0;
                      const isUnequal = playing > 0 && (generateTargetGames * groupPlayers.length) % playing !== 0;
                      const isRepeat = derivedRounds > optRounds && optRounds > 0;
                      return (
                        <div key={g.id} className="space-y-0.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-purple-700">{g.name}</span>
                            <span className="text-purple-600">
                              {groupPlayers.length < 4
                                ? '인원 부족 (4명 이상 필요)'
                                : `${groupPlayers.length}명 · ${derivedRounds}라운드 · 인당 ${generateTargetGames}게임`}
                            </span>
                          </div>
                          {groupPlayers.length >= 4 && optGames > 0 && generateTargetGames !== optGames && (
                            <p className="text-xs text-amber-600">
                              권장 {optGames}게임 {isRepeat ? '· ⚠️ 중복 페어 발생 가능' : isUnequal ? '· ⚠️ 경기수 불균등 가능' : ''}
                            </p>
                          )}
                          {groupPlayers.length >= 4 && generateTargetGames === optGames && (
                            <p className="text-xs text-green-600">✓ 최적 게임 수</p>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div key={g.id} className="flex items-center justify-between text-xs">
                        <span className="font-medium text-purple-700">{g.name}</span>
                        <span className="text-purple-600">
                          {groupPlayers.length < 4
                            ? '인원 부족 (4명 이상 필요)'
                            : `${groupPlayers.length}명 · ${optRounds}라운드 · 인당 ${optGames}게임`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setShowGenerateModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => session.gameMode === 'group' ? handleGenerateGroupMatches(generateTargetGroup) : handleGenerate()}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
              >
                {session.isGenerated ? '재생성' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Groups Tab */}
      {tab === 'groups' && session.gameMode === 'group' && isAdminUser && (
        <GroupsTab
          groups={groups}
          session={session}
          members={members}
          attendingPlayers={attendingPlayers}
          onGroupsChanged={loadGroups}
          isAdmin={isAdminUser}
        />
      )}

      {/* Bracket Tab */}
      {tab === 'bracket' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-sm text-slate-500">
              참석 인원 {attendingPlayers.length}명 · 남{maleAttending} 여{femaleAttending}
            </p>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
              {matches.length > 0 && !editMode && (
                <>
                  <button
                    onClick={() => {
                      const url = window.location.origin + '/c/' + session.clubId + '/' + session.id;
                      navigator.clipboard.writeText(url).then(() => alert('링크가 복사되었습니다')).catch(() => alert('링크가 복사되었습니다'));
                    }}
                    className="px-3 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs sm:text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                  >
                    공유 링크 복사
                  </button>
                  <button
                    onClick={() => setShowSimpleView(true)}
                    className="px-3 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs sm:text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                  >
                    간소화 보기
                  </button>
                </>
              )}
              {isAdminUser && !editMode && matches.length > 0 && (
                <button
                  onClick={handleEditModeStart}
                  className="bg-amber-500 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-amber-600 transition-colors"
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
                    className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleEditSave}
                    disabled={saving}
                    className="bg-green-600 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </>
              )}
              {isAdminUser && !editMode && session.isGenerated && (!session.isConfirmed || isSuperAdmin) && (
                <button
                  onClick={handleConfirm}
                  className="bg-blue-600 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  {session.isConfirmed ? '재확정' : '확정'}
                </button>
              )}
              {isSuperAdmin && !editMode && (
                <button
                  onClick={handleMondayClick}
                  className="bg-indigo-600 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  월요일 편성
                </button>
              )}
              {isAdminUser && !editMode && (
                <button
                  onClick={handleGenerateClick}
                  className="bg-green-600 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  {session.isGenerated ? '대진표 재생성' : '대진표 생성'}
                </button>
              )}
            </div>
          </div>

          {session.isConfirmed && (
            <div className={`rounded-xl p-3 text-sm flex items-center justify-between ${isSuperAdmin ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-blue-50 border border-blue-200 text-blue-700'}`}>
              <span>
                {isSuperAdmin
                  ? '✓ 확정된 결과입니다. 슈퍼관리자 권한으로 수정 가능합니다.'
                  : '✓ 확정된 결과입니다. 스코어 수정이 잠겨 있습니다.'}
              </span>
              {isSuperAdmin && (
                <button
                  onClick={async () => {
                    if (!confirm('확정을 해제하시겠습니까? 일반 사용자도 점수를 수정할 수 있게 됩니다.')) return;
                    await unconfirmSession(session.id);
                    load();
                  }}
                  className="shrink-0 ml-3 px-3 py-1 bg-amber-600 text-white text-xs rounded-lg hover:bg-amber-700 font-medium"
                >
                  확정 해제
                </button>
              )}
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
              선수 드래그앤드랍 → 위치 교환 &nbsp;|&nbsp; 경기 카드 드래그 → 순서 이동
            </div>
          )}

          {session.gameMode === 'group' && (
            <div className="flex gap-2 flex-wrap">
              {isAdminUser && (
                <button
                  onClick={() => setSelectedGroupId(null)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedGroupId === null ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  전체
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
          )}

          {matches.length === 0 && !editMode ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
              <p className="text-slate-400 text-lg mb-2">아직 대진표가 없습니다.</p>
              {isAdminUser && <p className="text-slate-400 text-sm">참석 투표 완료 후 대진표를 생성하세요.</p>}
            </div>
          ) : (() => {
            const displaySource = editMode ? pendingMatches : matches;
            const filteredSource = session.gameMode === 'group' && selectedGroupId
              ? displaySource.filter(m => m.groupId === selectedGroupId)
              : displaySource;
            const filteredMatches = session.gameMode === 'group' && selectedGroupId
              ? matches.filter(m => m.groupId === selectedGroupId)
              : matches;
            // 조별 필터: 휴식 인원도 해당 조 인원만 표시
            const roundAttendingPlayers = session.gameMode === 'group' && selectedGroupId
              ? (() => {
                  const group = groups.find(g => g.id === selectedGroupId);
                  return group ? attendingPlayers.filter(p => group.memberIds.includes(p.id)) : attendingPlayers;
                })()
              : attendingPlayers;
            const displayRounds = editMode
              ? Array.from({ length: pendingRoundsCount }, (_, i) => i + 1)
              : Array.from(new Set(filteredSource.map(m => m.round))).sort((a, b) => a - b);
            return displayRounds.map(round => (
              <RoundCard
                key={round}
                round={round}
                matches={filteredMatches.filter(m => m.round === round)}
                attendingPlayers={roundAttendingPlayers}
                canEditScore={!!user && (!session.isConfirmed || isSuperAdmin)}
                onScoreUpdate={handleScoreUpdate}
                editMode={editMode}
                pendingMatches={filteredSource.filter(m => m.round === round)}
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
                onPlayerDragStart={editMode ? handlePlayerDragStart : undefined}
                onPlayerDrop={editMode ? handlePlayerDrop : undefined}
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
        session.gameMode === 'group' ? (
          <GroupResultTab
            groups={groups}
            matches={matches}
            attendingPlayers={attendingPlayers}
            isAdmin={isAdminUser}
          />
        ) : (
          <SessionResultTab attendingPlayers={attendingPlayers} matches={matches} />
        )
      )}
    </div>
  );
}
