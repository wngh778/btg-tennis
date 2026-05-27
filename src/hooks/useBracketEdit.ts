import { useState } from 'react';
import { updateMatch, insertMatch, deleteMatch, updateSession } from '../lib/database';
import type { Match, Player, Session } from '../types';
import type { SubstituteTarget } from '../components/session/RoundCard';

interface UseBracketEditOptions {
  matches: Match[];
  session: Session | null;
  attendingPlayers: Player[];
  load: () => Promise<void>;
}

export function useBracketEdit({
  matches,
  session,
  attendingPlayers,
  load,
}: UseBracketEditOptions) {
  const [editMode, setEditMode] = useState(false);
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

  // 수기 저장 후 바로 편집 모드 진입 (useGenerateModal에서 호출)
  const startEditWithMatches = (newMatches: Match[], rounds: number) => {
    const copied: Match[] = JSON.parse(JSON.stringify(newMatches));
    setPendingMatches(copied);
    const maxRound = copied.length > 0 ? Math.max(...copied.map(m => m.round)) : rounds;
    setPendingRoundsCount(Math.max(rounds, maxRound));
    setSubstituteTarget(null);
    setDeletedMatchIds(new Set());
    setEditMode(true);
  };

  const handleEditModeStart = () => {
    if (!session) return;
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
    if (!session) return;
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
    if (!session) return;
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
    setPendingMatches(prev =>
      prev
        .filter(m => m.round !== round)
        .map(m => m.round > round ? { ...m, round: m.round - 1 } : m)
    );
    setPendingRoundsCount(prev => Math.max(1, prev - 1));
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

  const handleRoundDrop = (targetRound: number) => {
    if (!dragRound || dragRound === targetRound) {
      setDragRound(null);
      setDragOverRound(null);
      return;
    }
    setPendingMatches(prev => prev.map(m => {
      if (m.round === dragRound) return { ...m, round: targetRound };
      if (m.round === targetRound) return { ...m, round: dragRound };
      return m;
    }));
    setDragRound(null);
    setDragOverRound(null);
  };

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
      return;
    }
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

  const handleBenchDragStart = (player: Player) => {
    setBenchDragPlayer(player);
    setDragPlayerSource(null);
  };

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
  };

  return {
    // state
    editMode,
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
    // raw setters (RoundCard props에서 직접 사용)
    setSubstituteTarget,
    setDragMatchId,
    setDragOverMatchId,
    setDragOverEmptyRound,
    setDragRound,
    setDragOverRound,
    // handlers
    startEditWithMatches,
    handleEditModeStart,
    handleEditCancel,
    handleRoundCountChange,
    handleEditSave,
    handleAutoFillRound,
    handleDeleteMatch,
    handleDeleteRound,
    handleDragDrop,
    handleDragToEmptyRound,
    handleRoundDrop,
    handlePlayerDragStart,
    handlePlayerDrop,
    handleBenchDragStart,
    handlePlayerClick,
    handleSubstitute,
  };
}
