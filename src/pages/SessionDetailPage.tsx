import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  getSession, getMembers, getGuests, getAttendance,
  setAttendance, setArrivalOrder, deleteAttendance,
  getMatches, updateMatchScore, updateSession,
  getSessionGroups, deleteMatch, insertMatch, saveMatches,
} from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { useClub } from '../contexts/ClubContext';
import { isVotingOpen } from '../utils/matchmaking';
import type { Session, Member, Guest, AttendanceRecord, Match, Player, SessionGroup, MatchType } from '../types';
import { useBracketEdit } from '../hooks/useBracketEdit';
import { useGenerateModal } from '../hooks/useGenerateModal';
import { useGuestForm } from '../hooks/useGuestForm';
import { formatDate } from '../utils/formatting';
import { LoadingState, ErrorState } from '../components/ui/PageState';
import { PlayerDetailTab } from '../components/session/PlayerDetailTab';
import { SessionResultTab } from '../components/session/SessionResultTab';
import { GroupResultTab } from '../components/session/GroupResultTab';
import { GroupsTab } from '../components/session/GroupsTab';
// 분리된 탭 컴포넌트
import { VoteTab } from '../components/session/VoteTab';
import { BracketTab } from '../components/session/BracketTab';
// 분리된 모달 컴포넌트
import { GenerateModeModal } from '../components/session/modals/GenerateModeModal';
import { FixedPairModal } from '../components/session/modals/FixedPairModal';
import { MondayScheduleModal } from '../components/session/modals/MondayScheduleModal';
import { SubstituteModal } from '../components/session/modals/SubstituteModal';
import { SimpleViewModal } from '../components/session/modals/SimpleViewModal';
import { GenerateSettingsModal } from '../components/session/modals/GenerateSettingsModal';
import { MixedSuggestionModal } from '../components/session/modals/MixedSuggestionModal';
import { ManualBracketModal } from '../components/session/modals/ManualBracketModal';

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, appUser, isAdminUser, isSuperAdmin, loading: authLoading } = useAuth();
  const { currentClub } = useClub();

  // ── 핵심 데이터 상태 ──────────────────────────────────────────────────────────
  const [session, setSession] = useState<Session | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [attendance, setAttendanceState] = useState<AttendanceRecord[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'vote' | 'groups' | 'bracket' | 'detail' | 'result'>(() => {
    if (!id) return 'vote';
    const saved = sessionStorage.getItem(`sdp_tab_${id}`);
    const VALID: string[] = ['vote', 'groups', 'bracket', 'detail', 'result'];
    return (VALID.includes(saved ?? '') ? saved : 'vote') as 'vote' | 'groups' | 'bracket' | 'detail' | 'result';
  });
  const [groups, setGroups] = useState<SessionGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  // 참석인원 상세 탭 — 게스트 포함 토글 (탭 전환 시에도 유지)
  const [showDetailGuests, setShowDetailGuests] = useState(false);

  // ── 훅 호출 전 파생 값 ─────────────────────────────────────────────────────
  // 이름은 members 최신 정보 우선 사용 → 멤버 이름 수정 후 즉시 대진표에 반영
  const attendingPlayers = useMemo<Player[]>(() =>
    attendance
      .filter(a => a.attending)
      .map(a => {
        const member = a.playerType === 'member' ? members.find(m => m.id === a.playerId) : undefined;
        return { id: a.playerId, name: member?.name ?? a.playerName, gender: a.gender, ntrp: a.ntrp, type: a.playerType };
      }),
    [attendance, members],
  );

  // 탭 변경 + sessionStorage 저장
  const changeTab = (t: 'vote' | 'groups' | 'bracket' | 'detail' | 'result') => {
    if (id) sessionStorage.setItem(`sdp_tab_${id}`, t);
    setTab(t);
  };

  // 데이터 로드
  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [s, g, a, mx, grps] = await Promise.all([
        getSession(id), getGuests(id), getAttendance(id), getMatches(id), getSessionGroups(id),
      ]);
      const clubId = s?.clubId ?? currentClub?.id;
      const m = clubId ? await getMembers(clubId) : [];
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

  // auth 초기화 완료 후에만 데이터 로드
  useEffect(() => { if (!authLoading) load(); }, [load, authLoading]);

  // 조별경기: 그룹 로드 후 내 그룹 자동 선택
  useEffect(() => {
    if (groups.length > 0 && selectedGroupId === null && session?.gameMode === 'group') {
      const hasCrossMatches = matches.some(m => !m.groupId);
      if (hasCrossMatches) return;
      const myMemberInEffect = appUser ? members.filter(m => m.isActive).find(m => m.name === appUser.username) ?? null : null;
      const myGroupInEffect = myMemberInEffect ? groups.find(g => g.memberIds.includes(myMemberInEffect.id)) ?? null : null;
      setSelectedGroupId(myGroupInEffect?.id ?? groups[0]?.id ?? null);
    }
  }, [groups, matches, session?.gameMode]);

  // ── 커스텀 훅 (React Rules of Hooks: early return 앞에 위치) ───────────────
  const bracketEdit = useBracketEdit({ matches, session, attendingPlayers, load });
  const guestForm = useGuestForm({ session, matches, isAdminUser, load });
  // 도착순 1라운드 생성 (UI 부수효과 없음 — useGenerateModal 내에서 호출됨)
  const generateArrivalRound1 = async () => {
    if (!session) return;
    const sorted = attendance
      .filter(a => a.attending && a.arrivalOrder != null)
      .sort((a, b) => a.arrivalOrder! - b.arrivalOrder!);
    if (sorted.length < 4) return;
    const getPlayer = (rec: AttendanceRecord): Player => {
      const member = members.find(m => m.id === rec.playerId);
      return { id: rec.playerId, name: member?.name ?? rec.playerName, gender: rec.gender, ntrp: rec.ntrp, type: rec.playerType as 'member' | 'guest' };
    };
    const [p1, p2, p3, p4] = [sorted[0], sorted[1], sorted[2], sorted[3]].map(getPlayer);
    const all = [p1, p2, p3, p4];
    const hasMale = all.some(p => p.gender === 'male');
    const hasFemale = all.some(p => p.gender === 'female');
    const matchType: MatchType = !hasFemale ? 'male' : !hasMale ? 'female' : 'mixed';
    const round1Match: Omit<Match, 'id'> = {
      sessionId: session.id, round: 1, court: 1, matchType,
      team1: { player1: p1, player2: p2 }, team2: { player1: p3, player2: p4 },
      score1: undefined, score2: undefined, isCompleted: false,
    };
    // 기존 1라운드 삭제 후 새 1라운드 삽입 (load()는 이후 doGenerate에서 일괄 처리)
    const currentRound1 = matches.filter(m => m.round === 1);
    await Promise.all(currentRound1.map(m => deleteMatch(m.id)));
    await insertMatch(round1Match);
    await updateSession(session.id, { isGenerated: true });
  };

  const generateModal = useGenerateModal({
    session,
    attendingPlayers,
    attendance,
    matches,
    groups,
    load,
    changeTab,
    startEditWithMatches: bracketEdit.startEditWithMatches,
    setMatches,
    setSession,
    setSelectedGroupId,
    arrivalRound1Handler: generateArrivalRound1,
  });

  // 훅 반환값 구조분해
  const {
    pendingMatches, pendingRoundsCount, substituteTarget, saving,
    dragMatchId, dragOverMatchId, dragOverEmptyRound,
    dragRound, dragOverRound,
    canUndo,
    setDragMatchId, setDragOverMatchId, setDragOverEmptyRound, setDragRound, setDragOverRound,
    setSubstituteTarget,
    handleRoundCountChange,
    handleAutoFillRound, handleDeleteMatch, handleDeleteRound,
    handleAddMatch, handleMatchTypeChange, handleUndo,
    handleDragDrop, handleDragToEmptyRound, handleRoundDrop, handleRoundSwap,
    handlePlayerDragStart, handlePlayerDrop, handleBenchDragStart,
    handlePlayerClick, handleSubstitute,
  } = bracketEdit;

  const editMode = isAdminUser;

  const {
    showGuestForm, guestName, guestGender, guestNtrp,
    editingGuestId, editGuestName, editGuestGender, editGuestNtrp,
    setShowGuestForm, setGuestName, setGuestGender, setGuestNtrp,
    setEditingGuestId, setEditGuestName, setEditGuestGender, setEditGuestNtrp,
    handleAddGuest, handleRemoveGuest, handleStartEditGuest, handleSaveEditGuest,
  } = guestForm;

  const {
    showModeModal, setShowModeModal,
    showGenerateModal, setShowGenerateModal,
    generateCourts, setGenerateCourts,
    generateRounds, setGenerateRounds,
    generateMixedRounds, setGenerateMixedRounds,
    generateTargetGroup, setGenerateTargetGroup,
    generateMode, setGenerateMode,
    generateTargetGames, setGenerateTargetGames,
    generateStrategy, setGenerateStrategy,
    aiRecommendMsg,
    showMixedSuggestion,
    suggestedMixedRounds,
    showSimpleView, setShowSimpleView,
    showMondayModal, setShowMondayModal,
    mondayBasePlayer, setMondayBasePlayer,
    mondayR1Selection, setMondayR1Selection,
    mondayCompanion, setMondayCompanion,
    mondayRounds, setMondayRounds,
    showFixedPairModal, setShowFixedPairModal,
    fixedPairSelection, setFixedPairSelection,
    fixedPairCourts, setFixedPairCourts,
    fixedPairRounds, setFixedPairRounds,
    showManualMode, setShowManualMode,
    manualStep, setManualStep,
    manualRounds, setManualRounds,
    manualCourts, setManualCourts,
    manualActiveRound, setManualActiveRound,
    manualSlots, setManualSlots,
    generateCrossGroup, setGenerateCrossGroup,
    crossGroupPairs, setCrossGroupPairs,
    useArrivalFirstRound, setUseArrivalFirstRound,
    handleGenerateClick, doGenerate, handleGenerate,
    handleAiRecommend, handleMonthlyGenerate, handleMondayClick, handleMondayGenerate,
    handleFixedPairGenerate, handleManualTogglePlayer, handleManualSave,
  } = generateModal;

  // ── Early returns (React Rules: 훅 호출 이후에 위치) ─────────────────────
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;
  if (!session) return <div className="text-center py-16 text-slate-500">경기를 찾을 수 없습니다.</div>;

  // ── 파생 값 ───────────────────────────────────────────────────────────────
  const votingOpen = isVotingOpen(session.votingDeadline);
  const canVote = votingOpen || isAdminUser;
  const attendingIds = new Set(attendance.filter(a => a.attending).map(a => a.playerId));
  const activeMembers = members.filter(m => m.isActive);
  const maleAttending = attendingPlayers.filter(p => p.gender === 'male').length;
  const femaleAttending = attendingPlayers.filter(p => p.gender === 'female').length;

  const myMember = appUser ? activeMembers.find(m => m.name === appUser.username) ?? null : null;
  const myAttendanceRec = myMember ? attendance.find(a => a.playerId === myMember.id) ?? null : null;
  const myAttendance = myAttendanceRec?.attending ?? null;
  const myIsLate = myAttendanceRec?.isLate;

  const canVoteForMember = (memberId: string) => {
    if (!canVote) return false;
    if (isAdminUser) return true;
    return myMember?.id === memberId;
  };

  // ── Voting 핸들러 ─────────────────────────────────────────────────────────
  const handleMemberVote = async (member: Member, attending: boolean) => {
    if (!canVote) return;
    const rec = attendance.find(a => a.playerId === member.id);
    // 같은 버튼 재클릭 → 투표 취소 (미응답 상태로 되돌림)
    if (rec?.attending === attending) {
      await deleteAttendance(session.id, member.id, isAdminUser);
      load();
      return;
    }
    await setAttendance({
      sessionId: session.id,
      playerId: member.id,
      playerType: 'member',
      playerName: member.name,
      gender: member.gender,
      ntrp: member.ntrp,
      attending,
      ...(session.trackLate && attending ? { isLate: false } : {}),
    }, isAdminUser);
    load();
  };

  const handleMemberLate = async (member: Member, isLate: boolean) => {
    if (!canVote) return;
    const rec = attendance.find(a => a.playerId === member.id);
    if (!rec || !rec.attending) return;
    await setAttendance({
      sessionId: session.id, playerId: member.id, playerType: 'member',
      playerName: member.name, gender: member.gender, ntrp: member.ntrp,
      attending: true, isLate,
    }, isAdminUser);
    load();
  };

  const handleGuestLate = async (guest: Guest, isLate: boolean) => {
    if (!isAdminUser) return;
    const rec = attendance.find(a => a.playerId === guest.id);
    if (!rec || !rec.attending) return;
    await setAttendance({
      sessionId: session.id, playerId: guest.id, playerType: 'guest',
      playerName: guest.name, gender: guest.gender, ntrp: guest.ntrp,
      attending: true, isLate,
    }, isAdminUser);
    load();
  };

  // 도착 순위 설정 (관리자 전용)
  // order === null 이면 해당 선수 순위 삭제 후 이후 순위를 1씩 당김 (cascade)
  const handleArrivalOrder = async (playerId: string, _playerType: 'member' | 'guest', order: number | null) => {
    if (!isAdminUser) return;
    const rec = attendance.find(a => a.playerId === playerId);
    if (!rec || !rec.attending) return;

    if (order === null) {
      const currentRank = rec.arrivalOrder;
      // 먼저 해당 선수 순위 초기화
      await setArrivalOrder(session.id, playerId, null);
      // 삭제된 순위보다 높은 순위의 선수들 순위를 1씩 당김
      if (currentRank != null) {
        const toDecrement = attendance.filter(
          a => a.attending && a.arrivalOrder != null && a.arrivalOrder > currentRank && a.playerId !== playerId
        );
        await Promise.all(toDecrement.map(a => setArrivalOrder(session.id, a.playerId, a.arrivalOrder! - 1)));
      }
    } else {
      await setArrivalOrder(session.id, playerId, order);
    }
    load();
  };

  // 도착 순위 위아래 교환 (관리자 전용)
  const handleSwapArrival = async (playerId: string, _playerType: 'member' | 'guest', direction: 'up' | 'down') => {
    if (!isAdminUser) return;
    const rec = attendance.find(a => a.playerId === playerId);
    if (!rec || !rec.attending || rec.arrivalOrder == null) return;

    const currentRank = rec.arrivalOrder;
    const targetRank = direction === 'up' ? currentRank - 1 : currentRank + 1;
    const swapRec = attendance.find(a => a.attending && a.arrivalOrder === targetRank);
    if (!swapRec) return; // 교환할 대상 없음 (경계)

    // 두 선수의 순위 교환
    await setArrivalOrder(session.id, playerId, targetRank);
    await setArrivalOrder(session.id, swapRec.playerId, currentRank);
    load();
  };

  // ── Bracket 핸들러 ────────────────────────────────────────────────────────
  const handleScoreUpdate = async (matchId: string, score1: string, score2: string) => {
    await updateMatchScore(matchId, score1, score2);
    load();
  };

  const handleResetBracket = async () => {
    if (!confirm('모든 대진표를 초기화하시겠습니까?\n입력된 스코어도 모두 삭제됩니다.')) return;
    await saveMatches(session.id, []);
    await updateSession(session.id, { isGenerated: false });
    load();
  };

  const handleSyncBracket = async () => {
    if (removedFromBracket.length > 0) {
      const removedSet = new Set(removedFromBracket.map(p => p.id));
      const toDelete = matches.filter(m =>
        removedSet.has(m.team1.player1.id) || removedSet.has(m.team1.player2.id) ||
        removedSet.has(m.team2.player1.id) || removedSet.has(m.team2.player2.id)
      );
      await Promise.all(toDelete.map(m => deleteMatch(m.id)));
    }
    load();
  };

  const loadGroups = async () => {
    if (!id) return;
    const g = await getSessionGroups(id);
    setGroups(g);
  };

  // ── 조 편성 맵 + 조간 대진 쌍 ────────────────────────────────────────────
  const playerGroupMap = new Map<string, string>();
  for (const g of groups) {
    for (const memberId of g.memberIds) playerGroupMap.set(memberId, g.id);
  }

  // ── 대진표 vs 참석 불일치 감지 ───────────────────────────────────────────
  const bracketPlayerIds = new Set(
    matches.flatMap(m => [m.team1.player1.id, m.team1.player2.id, m.team2.player1.id, m.team2.player2.id])
  );
  const attendingIdSet = new Set(attendingPlayers.map(p => p.id));
  const removedFromBracket = session.isGenerated
    ? matches.flatMap(m => [m.team1.player1, m.team1.player2, m.team2.player1, m.team2.player2])
        .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i && !attendingIdSet.has(p.id))
    : [];
  const addedToBracket = session.isGenerated
    ? attendingPlayers.filter(p => !bracketPlayerIds.has(p.id))
    : [];

  // ── 선수별 경기 번호 계산 ─────────────────────────────────────────────────
  const displaySource = pendingMatches.length > 0 ? pendingMatches : matches;
  const matchGameNumbers = new Map<string, number>();
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
      {/* ── 헤더 ─────────────────────────────────────────────────────────── */}
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
              {isAdminUser ? (
                <select
                  value={session.type}
                  onChange={async (e) => {
                    const newType = e.target.value as 'weekly' | 'quarterly';
                    await updateSession(session.id, {
                      type: newType,
                      mixedRounds: newType === 'quarterly' ? 0 : session.mixedRounds,
                    });
                    setSession(prev => prev ? {
                      ...prev,
                      type: newType,
                      mixedRounds: newType === 'quarterly' ? 0 : prev.mixedRounds,
                    } : prev);
                  }}
                  className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-medium border-0 cursor-pointer appearance-none ${
                    session.type === 'quarterly' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                  }`}
                >
                  <option value="weekly">주간 경기</option>
                  <option value="quarterly">🏆 분기대회</option>
                </select>
              ) : (
                <span className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-medium ${
                  session.type === 'quarterly' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                }`}>
                  {session.type === 'quarterly' ? '🏆 분기대회' : '주간 경기'}
                </span>
              )}
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

      {/* ── 탭 ───────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-2xl overflow-x-auto">
        <button
          onClick={() => changeTab('vote')}
          className={`flex-1 flex-shrink-0 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
            tab === 'vote' ? 'text-green-600 border-b-2 border-green-600 bg-green-50' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="sm:hidden">투표</span><span className="hidden sm:inline">참석 투표</span>
        </button>
        {session.gameMode === 'group' && isAdminUser && (
          <button
            onClick={() => changeTab('groups')}
            className={`flex-1 flex-shrink-0 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              tab === 'groups' ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            조 편성
          </button>
        )}
        <button
          onClick={() => changeTab('bracket')}
          className={`flex-1 flex-shrink-0 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
            tab === 'bracket' ? 'text-green-600 border-b-2 border-green-600 bg-green-50' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          대진표 {session.isGenerated ? '✓' : ''}
        </button>
        <button
          onClick={() => changeTab('detail')}
          className={`flex-1 flex-shrink-0 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
            tab === 'detail' ? 'text-green-600 border-b-2 border-green-600 bg-green-50' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="sm:hidden">상세</span><span className="hidden sm:inline">참석인원상세</span>
        </button>
        {session.isGenerated && matches.some(m => m.isCompleted) && (
          <button
            onClick={() => changeTab('result')}
            className={`flex-1 flex-shrink-0 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              tab === 'result' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            결과 🏆
          </button>
        )}
      </div>

      {/* ── 참석 투표 탭 ─────────────────────────────────────────────────── */}
      {tab === 'vote' && (
        <VoteTab
          session={session}
          activeMembers={activeMembers}
          guests={guests}
          attendance={attendance}
          isAdminUser={isAdminUser}
          user={user}
          appUser={appUser}
          canVote={canVote}
          votingOpen={votingOpen}
          myMember={myMember}
          myAttendance={myAttendance}
          myIsLate={myIsLate}
          canVoteForMember={canVoteForMember}
          showGuestForm={showGuestForm}
          guestName={guestName}
          guestGender={guestGender}
          guestNtrp={guestNtrp}
          editingGuestId={editingGuestId}
          editGuestName={editGuestName}
          editGuestGender={editGuestGender}
          editGuestNtrp={editGuestNtrp}
          setShowGuestForm={setShowGuestForm}
          setGuestName={setGuestName}
          setGuestGender={setGuestGender}
          setGuestNtrp={setGuestNtrp}
          setEditingGuestId={setEditingGuestId}
          setEditGuestName={setEditGuestName}
          setEditGuestGender={setEditGuestGender}
          setEditGuestNtrp={setEditGuestNtrp}
          handleAddGuest={handleAddGuest}
          handleRemoveGuest={handleRemoveGuest}
          handleStartEditGuest={handleStartEditGuest}
          handleSaveEditGuest={handleSaveEditGuest}
          handleMemberVote={handleMemberVote}
          handleMemberLate={handleMemberLate}
          handleGuestLate={handleGuestLate}
          handleArrivalOrder={handleArrivalOrder}
          handleSwapArrival={handleSwapArrival}
        />
      )}

      {/* ── 조 편성 탭 ───────────────────────────────────────────────────── */}
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

      {/* ── 대진표 탭 ────────────────────────────────────────────────────── */}
      {tab === 'bracket' && (
        <BracketTab
          session={session}
          matches={matches}
          attendingPlayers={attendingPlayers}
          groups={groups}
          selectedGroupId={selectedGroupId}
          setSelectedGroupId={setSelectedGroupId}
          pendingMatches={pendingMatches}
          pendingRoundsCount={pendingRoundsCount}
          matchGameNumbers={matchGameNumbers}
          isAdminUser={isAdminUser}
          user={user}
          editMode={editMode}
          saving={saving}
          canUndo={canUndo}
          playerGroupMap={playerGroupMap}
          removedFromBracket={removedFromBracket}
          addedToBracket={addedToBracket}
          substituteTarget={substituteTarget}
          dragMatchId={dragMatchId}
          dragOverMatchId={dragOverMatchId}
          dragOverEmptyRound={dragOverEmptyRound}
          dragRound={dragRound}
          dragOverRound={dragOverRound}
          setDragMatchId={setDragMatchId}
          setDragOverMatchId={setDragOverMatchId}
          setDragOverEmptyRound={setDragOverEmptyRound}
          setDragRound={setDragRound}
          setDragOverRound={setDragOverRound}
          onScoreUpdate={handleScoreUpdate}
          onResetBracket={handleResetBracket}
          onSyncBracket={handleSyncBracket}
          onRoundCountChange={handleRoundCountChange}
          onUndo={handleUndo}
          onShowModeModal={() => setShowModeModal(true)}
          onShareLink={() => {
            const url = window.location.origin + '/c/' + session.clubId + '/' + session.id;
            navigator.clipboard.writeText(url)
              .then(() => alert('링크가 복사되었습니다'))
              .catch(() => alert('링크가 복사되었습니다'));
          }}
          onSimpleView={() => setShowSimpleView(true)}
          onAutoFillRound={handleAutoFillRound}
          onDeleteMatch={handleDeleteMatch}
          onDeleteRound={handleDeleteRound}
          onAddMatch={handleAddMatch}
          onMatchTypeChange={handleMatchTypeChange}
          onDragDrop={handleDragDrop}
          onDragToEmptyRound={handleDragToEmptyRound}
          onRoundDrop={handleRoundDrop}
          onRoundSwap={handleRoundSwap}
          onPlayerDragStart={editMode ? handlePlayerDragStart : undefined}
          onPlayerDrop={editMode ? handlePlayerDrop : undefined}
          onBenchDragStart={editMode ? handleBenchDragStart : undefined}
          onPlayerClick={handlePlayerClick}
          onSetDragOver={setDragOverMatchId}
          onTouchDropToRound={handleDragToEmptyRound}
        />
      )}

      {/* ── 참석인원 상세 탭 ─────────────────────────────────────────────── */}
      {tab === 'detail' && (
        <PlayerDetailTab
          attendingPlayers={attendingPlayers}
          matches={matches}
          showNtrp={isAdminUser}
          showGuests={showDetailGuests}
          setShowGuests={setShowDetailGuests}
        />
      )}

      {/* ── 결과 탭 ──────────────────────────────────────────────────────── */}
      {tab === 'result' && (
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

      {/* ── 모달: 대진표 생성 모드 선택 ─────────────────────────────────── */}
      {showModeModal && (
        <GenerateModeModal
          isSuperAdmin={isSuperAdmin}
          currentClubName={currentClub?.name}
          gameMode={session.gameMode}
          arrivalOrderCount={attendance.filter(a => a.attending && a.arrivalOrder != null).length}
          useArrivalFirstRound={useArrivalFirstRound}
          setUseArrivalFirstRound={setUseArrivalFirstRound}
          onClose={() => setShowModeModal(false)}
          onSelectNormal={() => { setShowModeModal(false); handleGenerateClick(); }}
          onSelectMonthly={() => { handleMonthlyGenerate(); }}
          onSelectFixedPair={() => {
            setShowModeModal(false);
            setFixedPairSelection([]);
            setFixedPairCourts(session.courts);
            setFixedPairRounds(session.rounds);
            setShowFixedPairModal(true);
          }}
          onSelectMonday={() => { setShowModeModal(false); handleMondayClick(); }}
          onSelectManual={() => {
            setShowModeModal(false);
            setShowManualMode(true);
            setManualStep('setup');
            setManualRounds(session.rounds);
            setManualCourts(session.courts);
            setManualActiveRound(1);
            setManualSlots({});
          }}
        />
      )}

      {/* ── 모달: 대회연습모드 ───────────────────────────────────────────── */}
      {showFixedPairModal && (
        <FixedPairModal
          attendingPlayers={attendingPlayers}
          fixedPairSelection={fixedPairSelection}
          fixedPairCourts={fixedPairCourts}
          fixedPairRounds={fixedPairRounds}
          setFixedPairSelection={setFixedPairSelection}
          setFixedPairCourts={setFixedPairCourts}
          setFixedPairRounds={setFixedPairRounds}
          onClose={() => setShowFixedPairModal(false)}
          onGenerate={handleFixedPairGenerate}
        />
      )}

      {/* ── 모달: 월요일 편성 ────────────────────────────────────────────── */}
      {showMondayModal && (
        <MondayScheduleModal
          attendingPlayers={attendingPlayers}
          mondayBasePlayer={mondayBasePlayer}
          mondayR1Selection={mondayR1Selection}
          mondayCompanion={mondayCompanion}
          mondayRounds={mondayRounds}
          setMondayBasePlayer={setMondayBasePlayer}
          setMondayR1Selection={setMondayR1Selection}
          setMondayCompanion={setMondayCompanion}
          setMondayRounds={setMondayRounds}
          onClose={() => setShowMondayModal(false)}
          onGenerate={handleMondayGenerate}
        />
      )}

      {/* ── 모달: 선수 교체 ─────────────────────────────────────────────── */}
      {substituteTarget && (
        <SubstituteModal
          substituteTarget={substituteTarget}
          attendingPlayers={attendingPlayers}
          pendingMatches={pendingMatches}
          onSubstitute={handleSubstitute}
          onClose={() => setSubstituteTarget(null)}
        />
      )}

      {/* ── 모달: 간소화 보기 ────────────────────────────────────────────── */}
      {showSimpleView && (
        <SimpleViewModal
          session={session}
          matches={matches}
          groups={groups}
          onClose={() => setShowSimpleView(false)}
        />
      )}

      {/* ── 모달: 대진표 생성 설정 ──────────────────────────────────────── */}
      {showGenerateModal && (
        <GenerateSettingsModal
          session={session}
          attendingPlayers={attendingPlayers}
          groups={groups}
          maleAttending={maleAttending}
          femaleAttending={femaleAttending}
          generateCourts={generateCourts}
          generateRounds={generateRounds}
          generateMixedRounds={generateMixedRounds}
          generateMode={generateMode}
          generateTargetGames={generateTargetGames}
          generateStrategy={generateStrategy}
          generateTargetGroup={generateTargetGroup}
          generateCrossGroup={generateCrossGroup}
          crossGroupPairs={crossGroupPairs}
          aiRecommendMsg={aiRecommendMsg}
          setGenerateCourts={setGenerateCourts}
          setGenerateRounds={setGenerateRounds}
          setGenerateMixedRounds={setGenerateMixedRounds}
          setGenerateMode={setGenerateMode}
          setGenerateTargetGames={setGenerateTargetGames}
          setGenerateStrategy={setGenerateStrategy}
          setGenerateTargetGroup={setGenerateTargetGroup}
          setGenerateCrossGroup={setGenerateCrossGroup}
          setCrossGroupPairs={setCrossGroupPairs}
          handleAiRecommend={handleAiRecommend}
          onClose={() => setShowGenerateModal(false)}
          onGenerate={handleGenerate}
        />
      )}

      {/* ── 모달: 혼복 라운드 균형 제안 ─────────────────────────────────── */}
      {showMixedSuggestion && (
        <MixedSuggestionModal
          maleCount={maleAttending}
          femaleCount={femaleAttending}
          generateCourts={generateCourts}
          generateRounds={generateRounds}
          generateMixedRounds={generateMixedRounds}
          suggestedMixedRounds={suggestedMixedRounds}
          onKeepCurrent={() => doGenerate(generateMixedRounds)}
          onApplySuggestion={() => doGenerate(suggestedMixedRounds, true)}
        />
      )}

      {/* ── 모달: 수기 입력 ─────────────────────────────────────────────── */}
      {showManualMode && (
        <ManualBracketModal
          attendingPlayers={attendingPlayers}
          manualStep={manualStep}
          manualRounds={manualRounds}
          manualCourts={manualCourts}
          manualActiveRound={manualActiveRound}
          manualSlots={manualSlots}
          setManualStep={setManualStep}
          setManualRounds={setManualRounds}
          setManualCourts={setManualCourts}
          setManualActiveRound={setManualActiveRound}
          onTogglePlayer={handleManualTogglePlayer}
          onClose={() => setShowManualMode(false)}
          onSave={handleManualSave}
        />
      )}

    </div>
  );
}
