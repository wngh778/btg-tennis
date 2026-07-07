import { useState, useEffect, useRef } from 'react';
import { updateMatch, insertMatch, deleteMatch, updateSession } from '../lib/database';
import type { Match, Player, Session, MatchType } from '../types';
import type { SubstituteTarget } from '../components/session/RoundCard';

interface UseBracketEditOptions {
  matches: Match[];
  session: Session | null;
  attendingPlayers: Player[];
  load: () => Promise<void>;
}

interface UndoSnapshot {
  matches: Match[];
  roundsCount: number;
}

export function useBracketEdit({
  matches,
  session,
  attendingPlayers,
  load,
}: UseBracketEditOptions) {
  const [pendingMatches, setPendingMatches] = useState<Match[]>([]);
  const [pendingRoundsCount, setPendingRoundsCount] = useState(0);
  const [substituteTarget, setSubstituteTarget] = useState<SubstituteTarget>(null);
  const [saving, setSaving] = useState(false);
  const [dragMatchId, setDragMatchId] = useState<string | null>(null);
  const [dragOverMatchId, setDragOverMatchId] = useState<string | null>(null);
  const [dragOverEmptyRound, setDragOverEmptyRound] = useState<number | null>(null);
  const [deletedMatchIds, setDeletedMatchIds] = useState<Set<string>>(new Set());
  const [dragPlayerSource, setDragPlayerSource] = useState<{
    matchId: string;
    team: 'team1' | 'team2';
    slot: 'player1' | 'player2';
  } | null>(null);
  const [benchDragPlayer, setBenchDragPlayer] = useState<Player | null>(null);
  const [dragRound, setDragRound] = useState<number | null>(null);
  const [dragOverRound, setDragOverRound] = useState<number | null>(null);

  // ── Undo 스택 ────────────────────────────────────────────────────────────────
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);

  // autoSave 완료 후 load()로 가져온 matches에서 강제 재초기화 신호
  // true이면 hasOverlap 여부와 무관하게 정렬된 DB 상태로 재초기화
  const needsReloadRef = useRef(false);

  // handleRoundCountChange / handleDeleteRound에서 설정한 목표 라운드 수.
  // autoSave → load() 완료 시 useEffect([matches])가 실행되는데,
  // 이때 session?.rounds가 stale(이전 값)일 수 있으므로 ref로 별도 추적해
  // pendingRoundsCount가 잘못 되돌아가는 현상을 방지한다.
  const targetRoundsCountRef = useRef<number | null>(null);

  // matches가 바뀔 때 pendingMatches 자동 초기화
  // - matches가 비어있으면 무조건 초기화 (대진 초기화 / 첫 로드)
  // - pendingMatches가 비어있으면 초기화 (최초 로드)
  // - pendingMatches의 경기들이 새 matches에 하나도 없으면 초기화 (재생성으로 완전 교체)
  // - needsReloadRef=true이면 autoSave 완료 후 강제 재초기화 (temp ID→실제 ID 반영)
  // - pendingMatches에 새 matches의 경기가 있고 reload 불필요하면 유지 (편집 중 보존)
  useEffect(() => {
    if (matches.length === 0) {
      setPendingMatches([]);
      setPendingRoundsCount(0);
      needsReloadRef.current = false;
      return;
    }
    // DB 데이터는 항상 round → court 순으로 정렬해 일관된 순서 보장
    const sorted: Match[] = [...matches].sort((a, b) =>
      a.round !== b.round ? a.round - b.round : a.court - b.court
    );
    const newMatchIds = new Set(matches.map(m => m.id));
    const hasOverlap = pendingMatches.some(m => newMatchIds.has(m.id));
    if (pendingMatches.length === 0 || !hasOverlap || needsReloadRef.current) {
      needsReloadRef.current = false;
      const copied: Match[] = JSON.parse(JSON.stringify(sorted));
      setPendingMatches(copied);
      const maxRound = Math.max(...copied.map(m => m.round));
      // targetRoundsCountRef에 값이 있으면 그것을 우선 사용 (stale session?.rounds 방지)
      if (targetRoundsCountRef.current !== null) {
        setPendingRoundsCount(Math.max(targetRoundsCountRef.current, maxRound));
        targetRoundsCountRef.current = null;
      } else {
        setPendingRoundsCount(Math.max(session?.rounds ?? maxRound, maxRound));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);

  /** 변경 전에 호출 — 현재 pendingMatches/roundsCount를 undo 스택에 저장 */
  const pushUndo = () => {
    setUndoStack(prev => [
      ...prev.slice(-19), // 최대 20단계
      { matches: JSON.parse(JSON.stringify(pendingMatches)), roundsCount: pendingRoundsCount },
    ]);
  };

  const clearUndo = () => setUndoStack([]);

  // ── 편집 관련 ───────────────────────────────────────────────────────

  /** 대진표 생성 직후 pendingMatches 세팅 (useGenerateModal에서 호출) */
  const startEditWithMatches = (newMatches: Match[], rounds: number) => {
    const copied: Match[] = JSON.parse(JSON.stringify(newMatches));
    setPendingMatches(copied);
    const maxRound = copied.length > 0 ? Math.max(...copied.map(m => m.round)) : rounds;
    setPendingRoundsCount(Math.max(rounds, maxRound));
    setSubstituteTarget(null);
    setDeletedMatchIds(new Set());
    targetRoundsCountRef.current = null; // 재생성 시 ref 초기화
    clearUndo();
  };

  // ── 자동 저장 ─────────────────────────────────────────────────────────────────

  /**
   * 각 편집 조작 직후 호출하는 자동저장.
   * newMatches, newDeletedIds, newRoundsCount는 setState 직전에 계산한 값을
   * 그대로 넘겨야 함 (setState는 비동기라 직후 state 참조 불가).
   *
   * 저장 완료 후 load()를 호출해 DB 상태를 matches로 재동기화.
   * pendingMatches를 빈 배열로 비워두면 useEffect가 새 matches로 재초기화함.
   */
  const autoSave = async (
    newMatches: Match[],
    newDeletedIds: Set<string>,
    newRoundsCount: number,
  ) => {
    if (!session) return;
    setSaving(true);
    try {
      const currentDbIds = new Set(matches.map(m => m.id));

      for (const pm of newMatches) {
        // temp_ 접두어이거나, DB에 없는 경기(undo로 복구된 삭제된 경기) → 신규 삽입
        const needsInsert = pm.id.startsWith('temp_') || !currentDbIds.has(pm.id);
        if (needsInsert) {
          const { id: _id, ...matchData } = pm;
          await insertMatch(matchData);
        } else {
          // 기존 경기 — 변경된 경우만 업데이트
          const original = matches.find(m => m.id === pm.id);
          if (!original) continue;
          const changed =
            JSON.stringify(original.team1) !== JSON.stringify(pm.team1) ||
            JSON.stringify(original.team2) !== JSON.stringify(pm.team2) ||
            original.round !== pm.round ||
            original.court !== pm.court ||
            original.matchType !== pm.matchType;
          if (changed) {
            await updateMatch(pm.id, {
              team1: pm.team1,
              team2: pm.team2,
              round: pm.round,
              court: pm.court,
              matchType: pm.matchType,
            });
          }
        }
      }

      for (const id of newDeletedIds) {
        await deleteMatch(id);
      }

      if (newRoundsCount !== session.rounds) {
        await updateSession(session.id, { rounds: newRoundsCount });
      }

      // pendingMatches를 비우지 않고 유지 → 빈 화면 flicker 방지
      // needsReloadRef=true로 설정 후 load() → useEffect에서 정렬된 DB 상태로 재초기화
      setDeletedMatchIds(new Set());
      needsReloadRef.current = true;
      load();
    } finally {
      setSaving(false);
    }
  };

  // ── Undo ─────────────────────────────────────────────────────────────────────

  const handleUndo = () => {
    if (undoStack.length === 0 || saving) return;
    const last = undoStack[undoStack.length - 1];
    setPendingMatches(last.matches);
    setPendingRoundsCount(last.roundsCount);
    setSubstituteTarget(null);
    setDeletedMatchIds(new Set());
    setUndoStack(prev => prev.slice(0, -1));
    // undo 상태도 DB에 동기화 (삭제된 경기는 needsInsert 로직으로 재삽입)
    autoSave(last.matches, new Set(), last.roundsCount);
  };

  // ── 라운드 수 조정 ────────────────────────────────────────────────────────────

  const handleRoundCountChange = (delta: number) => {
    const newCount = pendingRoundsCount + delta;
    if (newCount < 1) return;
    pushUndo();
    const newDeletedIds = new Set(deletedMatchIds);
    let newMatches = pendingMatches;
    if (delta < 0) {
      const toDelete = pendingMatches.filter(m => m.round > newCount);
      toDelete.filter(m => !m.id.startsWith('temp_')).forEach(m => newDeletedIds.add(m.id));
      newMatches = pendingMatches.filter(m => m.round <= newCount);
    }
    // load() 완료 후 useEffect가 실행될 때 session?.rounds가 stale할 수 있으므로
    // 의도한 라운드 수를 ref에 보존해 pendingRoundsCount가 되돌아가지 않도록 한다.
    targetRoundsCountRef.current = newCount;
    setPendingMatches(newMatches);
    setDeletedMatchIds(newDeletedIds);
    setPendingRoundsCount(newCount);
    autoSave(newMatches, newDeletedIds, newCount);
  };

  // ── 자동 배정 ─────────────────────────────────────────────────────────────────

  const handleAutoFillRound = (round: number) => {
    if (!session) return;
    pushUndo();
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
    const courts = session.courts;
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
        sessionId: session.id,
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
    const allNewMatches = [...pendingMatches, ...newMatches];
    setPendingMatches(allNewMatches);
    autoSave(allNewMatches, deletedMatchIds, pendingRoundsCount);
  };

  // ── 경기/라운드 삭제 ──────────────────────────────────────────────────────────

  const handleDeleteMatch = (matchId: string) => {
    pushUndo();
    const deletedMatch = pendingMatches.find(m => m.id === matchId);
    const affectedRound = deletedMatch?.round;
    const newDeletedIds = new Set(deletedMatchIds);
    if (!matchId.startsWith('temp_')) newDeletedIds.add(matchId);

    const filtered = pendingMatches.filter(m => m.id !== matchId);

    // 같은 라운드 내 코트 번호 재정렬 — 삭제 후 번호 구멍 방지
    // 현재 court 값 기준으로 정렬 후 1부터 재번호 부여
    let newMatches: Match[];
    if (affectedRound !== undefined) {
      const courtMap = new Map(
        filtered
          .filter(m => m.round === affectedRound)
          .sort((a, b) => a.court - b.court)
          .map((m, i) => [m.id, i + 1])
      );
      newMatches = filtered.map(m => {
        const newCourt = courtMap.get(m.id);
        return newCourt !== undefined ? { ...m, court: newCourt } : m;
      });
    } else {
      newMatches = filtered;
    }

    setPendingMatches(newMatches);
    setDeletedMatchIds(newDeletedIds);
    autoSave(newMatches, newDeletedIds, pendingRoundsCount);
  };

  const handleDeleteRound = (round: number) => {
    pushUndo();
    const toDelete = pendingMatches.filter(m => m.round === round);
    const newDeletedIds = new Set(deletedMatchIds);
    toDelete.filter(m => !m.id.startsWith('temp_')).forEach(m => newDeletedIds.add(m.id));
    const newMatches = pendingMatches
      .filter(m => m.round !== round)
      .map(m => m.round > round ? { ...m, round: m.round - 1 } : m);
    const newCount = Math.max(1, pendingRoundsCount - 1);
    // handleRoundCountChange와 동일: ref에 보존해 stale session?.rounds 방지
    targetRoundsCountRef.current = newCount;
    setPendingMatches(newMatches);
    setDeletedMatchIds(newDeletedIds);
    setPendingRoundsCount(newCount);
    autoSave(newMatches, newDeletedIds, newCount);
  };

  // ── 경기 수동 추가 ────────────────────────────────────────────────────────────

  const handleAddMatch = (round: number) => {
    if (!session) return;
    pushUndo();
    // 빈 슬롯 placeholder — 선수는 직접 드래그로 배정
    const ts = Date.now();
    const emptySlot = (n: number): Player => ({
      id: `placeholder_${ts}_${n}`,
      name: '',
      gender: 'male',
      ntrp: 0,
      type: 'member',
    });
    const matchesInRound = pendingMatches.filter(m => m.round === round);
    const nextCourt = matchesInRound.length > 0 ? Math.max(...matchesInRound.map(m => m.court)) + 1 : 1;
    const newMatch: Match = {
      id: `temp_${ts}`,
      sessionId: session.id,
      round,
      court: nextCourt,
      matchType: 'mixed',
      team1: { player1: emptySlot(1), player2: emptySlot(2) },
      team2: { player1: emptySlot(3), player2: emptySlot(4) },
      isCompleted: false,
    };
    const newMatches = [...pendingMatches, newMatch];
    setPendingMatches(newMatches);
    autoSave(newMatches, deletedMatchIds, pendingRoundsCount);
  };

  // ── matchType 인라인 변경 ─────────────────────────────────────────────────────

  const handleMatchTypeChange = (matchId: string, newType: MatchType) => {
    pushUndo();
    const newMatches = pendingMatches.map(m => m.id === matchId ? { ...m, matchType: newType } : m);
    setPendingMatches(newMatches);
    autoSave(newMatches, deletedMatchIds, pendingRoundsCount);
  };

  // ── 드래그앤드롭: 경기 카드 ───────────────────────────────────────────────────

  const handleDragDrop = (targetMatchId: string) => {
    if (!dragMatchId || dragMatchId === targetMatchId) {
      setDragMatchId(null);
      setDragOverMatchId(null);
      return;
    }
    pushUndo();
    const newPending = pendingMatches.map(m => ({ ...m }));
    const matchA = newPending.find(m => m.id === dragMatchId)!;
    const matchB = newPending.find(m => m.id === targetMatchId)!;
    [matchA.round, matchB.round] = [matchB.round, matchA.round];
    [matchA.court, matchB.court] = [matchB.court, matchA.court];
    setPendingMatches(newPending);
    setDragMatchId(null);
    setDragOverMatchId(null);
    autoSave(newPending, deletedMatchIds, pendingRoundsCount);
  };

  const handleDragToEmptyRound = (targetRound: number) => {
    if (!dragMatchId) return;
    pushUndo();
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
    autoSave(newPending, deletedMatchIds, pendingRoundsCount);
  };

  // ── 드래그앤드롭: 라운드 순서 ────────────────────────────────────────────────

  const handleRoundDrop = (targetRound: number) => {
    if (!dragRound || dragRound === targetRound) {
      setDragRound(null);
      setDragOverRound(null);
      return;
    }
    pushUndo();
    const newPending = pendingMatches.map(m => {
      if (m.round === dragRound) return { ...m, round: targetRound };
      if (m.round === targetRound) return { ...m, round: dragRound };
      return m;
    });
    setPendingMatches(newPending);
    setDragRound(null);
    setDragOverRound(null);
    autoSave(newPending, deletedMatchIds, pendingRoundsCount);
  };

  /** ↑↓ 버튼으로 두 라운드를 서로 교체 (드래그 없이 라운드 순서 변경) */
  const handleRoundSwap = (roundA: number, roundB: number) => {
    if (roundA === roundB) return;
    pushUndo();
    const newPending = pendingMatches.map(m => {
      if (m.round === roundA) return { ...m, round: roundB };
      if (m.round === roundB) return { ...m, round: roundA };
      return m;
    });
    setPendingMatches(newPending);
    autoSave(newPending, deletedMatchIds, pendingRoundsCount);
  };

  // ── 드래그앤드롭: 선수 ────────────────────────────────────────────────────────

  const handlePlayerDragStart = (
    matchId: string,
    team: 'team1' | 'team2',
    slot: 'player1' | 'player2',
  ) => {
    setDragPlayerSource({ matchId, team, slot });
  };

  const handlePlayerDrop = (
    targetMatchId: string,
    targetTeam: 'team1' | 'team2',
    targetSlot: 'player1' | 'player2',
  ) => {
    if (benchDragPlayer) {
      pushUndo();
      const newPending = pendingMatches.map(m => ({
        ...m,
        team1: { ...m.team1, player1: { ...m.team1.player1 }, player2: { ...m.team1.player2 } },
        team2: { ...m.team2, player1: { ...m.team2.player1 }, player2: { ...m.team2.player2 } },
      }));
      const tgtMatch = newPending.find(m => m.id === targetMatchId);
      if (!tgtMatch) { setBenchDragPlayer(null); return; }
      tgtMatch[targetTeam][targetSlot] = benchDragPlayer;
      setPendingMatches(newPending);
      setBenchDragPlayer(null);
      autoSave(newPending, deletedMatchIds, pendingRoundsCount);
      return;
    }
    if (!dragPlayerSource) return;
    const { matchId: srcMatchId, team: srcTeam, slot: srcSlot } = dragPlayerSource;
    if (srcMatchId === targetMatchId && srcTeam === targetTeam && srcSlot === targetSlot) {
      setDragPlayerSource(null);
      return;
    }
    pushUndo();
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
    autoSave(newPending, deletedMatchIds, pendingRoundsCount);
  };

  const handleBenchDragStart = (player: Player) => {
    setBenchDragPlayer(player);
    setDragPlayerSource(null);
  };

  // ── 선수 클릭 / 교체 ─────────────────────────────────────────────────────────

  const handlePlayerClick = (
    matchId: string,
    team: 'team1' | 'team2',
    slot: 'player1' | 'player2',
    player: Player,
  ) => {
    const match = pendingMatches.find(m => m.id === matchId);
    if (!match) return;
    if (
      substituteTarget?.matchId === matchId &&
      substituteTarget?.slot === slot &&
      substituteTarget?.team === team
    ) {
      setSubstituteTarget(null);
      return;
    }
    setSubstituteTarget({ matchId, team, slot, player, round: match.round });
  };

  const handleSubstitute = (replacementPlayer: Player) => {
    if (!substituteTarget) return;
    pushUndo();
    const newPending = pendingMatches.map(m => {
      if (m.id !== substituteTarget.matchId) return m;
      const updated = {
        ...m,
        team1: { ...m.team1, player1: { ...m.team1.player1 }, player2: { ...m.team1.player2 } },
        team2: { ...m.team2, player1: { ...m.team2.player1 }, player2: { ...m.team2.player2 } },
      };
      updated[substituteTarget.team][substituteTarget.slot] = replacementPlayer;
      return updated;
    });
    setPendingMatches(newPending);
    setSubstituteTarget(null);
    autoSave(newPending, deletedMatchIds, pendingRoundsCount);
  };

  return {
    // state
    pendingMatches,
    pendingRoundsCount,
    substituteTarget,
    saving,
    dragMatchId,
    dragOverMatchId,
    dragOverEmptyRound,
    deletedMatchIds,
    dragPlayerSource,
    benchDragPlayer,
    dragRound,
    dragOverRound,
    canUndo: undoStack.length > 0,
    // raw setters (RoundCard props에서 직접 사용)
    setSubstituteTarget,
    setDragMatchId,
    setDragOverMatchId,
    setDragOverEmptyRound,
    setDragRound,
    setDragOverRound,
    // handlers
    startEditWithMatches,
    handleRoundCountChange,
    handleAutoFillRound,
    handleDeleteMatch,
    handleDeleteRound,
    handleAddMatch,
    handleMatchTypeChange,
    handleUndo,
    handleDragDrop,
    handleDragToEmptyRound,
    handleRoundDrop,
    handleRoundSwap,
    handlePlayerDragStart,
    handlePlayerDrop,
    handleBenchDragStart,
    handlePlayerClick,
    handleSubstitute,
  };
}
