import { useEffect, useState, useCallback, useRef } from 'react';
import { toPng } from 'html-to-image';
import { useParams } from 'react-router-dom';
import {
  getSession, getMembers, getGuests, getAttendance,
  setAttendance,
  getMatches, updateMatchScore, updateSession, updateMatch, confirmSession,
  getSessionGroups, deleteMatch, unconfirmSession, saveMatches,
} from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { useClub } from '../contexts/ClubContext';
import { calcOptimalGroupRounds, isVotingOpen, NTRP_OPTIONS, calculateExpectedGames } from '../utils/matchmaking';
import type { Session, Member, Guest, AttendanceRecord, Match, Player, Gender, SessionGroup, MatchType } from '../types';
import { useBracketEdit } from '../hooks/useBracketEdit';
import { useGenerateModal } from '../hooks/useGenerateModal';
import { useGuestForm } from '../hooks/useGuestForm';
import { formatDate } from '../utils/formatting';
import { LoadingState, ErrorState } from '../components/ui/PageState';
import { RoundCard } from '../components/session/RoundCard';
import { PlayerDetailTab } from '../components/session/PlayerDetailTab';
import { SessionResultTab } from '../components/session/SessionResultTab';
import { GroupResultTab } from '../components/session/GroupResultTab';
import { GroupsTab } from '../components/session/GroupsTab';

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
  const [sharingImage, setSharingImage] = useState(false);

  // 간소화 보기 캡처용 ref
  const simpleViewCardRef = useRef<HTMLDivElement>(null);

  // Team setup modal (소규모 — 페이지에 유지)
  const [showTeamSetup, setShowTeamSetup] = useState(false);
  const [teamSetupItems, setTeamSetupItems] = useState<{
    matchId: string;
    round: number;
    court: number;
    matchType: MatchType;
    players: Player[];
    rotation: number;
  }[]>([]);

  // ── 훅 호출 전 파생 값 ─────────────────────────────────────────────────────
  // (hooks에 attendingPlayers를 전달해야 하므로 early return 앞에서 계산)
  // 이름은 members 최신 정보 우선 사용 → 멤버 이름 수정 후 즉시 대진표에 반영
  const attendingPlayers: Player[] = attendance
    .filter(a => a.attending)
    .map(a => {
      const member = a.playerType === 'member' ? members.find(m => m.id === a.playerId) : undefined;
      return { id: a.playerId, name: member?.name ?? a.playerName, gender: a.gender, ntrp: a.ntrp, type: a.playerType };
    });

  // 탭 변경 + sessionStorage 저장 (탭 전환 후 복귀 시 복원용)
  const changeTab = (t: 'vote' | 'groups' | 'bracket' | 'detail' | 'result') => {
    if (id) sessionStorage.setItem(`sdp_tab_${id}`, t);
    setTab(t);
  };

  // 데이터 로드 함수 — 훅에 전달하므로 훅 호출 전에 정의 (React Rules: hooks before early returns)
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

  // auth 초기화 완료 후에만 데이터 로드 (새로고침 시 세션 미초기화 상태에서 쿼리 실행 방지)
  useEffect(() => { if (!authLoading) load(); }, [load, authLoading]);

  // 조별경기: 그룹 로드 후 내 그룹 자동 선택
  // 단, 조간 대진만 있는 경우(groupId=null인 경기가 전부)에는 전체(null) 유지
  useEffect(() => {
    if (groups.length > 0 && selectedGroupId === null && session?.gameMode === 'group') {
      const hasCrossOnly = matches.length > 0 && matches.every(m => !m.groupId);
      if (hasCrossOnly) return; // 조간 대진만 있으면 전체(null) 유지 → 바로 보임
      const myMemberInEffect = appUser ? members.filter(m => m.isActive).find(m => m.name === appUser.username) ?? null : null;
      const myGroupInEffect = myMemberInEffect ? groups.find(g => g.memberIds.includes(myMemberInEffect.id)) ?? null : null;
      setSelectedGroupId(myGroupInEffect?.id ?? groups[0]?.id ?? null);
    }
  }, [groups, matches, session?.gameMode]);

  // ── 커스텀 훅 (React Rules of Hooks: early return 앞에 위치) ───────────────
  // 브라켓 편집: editMode, drag, pendingMatches 등 13개 상태 + 핸들러
  const bracketEdit = useBracketEdit({ matches, session, attendingPlayers, load });

  // 게스트 폼: showGuestForm, guestName 등 8개 상태 + 핸들러
  const guestForm = useGuestForm({ session, matches, isAdminUser, load });

  // 대진표 생성 모달: showGenerateModal 등 27개 상태 + 핸들러
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
  });

  // 훅 반환값 구조분해 (JSX에서 직접 사용)
  const {
    pendingMatches, pendingRoundsCount, substituteTarget, saving,
    dragMatchId, dragOverMatchId, dragOverEmptyRound,
    dragRound, dragOverRound,
    canUndo,
    setDragMatchId, setDragOverMatchId, setDragOverEmptyRound, setDragRound, setDragOverRound,
    setSubstituteTarget,
    handleEditCancel, handleRoundCountChange, handleEditSave,
    handleAutoFillRound, handleDeleteMatch, handleDeleteRound,
    handleAddMatch, handleMatchTypeChange, handleUndo,
    handleDragDrop, handleDragToEmptyRound, handleRoundDrop,
    handlePlayerDragStart, handlePlayerDrop, handleBenchDragStart,
    handlePlayerClick, handleSubstitute,
  } = bracketEdit;

  // 관리자는 항상 편집 가능 — 별도 편집 모드 토글 불필요
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
    handleGenerateClick, doGenerate, handleGenerate, handleGenerateGroupMatches,
    handleGenerateCrossGroupMatches,
    handleAiRecommend, handleMondayClick, handleMondayGenerate,
    handleFixedPairGenerate, handleManualTogglePlayer, handleManualSave,
  } = generateModal;

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;
  if (!session) return <div className="text-center py-16 text-slate-500">경기를 찾을 수 없습니다.</div>;

  const votingOpen = isVotingOpen(session.votingDeadline);
  const canVote = votingOpen || isAdminUser;
  const attendingIds = new Set(attendance.filter(a => a.attending).map(a => a.playerId));

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
    }, isAdminUser);
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
    }, isAdminUser);
    load();
  };

  const handleGuestLate = async (guest: Guest, isLate: boolean) => {
    if (!isAdminUser) return;
    const rec = attendance.find(a => a.playerId === guest.id);
    if (!rec || !rec.attending) return;
    await setAttendance({
      sessionId: session.id,
      playerId: guest.id,
      playerType: 'guest',
      playerName: guest.name,
      gender: guest.gender,
      ntrp: guest.ntrp,
      attending: true,
      isLate,
    }, isAdminUser);
    load();
  };

  const handleScoreUpdate = async (matchId: string, score1: string, score2: string) => {
    await updateMatchScore(matchId, score1, score2);
    load();
  };

  const handleConfirm = async () => {
    if (!confirm('대진표를 확정하시겠습니까? 확정 후에는 스코어를 수정할 수 없습니다.')) return;
    await confirmSession(session!.id);
    load();
    changeTab('result');
  };

  const handleResetBracket = async () => {
    if (!confirm('모든 대진표를 초기화하시겠습니까?\n입력된 스코어도 모두 삭제됩니다.')) return;
    await saveMatches(session!.id, []); // 전체 매치 삭제
    await updateSession(session!.id, { isGenerated: false });
    load();
  };

  // --- Bracket Editing handlers → useBracketEdit hook ---





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

  // --- Team Setup ---
  const getTeamRotations = (players: Player[], matchType: MatchType) => {
    const valid = players.filter((p): p is Player => !!p);
    if (valid.length < 4) {
      const padded = [...valid];
      while (padded.length < 4) padded.push(valid[padded.length % Math.max(valid.length, 1)]);
      return [{ team1: [padded[0], padded[1]] as Player[], team2: [padded[2], padded[3]] as Player[] }];
    }
    if (matchType === 'mixed') {
      const males = valid.filter(p => p.gender === 'male');
      const females = valid.filter(p => p.gender === 'female');
      if (males.length >= 2 && females.length >= 2) {
        return [
          { team1: [males[0], females[0]] as Player[], team2: [males[1], females[1]] as Player[] },
          { team1: [males[0], females[1]] as Player[], team2: [males[1], females[0]] as Player[] },
        ];
      }
    }
    return [
      { team1: [valid[0], valid[1]] as Player[], team2: [valid[2], valid[3]] as Player[] },
      { team1: [valid[0], valid[2]] as Player[], team2: [valid[1], valid[3]] as Player[] },
      { team1: [valid[0], valid[3]] as Player[], team2: [valid[1], valid[2]] as Player[] },
    ];
  };

  const handleTeamSetupSave = async () => {
    for (const item of teamSetupItems) {
      const rotations = getTeamRotations(item.players, item.matchType);
      const { team1, team2 } = rotations[item.rotation % rotations.length];
      await updateMatch(item.matchId, {
        team1: { player1: team1[0], player2: team1[1] },
        team2: { player1: team2[0], player2: team2[1] },
      });
    }
    setShowTeamSetup(false);
    load();
    changeTab('bracket');
  };

  const loadGroups = async () => {
    if (!id) return;
    const g = await getSessionGroups(id);
    setGroups(g);
  };

  // 조간 대진 쌍 감지: playerId → groupId 역매핑 + 실존하는 cross 쌍 목록 (bracket 탭 필터용)
  const playerGroupMap = new Map<string, string>();
  for (const g of groups) {
    for (const memberId of g.memberIds) playerGroupMap.set(memberId, g.id);
  }
  const crossPairKeysSet = new Set<string>();
  for (const m of matches) {
    if (m.groupId) continue; // 조 내부 경기 제외
    const gA = playerGroupMap.get(m.team1.player1.id);
    const gB = playerGroupMap.get(m.team2.player1.id);
    if (gA && gB) crossPairKeysSet.add([gA, gB].sort().join('|'));
  }
  const crossPairKeys = [...crossPairKeysSet].sort();

  // 선수별 경기 번호 계산 (몇 번째 경기인지)
  // pendingMatches가 있으면 편집 중인 값, 없으면 저장된 matches 표시 (저장 직후 깜빡임 방지)
  const displaySource = pendingMatches.length > 0 ? pendingMatches : matches;
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
                    session.type === 'quarterly'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-green-100 text-green-700'
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

      {/* Tabs */}
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
                      <div className="flex items-center gap-2">
                        {/* 게스트 지각 토글 (trackLate 활성화 시 관리자만) */}
                        {session.trackLate && isAdminUser && (() => {
                          const rec = attendance.find(a => a.playerId === g.id);
                          const attending = rec?.attending ?? false;
                          return attending ? (
                            <button
                              onClick={() => handleGuestLate(g, !(rec?.isLate ?? false))}
                              className={`w-10 py-1 rounded text-xs font-medium text-center transition-colors ${
                                rec?.isLate
                                  ? 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                                  : 'bg-green-50 text-green-600 hover:bg-green-100'
                              }`}
                            >
                              {rec?.isLate ? '지각' : '정시'}
                            </button>
                          ) : null;
                        })()}
                        {isAdminUser && (
                          <>
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
                          </>
                        )}
                      </div>
                    </div>
                  )
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 대진표 생성 모드 선택 모달 */}
      {showModeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">대진표 생성 모드 선택</h3>
              <p className="text-xs text-slate-500 mt-1">원하는 방식을 선택하세요.</p>
            </div>
            <div className="p-3 space-y-2">
              {/* 일반 대진표 */}
              <button
                onClick={() => { setShowModeModal(false); handleGenerateClick(); }}
                className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-green-400 hover:bg-green-50 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">🟢</span>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm group-hover:text-green-700">일반 대진표 생성</p>
                    <p className="text-xs text-slate-400 mt-0.5">NTRP 기반 자동 배정, 혼복 설정 가능</p>
                  </div>
                </div>
              </button>

              {/* 대회연습모드 */}
              <button
                onClick={() => {
                  setShowModeModal(false);
                  setFixedPairSelection([]);
                  setFixedPairCourts(session.courts);
                  setFixedPairRounds(session.rounds);
                  setShowFixedPairModal(true);
                }}
                className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-purple-400 hover:bg-purple-50 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">🟣</span>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm group-hover:text-purple-700">대회연습모드</p>
                    <p className="text-xs text-slate-400 mt-0.5">고정 페어가 항상 같은 팀 — 나머지 균등 배정</p>
                  </div>
                </div>
              </button>

              {/* 월요일 편성 (superadmin + 비일요일 클럽) */}
              {isSuperAdmin && !currentClub?.name?.includes('일요일') && (
                <button
                  onClick={() => { setShowModeModal(false); handleMondayClick(); }}
                  className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🔵</span>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm group-hover:text-indigo-700">월요일 편성</p>
                      <p className="text-xs text-slate-400 mt-0.5">6인 고정 패턴 (기준 선수 + 파트너)</p>
                    </div>
                  </div>
                </button>
              )}

              {/* 수기 입력 */}
              <button
                onClick={() => {
                  setShowModeModal(false);
                  setShowManualMode(true);
                  setManualStep('setup');
                  setManualRounds(session.rounds);
                  setManualCourts(session.courts);
                  setManualActiveRound(1);
                  setManualSlots({});
                }}
                className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-orange-400 hover:bg-orange-50 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">🟠</span>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm group-hover:text-orange-700">수기 입력</p>
                    <p className="text-xs text-slate-400 mt-0.5">직접 경기 배치</p>
                  </div>
                </div>
              </button>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
              <button onClick={() => setShowModeModal(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 대회연습모드 모달 */}
      {showFixedPairModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs overflow-y-auto max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">대회연습모드</h3>
              <p className="text-xs text-slate-500 mt-1">고정 페어 2명을 선택하세요. 두 선수는 항상 같은 팀으로 출전합니다.</p>
            </div>

            {/* 고정 페어 선수 선택 */}
            <div className="px-5 pt-4 pb-2">
              <p className="text-xs font-semibold text-slate-500 mb-2">
                고정 페어 선택 <span className="text-purple-500">({fixedPairSelection.length}/2 선택)</span>
              </p>
              {attendingPlayers.map(p => {
                const selected = fixedPairSelection.includes(p.id);
                return (
                  <label key={p.id}
                    className="flex items-center gap-3 p-2.5 rounded-xl border mb-1 cursor-pointer hover:bg-slate-50 transition-colors"
                    style={{ borderColor: selected ? '#7c3aed' : '#e2e8f0', backgroundColor: selected ? '#f5f3ff' : '' }}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => {
                        setFixedPairSelection(prev =>
                          prev.includes(p.id)
                            ? prev.filter(x => x !== p.id)
                            : prev.length < 2 ? [...prev, p.id] : prev
                        );
                      }}
                      disabled={!selected && fixedPairSelection.length >= 2}
                      className="accent-purple-600"
                    />
                    <span className={`w-2 h-2 rounded-full ${p.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                    <span className={`font-medium ${selected ? 'text-purple-800' : 'text-slate-800'}`}>{p.name}</span>
                    <span className="ml-auto text-xs text-slate-400 font-mono">{p.ntrp.toFixed(1)}</span>
                  </label>
                );
              })}
            </div>

            {/* 코트 수 / 라운드 수 */}
            <div className="px-5 pb-3 pt-2 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">코트 수</p>
                <div className="flex items-center gap-1 border border-slate-300 rounded-lg overflow-hidden">
                  <button onClick={() => setFixedPairCourts(c => Math.max(1, c - 1))} className="px-2.5 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors">−</button>
                  <span className="flex-1 text-center text-sm font-medium text-slate-700">{fixedPairCourts}</span>
                  <button onClick={() => setFixedPairCourts(c => Math.min(6, c + 1))} className="px-2.5 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors">+</button>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">라운드 수</p>
                <div className="flex items-center gap-1 border border-slate-300 rounded-lg overflow-hidden">
                  <button onClick={() => setFixedPairRounds(r => Math.max(1, r - 1))} className="px-2.5 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors">−</button>
                  <span className="flex-1 text-center text-sm font-medium text-slate-700">{fixedPairRounds}</span>
                  <button onClick={() => setFixedPairRounds(r => Math.min(20, r + 1))} className="px-2.5 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors">+</button>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex gap-2 justify-end">
              <button onClick={() => setShowFixedPairModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">취소</button>
              <button
                onClick={handleFixedPairGenerate}
                disabled={fixedPairSelection.length !== 2}
                className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 font-medium disabled:opacity-40"
              >
                편성 생성
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Monday Schedule Modal */}
      {showMondayModal && (() => {
        const malePlayers = attendingPlayers.filter(p => p.gender === 'male');
        const basePlayer = malePlayers.find(p => p.id === mondayBasePlayer);
        const othersForR1 = malePlayers.filter(p => p.id !== mondayBasePlayer);
        const toggleR1 = (pid: string) => {
          setMondayR1Selection(prev =>
            prev.includes(pid) ? prev.filter(x => x !== pid) : prev.length < 3 ? [...prev, pid] : prev
          );
          setMondayCompanion(prev => prev === pid ? '' : prev);
        };
        const selectBase = (pid: string) => {
          // 기준 선수 변경 시 R1 선택 초기화
          setMondayBasePlayer(pid);
          setMondayR1Selection([]);
          setMondayCompanion('');
        };
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs overflow-y-auto max-h-[90vh]">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800">월요일 편성</h3>
                <p className="text-xs text-slate-500 mt-1">기준 선수를 선택하고, 첫 경기 추가 선수 3명과 파트너를 지정하세요.</p>
              </div>

              {/* Step 0: 기준 선수(Y) 선택 */}
              <div className="px-5 pt-4 pb-2">
                <p className="text-xs font-semibold text-slate-500 mb-2">
                  1단계 — 기준 선수 선택 <span className="text-xs font-normal text-slate-400">(항상 파트너와 함께 출전)</span>
                </p>
                {malePlayers.map(p => {
                  const isBase = p.id === mondayBasePlayer;
                  return (
                    <label key={p.id}
                      className="flex items-center gap-3 p-2.5 rounded-xl border mb-1 cursor-pointer hover:bg-slate-50 transition-colors"
                      style={{ borderColor: isBase ? '#6366f1' : '#e2e8f0', backgroundColor: isBase ? '#eef2ff' : '' }}>
                      <input
                        type="radio"
                        name="mondayBase"
                        checked={isBase}
                        onChange={() => selectBase(p.id)}
                        className="accent-indigo-600"
                      />
                      <span className={`font-medium ${isBase ? 'text-indigo-800' : 'text-slate-800'}`}>{p.name}</span>
                      {isBase && <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 rounded">기준</span>}
                      <span className="ml-auto text-xs text-slate-400 font-mono">{p.ntrp.toFixed(1)}</span>
                    </label>
                  );
                })}
              </div>

              {/* Step 1: R1 추가 선수 선택 (기준 선수 제외 5명에서 3명) */}
              <div className="px-5 pt-2 pb-2">
                <p className="text-xs font-semibold text-slate-500 mb-2">
                  2단계 — 첫 경기(R1) 추가 선수 선택 <span className="text-indigo-500">({mondayR1Selection.length}/3 선택)</span>
                </p>
                {basePlayer && (
                  <div className="flex items-center gap-3 p-2.5 rounded-xl border mb-1 bg-indigo-50 border-indigo-200 opacity-50">
                    <input type="checkbox" checked disabled className="accent-indigo-600" />
                    <span className="font-medium text-indigo-800">{basePlayer.name}</span>
                    <span className="text-xs text-indigo-500">기준 (자동 포함)</span>
                    <span className="ml-auto text-xs text-slate-400 font-mono">{basePlayer.ntrp.toFixed(1)}</span>
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
                    3단계 — 파트너 선택 <span className="text-xs font-normal text-slate-400">(기준 선수와 R1·R2·R4·R5 함께 출전)</span>
                  </p>
                  {mondayR1Selection.map(pid => {
                    const p = malePlayers.find(mp => mp.id === pid)!;
                    return (
                      <label key={pid}
                        className="flex items-center gap-3 p-2.5 rounded-xl border mb-1 cursor-pointer hover:bg-slate-50 transition-colors"
                        style={{ borderColor: mondayCompanion === pid ? '#6366f1' : '#e2e8f0', backgroundColor: mondayCompanion === pid ? '#eef2ff' : '' }}>
                        <input
                          type="radio"
                          name="mondayCompanion"
                          checked={mondayCompanion === pid}
                          onChange={() => setMondayCompanion(pid)}
                          className="accent-indigo-600"
                        />
                        <span className="font-medium text-slate-800">{p.name}</span>
                        <span className="ml-auto text-xs text-slate-400 font-mono">{p.ntrp.toFixed(1)}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Step 4: 라운드 수 */}
              <div className="px-5 pb-3 pt-1">
                <p className="text-xs font-semibold text-slate-500 mb-2">4단계 — 라운드 수</p>
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
            {/* 헤더 (캡처 제외) */}
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
                disabled={sharingImage}
                onClick={async () => {
                  if (!simpleViewCardRef.current) return;
                  setSharingImage(true);
                  try {
                    const el = simpleViewCardRef.current;
                    const dataUrl = await toPng(el, {
                      pixelRatio: 2,
                      backgroundColor: '#ffffff',
                      width: el.offsetWidth,
                      height: el.scrollHeight,
                      style: { overflow: 'visible', height: `${el.scrollHeight}px` },
                    });
                    const res = await fetch(dataUrl);
                    const blob = await res.blob();
                    const file = new File([blob], 'bracket.png', { type: 'image/png' });
                    if (navigator.share && navigator.canShare({ files: [file] })) {
                      await navigator.share({ files: [file], title: session.title ?? formatDate(session.date) });
                    } else if (navigator.clipboard?.write) {
                      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                      alert('이미지가 클립보드에 복사되었습니다');
                    } else {
                      const a = document.createElement('a');
                      a.href = dataUrl;
                      a.download = 'bracket.png';
                      a.click();
                    }
                  } catch {
                    alert('이미지 저장에 실패했습니다');
                  } finally {
                    setSharingImage(false);
                  }
                }}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium disabled:opacity-40"
              >
                {sharingImage ? '처리중…' : '이미지 공유'}
              </button>
            </div>

            {/* 경기 목록 — 이미지 캡처 대상 (타이틀 포함) */}
            <div ref={simpleViewCardRef} className="flex-1 overflow-y-auto bg-white">
              {/* 캡처 이미지용 타이틀 바 */}
              <div className="px-3 py-2 text-center bg-white border-b border-slate-100">
                <span className="font-bold text-slate-800 text-sm">{session.title ?? formatDate(session.date)}</span>
              </div>
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
              {/* AI 추천 버튼 */}
              {session.gameMode !== 'group' && (
                <>
                  <button
                    onClick={handleAiRecommend}
                    disabled={attendingPlayers.length === 0}
                    className="w-full py-2 rounded-lg text-sm font-medium bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 disabled:opacity-50 transition-colors"
                  >
                    ✨ 최적 조건 자동 추천
                  </button>
                  {aiRecommendMsg && (
                    <div className="p-2 rounded-lg bg-purple-50 border border-purple-100 text-xs text-purple-700">
                      {aiRecommendMsg}
                    </div>
                  )}
                </>
              )}
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
              {/* 생성 전략 선택 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">생성 전략</label>
                <div className="flex flex-col gap-1.5">
                  {([
                    { value: 'no-repeat-pair' as const, label: '동일 페어 제거 우선', desc: '같은 파트너와 경기 안 하도록 최적화' },
                    { value: 'balanced-rest' as const, label: '연속 경기 제거 우선', desc: '쉰 선수 먼저 투입 (2경기→휴식→2경기 패턴)' },
                    { value: 'random' as const, label: '랜덤 생성', desc: '최적화 없이 무작위 배치' },
                  ]).map(s => (
                    <button
                      key={s.value}
                      onClick={() => setGenerateStrategy(s.value)}
                      className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        generateStrategy === s.value
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <span className="font-medium">{s.label}</span>
                      <span className={`block text-xs mt-0.5 ${generateStrategy === s.value ? 'text-blue-100' : 'text-slate-400'}`}>
                        {s.desc}
                      </span>
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
                        {m === 'rounds' ? '총 라운드 수' : '균등 경기수'}
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
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">인당 최소 경기 수 <span className="font-normal text-slate-400">(일부 +1 가능)</span></label>
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
            {/* 대진 방식: 조 내부 vs 조간 토글 (그룹 모드 + 2개 이상 조) */}
            {session.gameMode === 'group' && groups.length >= 2 && (
              <div className="px-6 pb-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">대진 방식</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setGenerateCrossGroup(false)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${!generateCrossGroup ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    조 내부 대진
                  </button>
                  <button
                    onClick={() => setGenerateCrossGroup(true)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${generateCrossGroup ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    조간 대진
                  </button>
                </div>
              </div>
            )}

            {/* 조간 대진: 대결 쌍 설정 UI */}
            {session.gameMode === 'group' && generateCrossGroup && (
              <div className="px-6 pb-2 space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700">대결 쌍 설정</label>
                    <span className="text-xs text-slate-400">
                      코트 {Math.max(1, Math.floor(generateCourts / Math.max(1, crossGroupPairs.length)))}개/쌍
                    </span>
                  </div>
                  {crossGroupPairs.map((pair, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-50 rounded-xl p-2">
                      <select
                        value={pair.groupAId}
                        onChange={e => setCrossGroupPairs(prev => prev.map((p, i) => i === idx ? { ...p, groupAId: e.target.value } : p))}
                        className="flex-1 text-sm border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400"
                      >
                        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                      <span className="text-slate-500 text-sm font-bold shrink-0">vs</span>
                      <select
                        value={pair.groupBId}
                        onChange={e => setCrossGroupPairs(prev => prev.map((p, i) => i === idx ? { ...p, groupBId: e.target.value } : p))}
                        className="flex-1 text-sm border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400"
                      >
                        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                      {crossGroupPairs.length > 1 && (
                        <button
                          onClick={() => setCrossGroupPairs(prev => prev.filter((_, i) => i !== idx))}
                          className="text-red-400 hover:text-red-600 shrink-0 text-xl leading-none px-1"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => setCrossGroupPairs(prev => [...prev, { groupAId: groups[0].id, groupBId: groups[1 % groups.length].id }])}
                    className="w-full py-2 text-sm text-purple-600 border border-dashed border-purple-300 rounded-xl hover:bg-purple-50 transition-colors"
                  >
                    + 대결 쌍 추가
                  </button>
                </div>
                {/* 예상 정보 */}
                <div className="bg-purple-50 rounded-xl p-3 space-y-1.5">
                  {crossGroupPairs.map((pair, idx) => {
                    const gA = groups.find(g => g.id === pair.groupAId);
                    const gB = groups.find(g => g.id === pair.groupBId);
                    if (!gA || !gB) return null;
                    const pA = attendingPlayers.filter(p => gA.memberIds.includes(p.id)).length;
                    const pB = attendingPlayers.filter(p => gB.memberIds.includes(p.id)).length;
                    const c = Math.max(1, Math.floor(generateCourts / crossGroupPairs.length));
                    const sameGroup = pair.groupAId === pair.groupBId;
                    const ok = !sameGroup && pA >= 2 && pB >= 2;
                    // 예상 라운드 수 및 경기 수 범위 계산
                    const activeCourts = ok ? Math.min(c, Math.floor(pA / 2), Math.floor(pB / 2)) : 0;
                    let previewRounds = generateRounds;
                    if (generateMode === 'games' && activeCourts > 0) {
                      const rA = Math.ceil(generateTargetGames * pA / (activeCourts * 2));
                      const rB = Math.ceil(generateTargetGames * pB / (activeCourts * 2));
                      previewRounds = Math.max(rA, rB);
                    }
                    const totalGamesA = previewRounds * activeCourts * 2;
                    const totalGamesB = previewRounds * activeCourts * 2;
                    const minGamesA = pA > 0 ? Math.floor(totalGamesA / pA) : 0;
                    const maxGamesA = pA > 0 ? Math.ceil(totalGamesA / pA) : 0;
                    const minGamesB = pB > 0 ? Math.floor(totalGamesB / pB) : 0;
                    const maxGamesB = pB > 0 ? Math.ceil(totalGamesB / pB) : 0;
                    const gamesLabelA = minGamesA === maxGamesA ? `${minGamesA}경기` : `${minGamesA}~${maxGamesA}경기`;
                    const gamesLabelB = minGamesB === maxGamesB ? `${minGamesB}경기` : `${minGamesB}~${maxGamesB}경기`;
                    return (
                      <div key={idx} className={`text-xs space-y-0.5 ${ok ? 'text-purple-700' : 'text-red-500'}`}>
                        <div>
                          <span className="font-medium">{gA.name}</span>
                          <span className="text-slate-400 mx-1">({pA}명)</span>
                          <span className="font-bold">vs</span>
                          <span className="font-medium ml-1">{gB.name}</span>
                          <span className="text-slate-400 mx-1">({pB}명)</span>
                          <span>· {c}코트 · {previewRounds}라운드</span>
                          {sameGroup && <span className="ml-1 text-red-500">⚠ 같은 조</span>}
                          {!sameGroup && (pA < 2 || pB < 2) && <span className="ml-1 text-red-500">⚠ 인원 부족</span>}
                        </div>
                        {ok && activeCourts > 0 && (
                          <div className="text-purple-500">
                            인당 경기 수 — {gA.name}: <span className="font-semibold">{gamesLabelA}</span>
                            {' / '}{gB.name}: <span className="font-semibold">{gamesLabelB}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 조 내부 대진: 기존 대진 생성 조 선택 */}
            {session.gameMode === 'group' && !generateCrossGroup && groups.length > 0 && (
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
                onClick={() => {
                if (session.gameMode === 'group') {
                  generateCrossGroup
                    ? handleGenerateCrossGroupMatches()
                    : handleGenerateGroupMatches(generateTargetGroup);
                } else {
                  handleGenerate();
                }
              }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
              >
                {session.isGenerated ? '재생성' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mixed Rounds Balance Suggestion Dialog */}
      {showMixedSuggestion && (() => {
        const maleCount = attendingPlayers.filter(p => p.gender === 'male').length;
        const femaleCount = attendingPlayers.filter(p => p.gender === 'female').length;
        const { maleAvg: curMaleAvg, femaleAvg: curFemaleAvg } = calculateExpectedGames(
          maleCount, femaleCount, generateCourts, generateRounds, generateMixedRounds,
        );
        const { maleAvg: newMaleAvg, femaleAvg: newFemaleAvg } = calculateExpectedGames(
          maleCount, femaleCount, generateCourts, generateRounds, suggestedMixedRounds,
        );
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
              <div className="px-6 pt-5 pb-4">
                <h2 className="font-bold text-slate-800 text-lg mb-1">남녀 경기수 불균형 감지</h2>
                <p className="text-sm text-slate-500">
                  현재 설정으로는 남녀 경기수 차이가 1개를 초과합니다.
                  혼복 라운드를 늘려서 균형을 맞출까요?
                </p>
                <div className="mt-4 space-y-2">
                  <div className="bg-red-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-red-700 mb-1">현재 설정 (혼복 {generateMixedRounds}R)</p>
                    <div className="flex gap-4 text-xs text-red-600">
                      <span>남자 ≈ {curMaleAvg.toFixed(1)}경기</span>
                      <span>여자 ≈ {curFemaleAvg.toFixed(1)}경기</span>
                      <span className="font-semibold">차이 {Math.abs(curMaleAvg - curFemaleAvg).toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="bg-green-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-green-700 mb-1">변경 후 (혼복 {suggestedMixedRounds}R)</p>
                    <div className="flex gap-4 text-xs text-green-600">
                      <span>남자 ≈ {newMaleAvg.toFixed(1)}경기</span>
                      <span>여자 ≈ {newFemaleAvg.toFixed(1)}경기</span>
                      <span className="font-semibold">차이 {Math.abs(newMaleAvg - newFemaleAvg).toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-6 pb-5 flex gap-3">
                <button
                  onClick={() => doGenerate(generateMixedRounds)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  아니오 (현재 설정 유지)
                </button>
                <button
                  onClick={() => doGenerate(suggestedMixedRounds, true)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
                >
                  예 (혼복 {suggestedMixedRounds}R)
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Manual Bracket Builder Modal */}
      {showManualMode && (() => {
        // 이미 다른 슬롯에 배정된 선수 ID 집합 (현재 라운드 전체)
        const assignedInRound = new Set<string>();
        for (let c = 1; c <= manualCourts; c++) {
          const key = `${manualActiveRound}_${c}`;
          (manualSlots[key] ?? []).forEach(p => assignedInRound.add(p.id));
        }

        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="font-semibold text-slate-800">수기 입력</h3>
                <button onClick={() => setShowManualMode(false)} className="text-slate-400 hover:text-slate-600 text-sm">닫기</button>
              </div>

              {manualStep === 'setup' ? (
                <div className="px-5 py-5 space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">라운드 수</label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setManualRounds(prev => Math.max(1, prev - 1))}
                        className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 text-xl font-bold hover:bg-slate-200 transition-colors"
                      >−</button>
                      <span className="text-2xl font-bold text-slate-800 w-12 text-center">{manualRounds}</span>
                      <button
                        onClick={() => setManualRounds(prev => prev + 1)}
                        className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 text-xl font-bold hover:bg-slate-200 transition-colors"
                      >+</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">코트 수</label>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5, 6].map(n => (
                        <button
                          key={n}
                          onClick={() => setManualCourts(n)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                            manualCourts === n ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >{n}</button>
                      ))}
                    </div>
                  </div>
                  <div className="pt-2">
                    <button
                      onClick={() => { setManualStep('assign'); setManualActiveRound(1); }}
                      className="w-full py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors"
                    >다음 →</button>
                  </div>
                </div>
              ) : (
                <>
                  {/* 라운드 탭 */}
                  <div className="flex gap-1 px-4 pt-3 overflow-x-auto shrink-0">
                    {Array.from({ length: manualRounds }, (_, i) => i + 1).map(r => (
                      <button
                        key={r}
                        onClick={() => setManualActiveRound(r)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                          manualActiveRound === r ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >{r}R</button>
                    ))}
                  </div>

                  {/* 코트 슬롯 */}
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                    {Array.from({ length: manualCourts }, (_, i) => i + 1).map(c => {
                      const key = `${manualActiveRound}_${c}`;
                      const slotPlayers = manualSlots[key] ?? [];
                      return (
                        <div key={c} className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                          <p className="text-xs font-semibold text-slate-500 mb-2">
                            코트 {c}
                            <span className={`ml-2 font-normal ${slotPlayers.length === 4 ? 'text-green-600' : 'text-slate-400'}`}>
                              ({slotPlayers.length}/4명)
                            </span>
                          </p>
                          {/* 선택된 선수 배지 */}
                          {slotPlayers.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {slotPlayers.map(p => (
                                <button
                                  key={p.id}
                                  onClick={() => handleManualTogglePlayer(manualActiveRound, c, p)}
                                  className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                                    p.gender === 'male'
                                      ? 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200'
                                      : 'bg-pink-100 text-pink-700 border-pink-200 hover:bg-pink-200'
                                  }`}
                                >
                                  {p.name} ✕
                                </button>
                              ))}
                            </div>
                          )}
                          {/* 선수 선택 목록 - 남/여 구분 */}
                          {slotPlayers.length < 4 && (() => {
                            const males = attendingPlayers.filter(p => p.gender === 'male' && !slotPlayers.some(sp => sp.id === p.id));
                            const females = attendingPlayers.filter(p => p.gender === 'female' && !slotPlayers.some(sp => sp.id === p.id));
                            const renderBtn = (p: Player) => {
                              const inOtherSlot = assignedInRound.has(p.id);
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => !inOtherSlot && handleManualTogglePlayer(manualActiveRound, c, p)}
                                  disabled={inOtherSlot}
                                  className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                                    inOtherSlot
                                      ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed opacity-50'
                                      : p.gender === 'male'
                                      ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                                      : 'bg-pink-50 text-pink-600 border-pink-200 hover:bg-pink-100'
                                  }`}
                                >
                                  {p.name}
                                </button>
                              );
                            };
                            return (
                              <div className="space-y-1.5">
                                {males.length > 0 && (
                                  <div>
                                    <span className="text-xs text-blue-400 font-medium mr-1">남</span>
                                    <span className="inline-flex flex-wrap gap-1">{males.map(renderBtn)}</span>
                                  </div>
                                )}
                                {females.length > 0 && (
                                  <div>
                                    <span className="text-xs text-pink-400 font-medium mr-1">여</span>
                                    <span className="inline-flex flex-wrap gap-1">{females.map(renderBtn)}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>

                  <div className="px-4 py-3 border-t border-slate-100 flex gap-2 shrink-0">
                    <button
                      onClick={() => setManualStep('setup')}
                      className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                    >이전</button>
                    <button
                      onClick={handleManualSave}
                      className="flex-1 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
                    >저장</button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Team Setup Modal */}
      {showTeamSetup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-semibold text-slate-800">팀 배정</h3>
                <p className="text-xs text-slate-500 mt-0.5">각 경기의 팀 구성을 선택하세요.</p>
              </div>
              <button onClick={() => setShowTeamSetup(false)} className="text-slate-400 hover:text-slate-600 text-sm">닫기</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {teamSetupItems.map((item, idx) => {
                const rotations = getTeamRotations(item.players, item.matchType);
                const current = rotations[item.rotation % rotations.length];
                return (
                  <div key={item.matchId} className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-slate-600">
                        {item.round}R · 코트{item.court}
                        <span className={`ml-1.5 px-1.5 py-0.5 rounded text-xs ${
                          item.matchType === 'mixed' ? 'bg-purple-100 text-purple-600' :
                          item.matchType === 'male' ? 'bg-blue-100 text-blue-600' :
                          'bg-pink-100 text-pink-600'
                        }`}>
                          {item.matchType === 'mixed' ? '혼복' : item.matchType === 'male' ? '남복' : '여복'}
                        </span>
                      </p>
                      {rotations.length > 1 && (
                        <button
                          onClick={() =>
                            setTeamSetupItems(prev =>
                              prev.map((it, i) =>
                                i === idx ? { ...it, rotation: it.rotation + 1 } : it
                              )
                            )
                          }
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                          팀 바꾸기
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                      <div className="space-y-1">
                        {current.team1.map(p => (
                          <div key={p.id} className={`px-2 py-1 rounded-lg text-xs font-medium text-center ${
                            p.gender === 'male' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'
                          }`}>
                            {p.name}
                          </div>
                        ))}
                      </div>
                      <span className="text-slate-400 font-bold text-xs">vs</span>
                      <div className="space-y-1">
                        {current.team2.map(p => (
                          <div key={p.id} className={`px-2 py-1 rounded-lg text-xs font-medium text-center ${
                            p.gender === 'male' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'
                          }`}>
                            {p.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
              {teamSetupItems.length === 0 && (
                <p className="text-center text-slate-400 text-sm py-8">팀 배정할 미완료 경기가 없습니다.</p>
              )}
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex gap-2 shrink-0">
              <button
                onClick={() => setShowTeamSetup(false)}
                className="flex-1 py-2.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >취소</button>
              <button
                onClick={handleTeamSetupSave}
                disabled={teamSetupItems.length === 0}
                className="flex-1 py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors"
              >저장</button>
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
              {matches.length > 0 && (
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
              {isAdminUser && matches.length > 0 && (
                <>
                  {/* 되돌리기 (Undo) */}
                  <button
                    onClick={handleUndo}
                    disabled={!canUndo}
                    title="되돌리기"
                    className="px-2.5 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                  >
                    ↩ 되돌리기
                  </button>
                  {/* 라운드 수 조정 */}
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
              {isAdminUser && session.isGenerated && (!session.isConfirmed || isSuperAdmin) && (
                <button
                  onClick={handleConfirm}
                  className="bg-blue-600 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  {session.isConfirmed ? '재확정' : '확정'}
                </button>
              )}
              {isAdminUser && matches.length > 0 && (
                <button
                  onClick={handleResetBracket}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium border border-red-300 text-red-500 hover:bg-red-50 transition-colors"
                >
                  대진 초기화
                </button>
              )}
              {isAdminUser && (
                <button
                  onClick={() => setShowModeModal(true)}
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
          {(removedFromBracket.length > 0 || addedToBracket.length > 0) && isAdminUser && (
            <div className="bg-orange-50 border border-orange-300 rounded-xl p-3 text-sm text-orange-800">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="font-semibold">참석 인원 변경 감지됨</p>
                  {removedFromBracket.length > 0 && (
                    <p className="text-xs">불참으로 변경: {removedFromBracket.map(p => p.name).join(', ')} → 해당 경기 삭제</p>
                  )}
                  {addedToBracket.length > 0 && (
                    <p className="text-xs">새 참석: {addedToBracket.map(p => p.name).join(', ')} → 경기 추가 버튼으로 배정 가능</p>
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
          {isAdminUser && matches.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700 space-y-0.5">
              <p>선수 클릭 → 교체 &nbsp;|&nbsp; 선수 드래그 → 위치 교환 &nbsp;|&nbsp; 경기 카드 드래그 → 순서 이동</p>
              <p>경기 유형 뱃지 클릭(↻) → 혼복/남복/여복 전환 &nbsp;|&nbsp; + 경기 추가 → 벤치 선수로 새 경기 생성</p>
            </div>
          )}

          {session.gameMode === 'group' && (() => {
            // 현재 생성된 경기 타입 감지
            const hasInternalMatches = matches.some(m => m.groupId);
            const hasCrossMatches = crossPairKeys.length > 0;
            // 조 내부만 있으면 조 내부 탭만, 조간만 있으면 조간 탭만 표시
            const showInternalTabs = hasInternalMatches && !hasCrossMatches;
            const showCrossTabs = hasCrossMatches && !hasInternalMatches;
            // 둘 다 있거나 둘 다 없으면 모두 표시
            const showAll = !showInternalTabs && !showCrossTabs;
            return (
            <div className="flex gap-2 flex-wrap">
              {/* 전체 보기 */}
              <button
                onClick={() => setSelectedGroupId(null)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedGroupId === null ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                전체
              </button>
              {/* 조 내부 대진 버튼 (조간 대진만 있을 때는 숨김) */}
              {(showInternalTabs || showAll) && groups.map(g => (
                <button
                  key={g.id}
                  onClick={() => setSelectedGroupId(g.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedGroupId === g.id ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  {g.name}
                </button>
              ))}
              {/* 조간 대진 쌍 버튼 (조 내부 대진만 있을 때는 숨김) */}
              {(showCrossTabs || showAll) && crossPairKeys.map(pairKey => {
                const [idA, idB] = pairKey.split('|');
                const gA = groups.find(g => g.id === idA);
                const gB = groups.find(g => g.id === idB);
                if (!gA || !gB) return null;
                // 공통 suffix가 있으면 "A조 대진", 없으면 "OB vs YB"
                const partsA = gA.name.trim().split(/\s+/);
                const partsB = gB.name.trim().split(/\s+/);
                const suffA = partsA[partsA.length - 1];
                const suffB = partsB[partsB.length - 1];
                const label = suffA === suffB ? `${suffA} 대진` : `${gA.name} vs ${gB.name}`;
                const selKey = `cross_${pairKey}`;
                return (
                  <button
                    key={selKey}
                    onClick={() => setSelectedGroupId(selKey)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedGroupId === selKey ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-600 border border-orange-200'}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            );
          })()}

          {matches.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
              <p className="text-slate-400 text-lg mb-2">아직 대진표가 없습니다.</p>
              {isAdminUser && <p className="text-slate-400 text-sm">참석 투표 완료 후 대진표를 생성하세요.</p>}
            </div>
          ) : (() => {
            // pendingMatches가 있으면 편집 중인 값, 없으면 저장된 matches (저장 직후 깜빡임 방지)
            const bracketSource = pendingMatches.length > 0 ? pendingMatches : matches;
            // cross_xxx: 조간 대진 쌍 필터, group.id: 조 내부 필터, null: 전체
            const isCrossFilter = typeof selectedGroupId === 'string' && selectedGroupId.startsWith('cross_');
            const crossPairKey = isCrossFilter ? selectedGroupId.slice(6) : null;
            const filterByPair = (arr: Match[]) => {
              if (!selectedGroupId || session.gameMode !== 'group') return arr;
              if (isCrossFilter) {
                return arr.filter(m => {
                  if (m.groupId) return false;
                  const gA = playerGroupMap.get(m.team1.player1.id);
                  const gB = playerGroupMap.get(m.team2.player1.id);
                  if (!gA || !gB) return false;
                  return [gA, gB].sort().join('|') === crossPairKey;
                });
              }
              return arr.filter(m => m.groupId === selectedGroupId);
            };
            const filteredSource = filterByPair(bracketSource);
            const filteredMatches = filterByPair(matches);
            // 휴식 인원: 해당 필터 범위 내 선수만 표시
            const roundAttendingPlayers = (() => {
              if (!selectedGroupId || session.gameMode !== 'group') return attendingPlayers;
              if (isCrossFilter) {
                const [idA, idB] = (crossPairKey ?? '').split('|');
                const gA = groups.find(g => g.id === idA);
                const gB = groups.find(g => g.id === idB);
                if (!gA || !gB) return attendingPlayers;
                return attendingPlayers.filter(p => gA.memberIds.includes(p.id) || gB.memberIds.includes(p.id));
              }
              const group = groups.find(g => g.id === selectedGroupId);
              return group ? attendingPlayers.filter(p => group.memberIds.includes(p.id)) : attendingPlayers;
            })();
            // 관리자: pendingRoundsCount 기반 (라운드 추가/삭제 반영), 비관리자: 실제 matches 기준
            const displayRounds = isAdminUser && pendingRoundsCount > 0
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
                onBenchDragStart={editMode ? handleBenchDragStart : undefined}
                dragRound={dragRound}
                dragOverRound={dragOverRound}
                onRoundDragStart={editMode ? setDragRound : undefined}
                onRoundDragOver={editMode ? setDragOverRound : undefined}
                onRoundDrop={editMode ? handleRoundDrop : undefined}
                onAddMatch={editMode ? handleAddMatch : undefined}
                onMatchTypeChange={editMode ? handleMatchTypeChange : undefined}
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
    </div>
  );
}
