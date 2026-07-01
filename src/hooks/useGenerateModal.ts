import { useState } from 'react';
import type React from 'react';
import {
  getAllMatches, saveMatches, updateSession, insertMatch, deleteMatch, getMatches,
} from '../lib/database';
import {
  generateMatches, generateGroupMatches, generateFixedPairMatches,
  generateCrossGroupMatches,
  calcOptimalGroupRounds, calculateExpectedGames, findOptimalMixedRounds,
} from '../utils/matchmaking';
import type { PairingStrategy } from '../utils/matchmaking';
import type { Match, Player, Session, SessionGroup, MatchType, Gender, AttendanceRecord } from '../types';

type TabType = 'vote' | 'groups' | 'bracket' | 'detail' | 'result';

interface UseGenerateModalOptions {
  session: Session | null;
  attendingPlayers: Player[];
  attendance: AttendanceRecord[];
  matches: Match[];
  groups: SessionGroup[];
  load: () => Promise<void>;
  changeTab: (tab: TabType) => void;
  startEditWithMatches: (newMatches: Match[], rounds: number) => void;
  setMatches: React.Dispatch<React.SetStateAction<Match[]>>;
  setSession: React.Dispatch<React.SetStateAction<Session | null>>;
  setSelectedGroupId: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useGenerateModal({
  session,
  attendingPlayers,
  attendance,
  matches,
  groups,
  load,
  changeTab,
  startEditWithMatches,
  setMatches,
  setSession,
  setSelectedGroupId,
}: UseGenerateModalOptions) {
  // ── 모드 선택 모달 ──────────────────────────────────────────────────────────
  const [showModeModal, setShowModeModal] = useState(false);

  // ── 일반 대진표 생성 모달 ────────────────────────────────────────────────────
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateCourts, setGenerateCourts] = useState(4);
  const [generateRounds, setGenerateRounds] = useState(6);
  const [generateMixedRounds, setGenerateMixedRounds] = useState(2);
  const [generateTargetGroup, setGenerateTargetGroup] = useState<string | 'all'>('all');
  const [generateMode, setGenerateMode] = useState<'rounds' | 'games'>('rounds');
  const [generateTargetGames, setGenerateTargetGames] = useState(4);
  const [generateStrategy, setGenerateStrategy] = useState<PairingStrategy>('no-repeat-pair');
  const [aiRecommendMsg, setAiRecommendMsg] = useState<string | null>(null);
  const [showMixedSuggestion, setShowMixedSuggestion] = useState(false);
  const [suggestedMixedRounds, setSuggestedMixedRounds] = useState(0);
  const [showSimpleView, setShowSimpleView] = useState(false);

  // ── 월요일 편성 모달 ─────────────────────────────────────────────────────────
  const [showMondayModal, setShowMondayModal] = useState(false);
  const [mondayBasePlayer, setMondayBasePlayer] = useState('');
  const [mondayR1Selection, setMondayR1Selection] = useState<string[]>([]);
  const [mondayCompanion, setMondayCompanion] = useState('');
  const [mondayRounds, setMondayRounds] = useState(5);

  // ── 대회연습모드 모달 ────────────────────────────────────────────────────────
  const [showFixedPairModal, setShowFixedPairModal] = useState(false);
  const [fixedPairSelection, setFixedPairSelection] = useState<string[]>([]);
  const [fixedPairCourts, setFixedPairCourts] = useState(2);
  const [fixedPairRounds, setFixedPairRounds] = useState(6);

  // ── 조간 대진 설정 ───────────────────────────────────────────────────────────
  const [generateCrossGroup, setGenerateCrossGroup] = useState(false);
  const [crossGroupPairs, setCrossGroupPairs] = useState<{ groupAId: string; groupBId: string }[]>([]);

  // ── 수기 입력 모달 ───────────────────────────────────────────────────────────
  const [showManualMode, setShowManualMode] = useState(false);
  const [manualStep, setManualStep] = useState<'setup' | 'assign'>('setup');
  const [manualRounds, setManualRounds] = useState(5);
  const [manualCourts, setManualCourts] = useState(3);
  const [manualActiveRound, setManualActiveRound] = useState(1);
  const [manualSlots, setManualSlots] = useState<Record<string, Player[]>>({});

  // ────────────────────────────────────────────────────────────────────────────
  // 핸들러
  // ────────────────────────────────────────────────────────────────────────────

  const handleGenerateClick = () => {
    if (!session) return;
    setGenerateCourts(session.courts);
    setGenerateRounds(session.rounds);
    setGenerateMixedRounds(session.mixedRounds);
    setGenerateTargetGroup('all');
    setGenerateStrategy('no-repeat-pair');
    setGenerateCrossGroup(false);
    // 이름 suffix(마지막 단어) 기준으로 자동 대결 쌍 감지
    // 예: ["OB A조","OB B조","YB A조","YB B조"] → [(OB A조 vs YB A조), (OB B조 vs YB B조)]
    if (groups.length >= 2) {
      const suffixMap = new Map<string, SessionGroup[]>();
      for (const g of groups) {
        const parts = g.name.trim().split(/\s+/);
        const suffix = parts[parts.length - 1];
        if (!suffixMap.has(suffix)) suffixMap.set(suffix, []);
        suffixMap.get(suffix)!.push(g);
      }
      const detectedPairs: { groupAId: string; groupBId: string }[] = [];
      for (const [, gs] of [...suffixMap.entries()].sort(([a], [b]) => a.localeCompare(b, 'ko'))) {
        for (let i = 0; i + 1 < gs.length; i += 2) {
          detectedPairs.push({ groupAId: gs[i].id, groupBId: gs[i + 1].id });
        }
      }
      setCrossGroupPairs(
        detectedPairs.length > 0
          ? detectedPairs
          : [{ groupAId: groups[0].id, groupBId: groups[1].id }],
      );
    }
    setShowGenerateModal(true);
  };

  const doGenerate = async (mixedRoundsToUse: number, mixedLast = false) => {
    if (!session) return;
    setShowGenerateModal(false);
    setShowMixedSuggestion(false);
    const allClubMatches = await getAllMatches(session.clubId);
    const pastMatches = allClubMatches.filter(m => m.sessionId !== session.id);
    const latePlayerIds = session.trackLate
      ? new Set(attendance.filter(a => a.attending && a.isLate === true).map(a => a.playerId))
      : new Set<string>();
    const generated = generateMatches({
      sessionId: session.id,
      players: attendingPlayers,
      courts: generateCourts,
      totalRounds: generateRounds,
      mixedRounds: session.type === 'weekly' ? mixedRoundsToUse : 0,
      mixedLast,
      sessionType: session.type,
      pastMatches,
      latePlayerIds,
      strategy: generateStrategy,
    });
    await saveMatches(session.id, generated);
    await updateSession(session.id, {
      isGenerated: true,
      courts: generateCourts,
      rounds: generateRounds,
      mixedRounds: session.type === 'weekly' ? mixedRoundsToUse : 0,
    });
    // 재생성 후 전체 보기로 초기화 (suffix 탭 등 필터가 남아있으면 일부 라운드만 표시됨)
    setSelectedGroupId(null);
    // pendingMatches를 즉시 비워 stale 대진표가 잠깐 보이는 현상 방지
    startEditWithMatches([], 0);
    await load();  // await: 데이터 갱신 완료 후 탭 전환 (새로고침 효과)
    changeTab('bracket');
  };

  const handleGenerate = async () => {
    if (!session) return;

    // ── 그룹 모드: 조 내부 or 조간 대진으로 분기 ──────────────────────────────
    // 기존에는 이 분기가 없어 generateCrossGroup / generateMode 설정이 완전히 무시되고
    // 항상 doGenerate(일반 매칭)가 호출됐음 → 라운드 2개, 미배정 선수 발생
    if (session.gameMode === 'group') {
      if (generateCrossGroup) {
        await handleGenerateCrossGroupMatches();
      } else {
        await handleGenerateGroupMatches(generateTargetGroup);
      }
      return;
    }

    // ── 일반(weekly / quarterly) 모드 ─────────────────────────────────────────
    if (session.type === 'weekly') {
      const maleCount = attendingPlayers.filter(p => p.gender === 'male').length;
      const femaleCount = attendingPlayers.filter(p => p.gender === 'female').length;
      if (maleCount > 0 && femaleCount > 0) {
        const { maleAvg, femaleAvg } = calculateExpectedGames(
          maleCount, femaleCount, generateCourts, generateRounds, generateMixedRounds,
        );
        if (Math.abs(maleAvg - femaleAvg) > 1) {
          const optimal = findOptimalMixedRounds(maleCount, femaleCount, generateCourts, generateRounds);
          if (optimal !== generateMixedRounds) {
            setSuggestedMixedRounds(optimal);
            setShowMixedSuggestion(true);
            return;
          }
        }
      }
    }
    await doGenerate(generateMixedRounds);
  };

  const handleGenerateGroupMatches = async (groupId: string | 'all') => {
    if (!session) return;
    setShowGenerateModal(false);
    const targetGroups = groupId === 'all' ? groups : groups.filter(g => g.id === groupId);

    // 전체 재생성: React state가 stale할 수 있으므로 DB에서 최신 데이터를 읽어 삭제
    // 전체(all): 세션 내 모든 경기 삭제 (고아 경기 포함 완전 초기화)
    // 단일 조: DB에서 해당 조 경기만 조회해서 삭제
    const freshMatches = await getMatches(session.id);
    if (groupId === 'all') {
      for (const m of freshMatches) await deleteMatch(m.id);
    } else {
      const staleIds = freshMatches.filter(m => targetGroups.some(g => g.id === m.groupId)).map(m => m.id);
      for (const id of staleIds) await deleteMatch(id);
    }

    for (const group of targetGroups) {
      const groupPlayers = attendingPlayers.filter(p => group.memberIds.includes(p.id));
      if (groupPlayers.length < 4) continue;
      const activeCourtsForGroup = Math.min(generateCourts, Math.floor(groupPlayers.length / 4));
      let totalRounds = generateRounds;
      if (generateMode === 'games') {
        const playing = activeCourtsForGroup * 4;
        totalRounds = playing > 0
          ? Math.round(generateTargetGames * groupPlayers.length / playing)
          : generateRounds;
        if (totalRounds < 1) totalRounds = 1;
      }
      const generated = generateGroupMatches({
        sessionId: session.id,
        groupId: group.id,
        players: groupPlayers,
        courts: generateCourts,
        totalRounds,
        strategy: generateStrategy,
      });
      for (const m of generated) await insertMatch(m);
    }
    await updateSession(session.id, { isGenerated: true, courts: generateCourts, rounds: generateRounds });
    // 생성된 조 탭으로 즉시 이동 (재생성 후 필터 동기화)
    setSelectedGroupId(groupId === 'all' ? null : groupId);
    // stale pendingMatches 즉시 비워 재생성 직후 이전 대진표가 순간 노출되지 않도록
    startEditWithMatches([], 0);
    await load();
    changeTab('bracket');
  };

  const handleGenerateCrossGroupMatches = async () => {
    if (!session) return;

    // 유효한 쌍만 필터: 서로 다른 조, 각 2명 이상 참석
    const validPairs = crossGroupPairs.filter(pair => {
      if (pair.groupAId === pair.groupBId) return false;
      const gA = groups.find(g => g.id === pair.groupAId);
      const gB = groups.find(g => g.id === pair.groupBId);
      if (!gA || !gB) return false;
      const pA = attendingPlayers.filter(p => gA.memberIds.includes(p.id));
      const pB = attendingPlayers.filter(p => gB.memberIds.includes(p.id));
      return pA.length >= 2 && pB.length >= 2;
    });

    if (validPairs.length === 0) {
      alert('유효한 대결 쌍이 없습니다.\n• 각 조에 2명 이상의 참석자가 필요합니다.\n• 같은 조끼리는 대결 쌍이 될 수 없습니다.');
      return;
    }

    setShowGenerateModal(false);

    // stale React state(matches) 대신 DB에서 최신 경기 조회 후 삭제
    // (직전 autoSave가 진행 중일 수 있어 React state가 stale할 수 있음)
    const freshMatches = await getMatches(session.id);

    // 기존 조간 대진 경기(groupId 없는 경기) 삭제
    const existingCrossMatches = freshMatches.filter(m => !m.groupId);
    for (const m of existingCrossMatches) await deleteMatch(m.id);

    // 해당 쌍에 포함된 조들의 내부 대진도 삭제 (조간 대진 생성 시 내부 대진은 불필요)
    const involvedGroupIds = new Set(validPairs.flatMap(p => [p.groupAId, p.groupBId]));
    const existingInternalMatches = freshMatches.filter(m => m.groupId && involvedGroupIds.has(m.groupId));
    for (const m of existingInternalMatches) await deleteMatch(m.id);

    // 각 대결 쌍에 코트 분배: 나머지 코트는 앞 쌍부터 1개씩 추가 배분
    // 예) 3코트 / 2쌍 → [2, 1] (floor=1, remainder=1 → 첫 쌍이 +1)
    const baseCourtsPerPair = Math.max(1, Math.floor(generateCourts / validPairs.length));
    const courtRemainder = generateCourts % validPairs.length;

    let courtOffset = 0;
    let maxGeneratedRounds = 0; // 실제 생성된 최대 라운드 수 (updateSession에 사용)

    for (let pairIdx = 0; pairIdx < validPairs.length; pairIdx++) {
      const pair = validPairs[pairIdx];
      const pairCourts = baseCourtsPerPair + (pairIdx < courtRemainder ? 1 : 0);

      const gA = groups.find(g => g.id === pair.groupAId)!;
      const gB = groups.find(g => g.id === pair.groupBId)!;
      const playersA = attendingPlayers.filter(p => gA.memberIds.includes(p.id));
      const playersB = attendingPlayers.filter(p => gB.memberIds.includes(p.id));

      // games 모드: 인당 최소 게임 수 기반으로 라운드 수 계산
      // A군과 B군 각각에서 모든 선수가 최소 N경기를 보장하는 라운드를 구해 큰 값 사용
      let pairRounds = generateRounds;
      if (generateMode === 'games') {
        const activeCourts = Math.min(
          pairCourts,
          Math.floor(playersA.length / 2),
          Math.floor(playersB.length / 2),
        );
        if (activeCourts > 0) {
          // roundsForX = ceil(minGames * n / (activeCourts * 2))
          // → 모든 선수가 최소 minGames경기 이상 (일부는 +1 허용)
          const roundsForA = Math.ceil(generateTargetGames * playersA.length / (activeCourts * 2));
          const roundsForB = Math.ceil(generateTargetGames * playersB.length / (activeCourts * 2));
          pairRounds = Math.max(roundsForA, roundsForB);
        }
        if (pairRounds < 1) pairRounds = 1;
      }

      const generated = generateCrossGroupMatches({
        sessionId: session.id,
        groupA: { id: gA.id, players: playersA },
        groupB: { id: gB.id, players: playersB },
        courts: pairCourts,
        totalRounds: pairRounds,
        courtOffset,
        strategy: generateStrategy,
      });

      for (const m of generated) await insertMatch(m);
      courtOffset += pairCourts;
      if (pairRounds > maxGeneratedRounds) maxGeneratedRounds = pairRounds;
    }

    // rounds를 실제 생성된 최대 라운드 수로 저장 (generateRounds는 UI 기본값일 뿐)
    await updateSession(session.id, {
      isGenerated: true,
      courts: generateCourts,
      rounds: maxGeneratedRounds > 0 ? maxGeneratedRounds : generateRounds,
    });
    // 조간 대진 생성 후 전체 보기로 초기화 (재생성 후 즉시 반영)
    setSelectedGroupId(null);
    await load();
    changeTab('bracket');
  };

  const handleAiRecommend = () => {
    if (!session) return;
    const maleCount = attendingPlayers.filter(p => p.gender === 'male').length;
    const femaleCount = attendingPlayers.filter(p => p.gender === 'female').length;
    const total = maleCount + femaleCount;
    if (total < 4) { alert('참석자가 4명 이상이어야 합니다.'); return; }
    setAiRecommendMsg(null);
    const courts = Math.max(2, Math.min(4, Math.floor(total / 4)));
    const slotsPerRound = courts * 4;
    const utilization = slotsPerRound / total;
    const targetGames = 5;
    const rounds = Math.max(4, Math.min(8, Math.round(targetGames / utilization)));
    const mixedRounds = findOptimalMixedRounds(maleCount, femaleCount, courts, rounds);
    const { maleAvg, femaleAvg } = calculateExpectedGames(maleCount, femaleCount, courts, rounds, mixedRounds);
    setGenerateCourts(courts);
    setGenerateRounds(rounds);
    setGenerateMixedRounds(mixedRounds);
    setAiRecommendMsg(
      `코트 ${courts}개 · 라운드 ${rounds}개 · 혼복 ${mixedRounds}라운드` +
      ` — 남 평균 ${maleAvg.toFixed(1)}경기 / 여 평균 ${femaleAvg.toFixed(1)}경기`,
    );
  };

  const handleMondayClick = () => {
    if (!session) return;
    const malePlayers = attendingPlayers.filter(p => p.gender === 'male');
    if (malePlayers.length !== 6) {
      alert(`참석 남성이 ${malePlayers.length}명입니다. 이 기능은 정확히 6명일 때 사용할 수 있습니다.`);
      return;
    }
    const yom = malePlayers.find(p => p.name === '염주호');
    setMondayBasePlayer(yom?.id ?? malePlayers[0].id);
    setMondayR1Selection([]);
    setMondayCompanion('');
    setMondayRounds(session.rounds >= 6 ? 6 : 5);
    setShowMondayModal(true);
  };

  const handleMondayGenerate = async () => {
    if (!session) return;
    const malePlayers = attendingPlayers.filter(p => p.gender === 'male');
    const Y = malePlayers.find(p => p.id === mondayBasePlayer);
    if (!Y) { alert('기준 선수를 찾을 수 없습니다.'); return; }
    if (mondayR1Selection.length !== 3) { alert('첫 경기 추가 선수를 3명 선택하세요.'); return; }
    if (!mondayCompanion) { alert('파트너를 선택하세요.'); return; }
    const companion = malePlayers.find(p => p.id === mondayCompanion)!;
    const groupB = mondayR1Selection
      .filter(id => id !== mondayCompanion)
      .map(id => malePlayers.find(p => p.id === id)!);
    const groupC = malePlayers.filter(p => p.id !== Y.id && !mondayR1Selection.includes(p.id));
    const [B1, B2] = groupB;
    const [C1, C2] = groupC;
    setShowMondayModal(false);
    const mk = (round: number, t1p1: Player, t1p2: Player, t2p1: Player, t2p2: Player): Omit<Match, 'id'> => ({
      sessionId: session.id,
      round,
      court: 1,
      matchType: 'male' as const,
      team1: { player1: t1p1, player2: t1p2 },
      team2: { player1: t2p1, player2: t2p2 },
      score1: undefined,
      score2: undefined,
      isCompleted: false,
    });
    const generated: Omit<Match, 'id'>[] = [
      mk(1, Y, companion, B1, B2),
      mk(2, Y, C1, companion, C2),
      mk(3, B1, C1, B2, C2),
      mk(4, Y, B1, companion, B2),
      mk(5, Y, C2, companion, C1),
    ];
    if (mondayRounds >= 6) {
      generated.push(mk(6, B1, C2, B2, C1));
    }
    await saveMatches(session.id, generated);
    await updateSession(session.id, { isGenerated: true, courts: 1, rounds: mondayRounds, mixedRounds: 0 });
    setSelectedGroupId(null);
    await load();
    changeTab('bracket');
  };

  const handleFixedPairGenerate = async () => {
    if (!session) return;
    if (fixedPairSelection.length !== 2) { alert('고정 페어 2명을 선택하세요.'); return; }
    const [idA, idB] = fixedPairSelection;
    const generated = generateFixedPairMatches({
      sessionId: session.id,
      players: attendingPlayers,
      fixedPairIds: [idA, idB],
      courts: fixedPairCourts,
      totalRounds: fixedPairRounds,
    });
    if (generated.length === 0) {
      alert('대진표를 생성할 수 없습니다. 참석 인원과 코트 수를 확인하세요.');
      return;
    }
    setShowFixedPairModal(false);
    await saveMatches(session.id, generated);
    await updateSession(session.id, {
      isGenerated: true,
      courts: fixedPairCourts,
      rounds: fixedPairRounds,
      mixedRounds: 0,
    });
    setSelectedGroupId(null);
    await load();
    changeTab('bracket');
  };

  const handleManualTogglePlayer = (round: number, court: number, player: Player) => {
    const key = `${round}_${court}`;
    setManualSlots(prev => {
      const current = prev[key] ?? [];
      const exists = current.find(p => p.id === player.id);
      if (exists) return { ...prev, [key]: current.filter(p => p.id !== player.id) };
      if (current.length >= 4) return prev;
      return { ...prev, [key]: [...current, player] };
    });
  };

  const handleManualSave = async () => {
    if (!session) return;
    const generated: Omit<Match, 'id'>[] = [];
    for (let r = 1; r <= manualRounds; r++) {
      for (let c = 1; c <= manualCourts; c++) {
        const players = manualSlots[`${r}_${c}`] ?? [];
        if (players.length !== 4) continue;
        const maleCnt = players.filter(p => p.gender === 'male').length;
        const matchType: MatchType = maleCnt === 4 ? 'male' : maleCnt === 0 ? 'female' : 'mixed';
        let t1p1: Player, t1p2: Player, t2p1: Player, t2p2: Player;
        if (matchType === 'mixed') {
          const males = players.filter(p => p.gender === 'male');
          const females = players.filter(p => p.gender === 'female');
          t1p1 = males[0]; t1p2 = females[0];
          t2p1 = males[1]; t2p2 = females[1];
        } else {
          [t1p1, t1p2, t2p1, t2p2] = players as [Player, Player, Player, Player];
        }
        generated.push({
          sessionId: session.id,
          round: r,
          court: c,
          matchType,
          team1: { player1: t1p1, player2: t1p2 },
          team2: { player1: t2p1, player2: t2p2 },
          isCompleted: false,
        });
      }
    }
    if (generated.length === 0) { alert('배정된 경기가 없습니다.'); return; }
    if (matches.length > 0) {
      if (!confirm(`기존 대진표(${matches.length}경기)를 교체하시겠습니까?`)) return;
    }
    await saveMatches(session.id, generated);
    await updateSession(session.id, {
      isGenerated: true,
      rounds: manualRounds,
      courts: manualCourts,
    });
    const newMatches = await getMatches(session.id);
    setMatches(newMatches);
    setSession(prev => prev
      ? { ...prev, isGenerated: true, rounds: manualRounds, courts: manualCourts }
      : prev,
    );
    setShowManualMode(false);
    setManualSlots({});
    setManualStep('setup');
    changeTab('bracket');
    // 저장 직후 자동으로 편집 모드 진입
    startEditWithMatches(newMatches, manualRounds);
  };

  return {
    // 모드 선택
    showModeModal, setShowModeModal,
    // 일반 생성 모달
    showGenerateModal, setShowGenerateModal,
    generateCourts, setGenerateCourts,
    generateRounds, setGenerateRounds,
    generateMixedRounds, setGenerateMixedRounds,
    generateTargetGroup, setGenerateTargetGroup,
    generateMode, setGenerateMode,
    generateTargetGames, setGenerateTargetGames,
    generateStrategy, setGenerateStrategy,
    aiRecommendMsg,
    showMixedSuggestion, setShowMixedSuggestion,
    suggestedMixedRounds,
    showSimpleView, setShowSimpleView,
    // 월요일
    showMondayModal, setShowMondayModal,
    mondayBasePlayer, setMondayBasePlayer,
    mondayR1Selection, setMondayR1Selection,
    mondayCompanion, setMondayCompanion,
    mondayRounds, setMondayRounds,
    // 대회연습
    showFixedPairModal, setShowFixedPairModal,
    fixedPairSelection, setFixedPairSelection,
    fixedPairCourts, setFixedPairCourts,
    fixedPairRounds, setFixedPairRounds,
    // 수기입력
    showManualMode, setShowManualMode,
    manualStep, setManualStep,
    manualRounds, setManualRounds,
    manualCourts, setManualCourts,
    manualActiveRound, setManualActiveRound,
    manualSlots, setManualSlots,
    // 조간 대진
    generateCrossGroup, setGenerateCrossGroup,
    crossGroupPairs, setCrossGroupPairs,
    // 핸들러
    handleGenerateClick,
    doGenerate,
    handleGenerate,
    handleGenerateGroupMatches,
    handleGenerateCrossGroupMatches,
    handleAiRecommend,
    handleMondayClick,
    handleMondayGenerate,
    handleFixedPairGenerate,
    handleManualTogglePlayer,
    handleManualSave,
    // 유틸
    calcOptimalGroupRounds,
    calculateExpectedGames,
  };
}

// Gender 타입 재export (JSX에서 사용)
export type { Gender };
