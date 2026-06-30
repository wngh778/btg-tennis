import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  getSession, getMembers, getGuests, getAttendance,
  setAttendance,
  getMatches, updateMatchScore, updateSession, updateMatch,
  getSessionGroups, deleteMatch, saveMatches,
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

  // Team Setup 모달 (소규모 — 페이지에 유지)
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
  // 이름은 members 최신 정보 우선 사용 → 멤버 이름 수정 후 즉시 대진표에 반영
  const attendingPlayers: Player[] = attendance
    .filter(a => a.attending)
    .map(a => {
      const member = a.playerType === 'member' ? members.find(m => m.id === a.playerId) : undefined;
      return { id: a.playerId, name: member?.name ?? a.playerName, gender: a.gender, ntrp: a.ntrp, type: a.playerType };
    });

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
    handleDragDrop, handleDragToEmptyRound, handleRoundDrop,
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
    handleGenerateClick, doGenerate, handleGenerate,
    handleAiRecommend, handleMondayClick, handleMondayGenerate,
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
      for (const m of toDelete) await deleteMatch(m.id);
    }
    load();
  };

  // ── Team Setup ────────────────────────────────────────────────────────────
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

  // ── 조간 대진 감지 ────────────────────────────────────────────────────────
  const playerGroupMap = new Map<string, string>();
  for (const g of groups) {
    for (const memberId of g.memberIds) playerGroupMap.set(memberId, g.id);
  }
  const crossPairKeysSet = new Set<string>();
  for (const m of matches) {
    if (m.groupId) continue;
    const gA = playerGroupMap.get(m.team1.player1.id);
    const gB = playerGroupMap.get(m.team2.player1.id);
    if (gA && gB) crossPairKeysSet.add([gA, gB].sort().join('|'));
  }
  const crossPairKeys = [...crossPairKeysSet].sort();

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
        <div className="space-y-4">
          {/* 상단 공유 / 간소화 버튼 */}
          {matches.length > 0 && (
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
              <button
                onClick={() => {
                  const url = window.location.origin + '/c/' + session.clubId + '/' + session.id;
                  navigator.clipboard.writeText(url)
                    .then(() => alert('링크가 복사되었습니다'))
                    .catch(() => alert('링크가 복사되었습니다'));
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
            </div>
          )}
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
            crossPairKeys={crossPairKeys}
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
            onAutoFillRound={handleAutoFillRound}
            onDeleteMatch={handleDeleteMatch}
            onDeleteRound={handleDeleteRound}
            onAddMatch={handleAddMatch}
            onMatchTypeChange={handleMatchTypeChange}
            onDragDrop={handleDragDrop}
            onDragToEmptyRound={handleDragToEmptyRound}
            onRoundDrop={handleRoundDrop}
            onPlayerDragStart={editMode ? handlePlayerDragStart : undefined}
            onPlayerDrop={editMode ? handlePlayerDrop : undefined}
            onBenchDragStart={editMode ? handleBenchDragStart : undefined}
            onPlayerClick={handlePlayerClick}
          />
        </div>
      )}

      {/* ── 참석인원 상세 탭 ─────────────────────────────────────────────── */}
      {tab === 'detail' && (
        <PlayerDetailTab attendingPlayers={attendingPlayers} matches={matches} showNtrp={isAdminUser} />
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
          onClose={() => setShowModeModal(false)}
          onSelectNormal={() => { setShowModeModal(false); handleGenerateClick(); }}
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

      {/* ── 모달: 팀 배정 (소규모 — 페이지에 유지) ─────────────────────── */}
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
                              prev.map((it, i) => i === idx ? { ...it, rotation: it.rotation + 1 } : it)
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
    </div>
  );
}
