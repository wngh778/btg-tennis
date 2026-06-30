import type { User } from '@supabase/supabase-js';
import type { Session, Match, Player, SessionGroup, MatchType } from '../../types';
import { RoundCard } from './RoundCard';
import type { SubstituteTarget } from './RoundCard';

// ── withDisplayCourts: 전체 뷰에서 조별 코트 번호 중복 해결 ─────────────────
// 그룹 모드 + 전체 보기(selectedGroupId === null)일 때만 표시용 재번호
// DB/state 값은 변경 없음 — MatchCard 레이블 표시에만 사용
function withDisplayCourts(arr: Match[], selectedGroupId: string | null, groups: SessionGroup[], gameMode: string): Match[] {
  if (selectedGroupId !== null || gameMode !== 'group') return arr;
  const groupOrder = new Map(groups.map((g, idx) => [g.id, idx]));
  const byRound = new Map<number, Match[]>();
  for (const m of arr) {
    if (!byRound.has(m.round)) byRound.set(m.round, []);
    byRound.get(m.round)!.push(m);
  }
  const result: Match[] = [];
  for (const [, roundMatches] of byRound) {
    const sorted = [...roundMatches].sort((a, b) => {
      const ga = groupOrder.get(a.groupId ?? '') ?? 999;
      const gb = groupOrder.get(b.groupId ?? '') ?? 999;
      return ga !== gb ? ga - gb : a.court - b.court;
    });
    sorted.forEach((m, i) => result.push({ ...m, court: i + 1 }));
  }
  return result;
}

interface BracketTabProps {
  session: Session;
  matches: Match[];
  attendingPlayers: Player[];
  groups: SessionGroup[];
  selectedGroupId: string | null;
  setSelectedGroupId: (id: string | null) => void;
  pendingMatches: Match[];
  pendingRoundsCount: number;
  matchGameNumbers: Map<string, number>;
  isAdminUser: boolean;
  user: User | null;
  editMode: boolean;
  saving: boolean;
  canUndo: boolean;
  playerGroupMap: Map<string, string>;
  removedFromBracket: Player[];
  addedToBracket: Player[];
  substituteTarget: SubstituteTarget;
  dragMatchId: string | null;
  dragOverMatchId: string | null;
  dragOverEmptyRound: number | null;
  dragRound: number | null;
  dragOverRound: number | null;
  setDragMatchId: (id: string | null) => void;
  setDragOverMatchId: (id: string | null) => void;
  setDragOverEmptyRound: (r: number | null) => void;
  setDragRound: (r: number | null) => void;
  setDragOverRound: (r: number | null) => void;
  onScoreUpdate: (matchId: string, score1: string, score2: string) => void;
  onResetBracket: () => void;
  onSyncBracket: () => void;
  onRoundCountChange: (delta: number) => void;
  onUndo: () => void;
  onShowModeModal: () => void;
  onAutoFillRound: (round: number) => void;
  onDeleteMatch: (matchId: string) => void;
  onDeleteRound: (round: number) => void;
  onAddMatch: (round: number) => void;
  onMatchTypeChange: (matchId: string, newType: MatchType) => void;
  onDragDrop: (targetMatchId: string) => void;
  onDragToEmptyRound: (targetRound: number) => void;
  onRoundDrop: (targetRound: number) => void;
  onPlayerDragStart: ((matchId: string, team: 'team1' | 'team2', slot: 'player1' | 'player2') => void) | undefined;
  onPlayerDrop: ((matchId: string, team: 'team1' | 'team2', slot: 'player1' | 'player2') => void) | undefined;
  onBenchDragStart: ((player: Player) => void) | undefined;
  onPlayerClick: (matchId: string, team: 'team1' | 'team2', slot: 'player1' | 'player2', player: Player) => void;
}

export function BracketTab({
  session,
  matches,
  attendingPlayers,
  groups,
  selectedGroupId,
  setSelectedGroupId,
  pendingMatches,
  pendingRoundsCount,
  matchGameNumbers,
  isAdminUser,
  user,
  editMode,
  saving,
  canUndo,
  playerGroupMap,
  removedFromBracket,
  addedToBracket,
  substituteTarget,
  dragMatchId,
  dragOverMatchId,
  dragOverEmptyRound,
  dragRound,
  dragOverRound,
  setDragMatchId,
  setDragOverMatchId,
  setDragOverEmptyRound,
  setDragRound,
  setDragOverRound,
  onScoreUpdate,
  onResetBracket,
  onSyncBracket,
  onRoundCountChange,
  onUndo,
  onShowModeModal,
  onAutoFillRound,
  onDeleteMatch,
  onDeleteRound,
  onAddMatch,
  onMatchTypeChange,
  onDragDrop,
  onDragToEmptyRound,
  onRoundDrop,
  onPlayerDragStart,
  onPlayerDrop,
  onBenchDragStart,
  onPlayerClick,
}: BracketTabProps) {
  // cross_xxx: 조간 대진 쌍 필터, group.id: 조 내부 필터, null: 전체
  const isCrossFilter = typeof selectedGroupId === 'string' && selectedGroupId.startsWith('cross_');
  const crossPairKey = isCrossFilter ? selectedGroupId.slice(6) : null;

  const filterByPair = (arr: Match[]): Match[] => {
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
    // 그룹 탭 필터
    // 1순위: groupId가 있으면 groupId로 직접 필터
    // 2순위: groupId가 없으면 선수 소속으로 판단 (실제 선수 과반수가 해당 그룹이면 포함)
    const group = groups.find(g => g.id === selectedGroupId);
    if (!group) return arr;
    return arr.filter(m => {
      if (m.groupId) return m.groupId === selectedGroupId;
      const players = [m.team1.player1, m.team1.player2, m.team2.player1, m.team2.player2]
        .filter(p => !p.id.startsWith('placeholder_'));
      if (players.length === 0) return false;
      const inGroup = players.filter(p => group.memberIds.includes(p.id));
      return inGroup.length > players.length / 2;
    });
  };

  const bracketSource = pendingMatches.length > 0 ? pendingMatches : matches;
  const filteredSource = withDisplayCourts(filterByPair(bracketSource), selectedGroupId, groups, session.gameMode);
  const filteredMatches = withDisplayCourts(filterByPair(matches), selectedGroupId, groups, session.gameMode);

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

  // 관리자 + 전체 보기: pendingRoundsCount 기반 (빈 라운드 포함)
  // 그룹 탭 선택 시: 필터된 경기 기준 (해당 그룹 경기가 있는 라운드만)
  const displayRounds = isAdminUser && pendingRoundsCount > 0 && !selectedGroupId
    ? Array.from({ length: pendingRoundsCount }, (_, i) => i + 1)
    : Array.from(new Set(filteredSource.map(m => m.round))).sort((a, b) => a - b);


  return (
    <div className="space-y-3">
      {/* 편집 도구 바 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex flex-wrap items-center gap-2">
        {editMode && pendingMatches.length > 0 && (
          <>
            <button
              onClick={onUndo}
              disabled={!canUndo}
              title="되돌리기"
              className="px-2.5 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition-colors"
            >
              ↩ 되돌리기
            </button>
            {/* 라운드 수 조정 */}
            <div className="flex items-center gap-1 border border-slate-300 rounded-lg overflow-hidden">
              <button
                onClick={() => onRoundCountChange(-1)}
                disabled={pendingRoundsCount <= 1}
                className="px-2.5 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition-colors"
              >−</button>
              <span className="px-2 text-sm font-medium text-slate-700">{pendingRoundsCount}R</span>
              <button
                onClick={() => onRoundCountChange(1)}
                className="px-2.5 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >+</button>
            </div>
            {saving && (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <svg className="animate-spin w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                저장 중...
              </span>
            )}
          </>
        )}
        {isAdminUser && matches.length > 0 && (
          <button
            onClick={onResetBracket}
            className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium border border-red-300 text-red-500 hover:bg-red-50 transition-colors"
          >
            대진 초기화
          </button>
        )}
        {isAdminUser && (
          <button
            onClick={onShowModeModal}
            className="bg-green-600 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-green-700 transition-colors"
          >
            {session.isGenerated ? '대진표 재생성' : '대진표 생성'}
          </button>
        )}
      </div>

      {/* 참석 인원 변경 감지 배너 */}
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
                onClick={onSyncBracket}
                className="shrink-0 px-3 py-1.5 bg-orange-600 text-white text-xs rounded-lg hover:bg-orange-700 font-medium"
              >
                대진표 업데이트
              </button>
            )}
          </div>
        </div>
      )}

      {/* 편집 안내 */}
      {isAdminUser && matches.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700 space-y-0.5">
          <p>선수 클릭 → 교체 &nbsp;|&nbsp; 선수 드래그 → 위치 교환 &nbsp;|&nbsp; 경기 카드 드래그 → 순서 이동</p>
          <p>경기 유형 뱃지 클릭(↻) → 혼복/남복/여복 전환 &nbsp;|&nbsp; + 경기 추가 → 벤치 선수로 새 경기 생성</p>
        </div>
      )}

      {/* 그룹 모드 필터 탭 — 조가 편성되어 있으면 항상 표시 */}
      {session.gameMode === 'group' && groups.length > 0 && matches.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedGroupId(null)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedGroupId === null ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            전체
          </button>
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => setSelectedGroupId(g.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedGroupId === g.id ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {g.name} 대진
            </button>
          ))}
        </div>
      )}

      {/* 대진표 없음 안내 */}
      {matches.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <p className="text-slate-400 text-lg mb-2">아직 대진표가 없습니다.</p>
          {isAdminUser && <p className="text-slate-400 text-sm">참석 투표 완료 후 대진표를 생성하세요.</p>}
        </div>
      ) : (
        displayRounds.map(round => (
          <RoundCard
            key={round}
            round={round}
            matches={filteredMatches.filter(m => m.round === round)}
            attendingPlayers={roundAttendingPlayers}
            canEditScore={!!user}
            onScoreUpdate={onScoreUpdate}
            editMode={editMode}
            pendingMatches={filteredSource.filter(m => m.round === round)}
            substituteTarget={substituteTarget}
            onPlayerClick={onPlayerClick}
            showNtrp={isAdminUser}
            dragMatchId={dragMatchId}
            dragOverMatchId={dragOverMatchId}
            onDragStart={setDragMatchId}
            onDragOver={setDragOverMatchId}
            onDrop={onDragDrop}
            dragOverEmptyRound={dragOverEmptyRound}
            onDragOverEmptyRound={setDragOverEmptyRound}
            onDropIntoRound={onDragToEmptyRound}
            matchGameNumbers={matchGameNumbers}
            onAutoFillRound={onAutoFillRound}
            onDeleteMatch={onDeleteMatch}
            onDeleteRound={onDeleteRound}
            onPlayerDragStart={onPlayerDragStart}
            onPlayerDrop={onPlayerDrop}
            onBenchDragStart={onBenchDragStart}
            dragRound={dragRound}
            dragOverRound={dragOverRound}
            onRoundDragStart={editMode ? setDragRound : undefined}
            onRoundDragOver={editMode ? setDragOverRound : undefined}
            onRoundDrop={editMode ? onRoundDrop : undefined}
            onAddMatch={editMode ? onAddMatch : undefined}
            onMatchTypeChange={editMode ? onMatchTypeChange : undefined}
          />
        ))
      )}
    </div>
  );
}
