import { useState, useRef, useCallback } from 'react';
import type { Player, Match, MatchType } from '../../types';

export type SubstituteTarget = {
  matchId: string;
  team: 'team1' | 'team2';
  slot: 'player1' | 'player2';
  player: Player;
  round: number;
} | null;

const matchTypeLabel: Record<MatchType, string> = { male: '남복', female: '여복', mixed: '혼복' };
const matchTypeBg: Record<MatchType, string> = {
  male: 'bg-blue-50 border-blue-200',
  female: 'bg-pink-50 border-pink-200',
  mixed: 'bg-purple-50 border-purple-200',
};
const matchTypeBadge: Record<MatchType, string> = {
  male: 'bg-blue-100 text-blue-700',
  female: 'bg-pink-100 text-pink-700',
  mixed: 'bg-purple-100 text-purple-700',
};

/** mixed → male → female → mixed 순환 */
const cycleMatchType = (t: MatchType): MatchType => {
  if (t === 'mixed') return 'male';
  if (t === 'male') return 'female';
  return 'mixed';
};

export function PlayerBadge({
  player, editMode, isSelected, onClick, showNtrp, gameNum,
  onDragStart, onDrop,
}: {
  player: Player;
  editMode: boolean;
  isSelected: boolean;
  onClick: () => void;
  showNtrp: boolean;
  gameNum?: number;
  onDragStart?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  if (!player) {
    return <div className="text-xs text-slate-400 px-1.5 py-0.5">-</div>;
  }

  // 빈 슬롯 — 클릭(substituteTarget 있을 때)과 드래그 드롭 모두 지원
  if (player.id.startsWith('placeholder_')) {
    return (
      <div
        className={`w-full rounded-lg px-2 py-1.5 border border-dashed text-xs text-center transition-colors ${
          editMode
            ? 'border-slate-400 text-slate-500 bg-slate-50 hover:bg-yellow-50 hover:border-yellow-400 cursor-pointer'
            : 'border-slate-300 text-slate-400'
        }`}
        onClick={editMode ? onClick : undefined}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={e => { e.stopPropagation(); onDrop?.(e); }}
      >
        {editMode ? '탭/드래그' : '빈 슬롯'}
      </div>
    );
  }

  const content = (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${player.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
      <span className="text-sm font-medium text-slate-800 break-words min-w-0">{player.name}</span>
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
        draggable={true}
        onDragStart={e => { e.stopPropagation(); onDragStart?.(e); }}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={e => { e.stopPropagation(); onDrop?.(e); }}
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

export function MatchCard({
  match, canEditScore, onScoreUpdate, editMode, substituteTarget, onPlayerClick, showNtrp,
  onDragStart, onDragOver, onDrop, isDragOver, matchGameNumbers, onDeleteMatch,
  onPlayerDragStart, onPlayerDrop, onMatchTypeChange,
  onSetDragOver, onTouchDropToRound,
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
  onPlayerDragStart?: (matchId: string, team: 'team1' | 'team2', slot: 'player1' | 'player2') => void;
  onPlayerDrop?: (matchId: string, team: 'team1' | 'team2', slot: 'player1' | 'player2') => void;
  onMatchTypeChange?: (matchId: string, newType: MatchType) => void;
  /** 모바일 터치 드래그용: dragOverMatchId 직접 설정 */
  onSetDragOver?: (id: string | null) => void;
  /** 모바일 터치 드래그 → 빈 라운드로 드롭 */
  onTouchDropToRound?: (round: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [score1, setScore1] = useState(match.score1 || '');
  const [score2, setScore2] = useState(match.score2 || '');
  // 저장 직후 로컬에서 점수를 즉시 표시 (부모 state 갱신 전 깜빡임 방지)
  const [localScore1, setLocalScore1] = useState<string | null>(null);
  const [localScore2, setLocalScore2] = useState<string | null>(null);
  const [localCompleted, setLocalCompleted] = useState(false);
  const score2Ref = useRef<HTMLInputElement>(null);

  // match prop이 바뀌면 로컬 편집 상태 동기화
  const prevMatchIdRef = useRef(match.id);
  if (prevMatchIdRef.current !== match.id) {
    prevMatchIdRef.current = match.id;
    setScore1(match.score1 || '');
    setScore2(match.score2 || '');
    setLocalScore1(null);
    setLocalScore2(null);
    setLocalCompleted(false);
    setEditing(false);
  }

  // s1, s2를 명시적으로 받아 stale closure 없이 저장
  // (onChange에서 setState 직전 값을 직접 전달할 때 사용)
  const handleSave = useCallback((s1: string = score1, s2: string = score2) => {
    onScoreUpdate(match.id, s1, s2);
    // 저장 즉시 로컬 표시 업데이트 — 부모 state 반영 전 깜빡임 방지
    if (s1 !== '' || s2 !== '') {
      setLocalScore1(s1);
      setLocalScore2(s2);
      setLocalCompleted(true);
    }
    setEditing(false);
  }, [match.id, score1, score2, onScoreUpdate]);

  const handleSaveAndNext = useCallback((s1: string = score1, s2: string = score2) => {
    onScoreUpdate(match.id, s1, s2);
    // 저장 즉시 로컬 표시 업데이트
    if (s1 !== '' || s2 !== '') {
      setLocalScore1(s1);
      setLocalScore2(s2);
      setLocalCompleted(true);
    }
    setEditing(false);
    // 다음 미완료 경기의 점수 입력 트리거 탐색
    const id = match.id;
    setTimeout(() => {
      const triggers = document.querySelectorAll<HTMLElement>('[data-score-trigger]');
      const ids = Array.from(triggers).map(el => el.getAttribute('data-score-trigger'));
      const idx = ids.indexOf(id);
      if (idx >= 0 && idx < triggers.length - 1) {
        triggers[idx + 1].click();
      }
    }, 50);
  }, [match.id, score1, score2, onScoreUpdate]);

  // 점수 입력 영역 blur 시 자동 저장
  const handleContainerBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const currentTarget = e.currentTarget;
    setTimeout(() => {
      if (!currentTarget.contains(document.activeElement)) {
        handleSave();
      }
    }, 0);
  };

  // ── 모바일 터치 드래그앤드롭 ───────────────────────────────────────────────
  const touchState = useRef<{
    dragging: boolean;
    lastTargetId: string | null;
    startX: number;
    startY: number;
  }>({ dragging: false, lastTargetId: null, startX: 0, startY: 0 });

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!editMode) return;
    const touch = e.touches[0];
    touchState.current = { dragging: false, lastTargetId: null, startX: touch.clientX, startY: touch.clientY };
  }, [editMode]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!editMode) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchState.current.startX;
    const dy = touch.clientY - touchState.current.startY;

    // 10px 이상 이동하면 드래그 시작
    if (!touchState.current.dragging && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      touchState.current.dragging = true;
      onDragStart?.(match.id);
    }
    if (!touchState.current.dragging) return;

    e.preventDefault();
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const matchEl = el?.closest('[data-match-id]');
    const targetId = matchEl ? matchEl.getAttribute('data-match-id') : null;
    if (targetId !== touchState.current.lastTargetId) {
      touchState.current.lastTargetId = targetId;
      onSetDragOver?.(targetId && targetId !== match.id ? targetId : null);
    }
  }, [editMode, match.id, onDragStart, onSetDragOver]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!editMode || !touchState.current.dragging) return;
    const touch = e.changedTouches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);

    // 빈 라운드 영역으로 드롭
    const roundEl = el?.closest('[data-empty-round]');
    if (roundEl) {
      const roundNum = parseInt(roundEl.getAttribute('data-empty-round') || '0', 10);
      if (roundNum > 0) onTouchDropToRound?.(roundNum);
    } else {
      // 다른 경기 카드로 드롭
      const matchEl = el?.closest('[data-match-id]');
      const targetId = matchEl ? matchEl.getAttribute('data-match-id') : null;
      if (targetId && targetId !== match.id) {
        onDrop?.(targetId);
      }
    }
    onSetDragOver?.(null);
    touchState.current = { dragging: false, lastTargetId: null, startX: 0, startY: 0 };
  }, [editMode, match.id, onDrop, onSetDragOver, onTouchDropToRound]);

  const t1Ntrp = ((match.team1.player1.ntrp + match.team1.player2.ntrp) / 2).toFixed(1);
  const t2Ntrp = ((match.team2.player1.ntrp + match.team2.player2.ntrp) / 2).toFixed(1);

  // 표시할 점수: 로컬 저장 값 우선, 그 다음 prop
  const displayScore1 = localScore1 ?? match.score1 ?? '';
  const displayScore2 = localScore2 ?? match.score2 ?? '';
  const displayCompleted = localCompleted || match.isCompleted;

  return (
    <div
      data-match-id={match.id}
      className={`p-4 border-l-4 ${matchTypeBg[match.matchType]} ${isDragOver ? 'ring-2 ring-inset ring-blue-400 bg-blue-50' : ''} ${editMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
      draggable={editMode}
      onDragStart={editMode ? () => onDragStart?.(match.id) : undefined}
      onDragOver={editMode ? (e) => { e.preventDefault(); onDragOver?.(e); } : undefined}
      onDrop={editMode ? () => onDrop?.(match.id) : undefined}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {editMode && <span className="text-slate-300 text-sm select-none">⠿</span>}
          <span className="font-semibold text-slate-600 text-sm">{match.round}R {match.court}코트</span>
          {editMode && onMatchTypeChange ? (
            <button
              onClick={e => { e.stopPropagation(); onMatchTypeChange(match.id, cycleMatchType(match.matchType)); }}
              title="클릭하여 경기 유형 변경 (혼복→남복→여복)"
              className={`px-2 py-0.5 rounded-full text-xs font-medium transition-opacity hover:opacity-70 cursor-pointer ${matchTypeBadge[match.matchType]}`}
            >
              {matchTypeLabel[match.matchType]} ↻
            </button>
          ) : (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${matchTypeBadge[match.matchType]}`}>
              {matchTypeLabel[match.matchType]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {displayCompleted && !editMode && <span className="text-xs text-slate-400">✓ 완료</span>}
          {editMode && onDeleteMatch && (
            <button
              onClick={e => {
                e.stopPropagation();
                if (window.confirm('이 경기를 삭제하시겠습니까?')) {
                  onDeleteMatch(match.id);
                }
              }}
              className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-0.5 rounded transition-colors"
            >
              경기 삭제
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Team 1 */}
        <div className="flex-1 min-w-0 bg-white rounded-xl p-3 border border-slate-200">
          <div className="space-y-1">
            <PlayerBadge
              player={match.team1.player1}
              editMode={editMode}
              isSelected={substituteTarget?.matchId === match.id && substituteTarget?.team === 'team1' && substituteTarget?.slot === 'player1'}
              onClick={() => onPlayerClick(match.id, 'team1', 'player1', match.team1.player1)}
              showNtrp={showNtrp}
              gameNum={matchGameNumbers?.get(`${match.id}_${match.team1.player1.id}`)}
              onDragStart={() => onPlayerDragStart?.(match.id, 'team1', 'player1')}
              onDrop={() => onPlayerDrop?.(match.id, 'team1', 'player1')}
            />
            <PlayerBadge
              player={match.team1.player2}
              editMode={editMode}
              isSelected={substituteTarget?.matchId === match.id && substituteTarget?.team === 'team1' && substituteTarget?.slot === 'player2'}
              onClick={() => onPlayerClick(match.id, 'team1', 'player2', match.team1.player2)}
              showNtrp={showNtrp}
              gameNum={matchGameNumbers?.get(`${match.id}_${match.team1.player2.id}`)}
              onDragStart={() => onPlayerDragStart?.(match.id, 'team1', 'player2')}
              onDrop={() => onPlayerDrop?.(match.id, 'team1', 'player2')}
            />
          </div>
          {showNtrp && <div className="text-xs text-slate-400 mt-2">평균 {t1Ntrp}</div>}
        </div>

        {/* Score */}
        <div className="text-center flex flex-col items-center gap-1 shrink-0 w-fit">
          {editing ? (
            <div
              className="flex items-center gap-1"
              onBlur={handleContainerBlur}
              onClick={e => e.stopPropagation()}
              onDragStart={e => e.stopPropagation()}
            >
              <input
                value={score1}
                onChange={e => {
                  const v = e.target.value;
                  setScore1(v);
                  // 숫자 1자 입력 시 자동으로 score2로 이동
                  if (v.length >= 1 && /^\d+$/.test(v)) {
                    setTimeout(() => score2Ref.current?.focus(), 0);
                  }
                }}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); score2Ref.current?.focus(); } }}
                className="w-10 text-center border border-slate-300 rounded-lg py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                inputMode="numeric"
                placeholder="0"
                autoFocus
              />
              <span className="text-slate-400 text-xs font-bold">:</span>
              <input
                ref={score2Ref}
                value={score2}
                onChange={e => {
                  const v = e.target.value;
                  setScore2(v);
                  // 두 점수 모두 숫자 입력 시 자동 저장 + 다음 경기로 이동
                  if (v !== '' && /^\d+$/.test(v) && score1 !== '' && /^\d+$/.test(score1)) {
                    handleSaveAndNext(score1, v);
                  }
                }}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveAndNext(); }}
                className="w-10 text-center border border-slate-300 rounded-lg py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                inputMode="numeric"
                placeholder="0"
              />
            </div>
          ) : canEditScore ? (
            <div
              data-score-trigger={match.id}
              onClick={e => { e.stopPropagation(); setEditing(true); }}
              className="cursor-pointer flex flex-col items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/60 transition-colors"
            >
              {displayCompleted ? (
                <div className="flex items-center gap-1">
                  <span className="text-lg font-bold text-slate-800">{displayScore1}</span>
                  <span className="text-xs text-slate-400 font-bold">:</span>
                  <span className="text-lg font-bold text-slate-800">{displayScore2}</span>
                </div>
              ) : (
                <div className="text-green-500 text-xs font-semibold">탭하여<br/>입력</div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              {displayCompleted ? (
                <div className="flex items-center gap-1">
                  <span className="text-lg font-bold text-slate-800">{displayScore1}</span>
                  <span className="text-xs text-slate-400 font-bold">:</span>
                  <span className="text-lg font-bold text-slate-800">{displayScore2}</span>
                </div>
              ) : (
                <div className="text-slate-300 text-sm">vs</div>
              )}
            </div>
          )}
        </div>

        {/* Team 2 */}
        <div className="flex-1 min-w-0 bg-white rounded-xl p-3 border border-slate-200">
          <div className="space-y-1">
            <PlayerBadge
              player={match.team2.player1}
              editMode={editMode}
              isSelected={substituteTarget?.matchId === match.id && substituteTarget?.team === 'team2' && substituteTarget?.slot === 'player1'}
              onClick={() => onPlayerClick(match.id, 'team2', 'player1', match.team2.player1)}
              showNtrp={showNtrp}
              gameNum={matchGameNumbers?.get(`${match.id}_${match.team2.player1.id}`)}
              onDragStart={() => onPlayerDragStart?.(match.id, 'team2', 'player1')}
              onDrop={() => onPlayerDrop?.(match.id, 'team2', 'player1')}
            />
            <PlayerBadge
              player={match.team2.player2}
              editMode={editMode}
              isSelected={substituteTarget?.matchId === match.id && substituteTarget?.team === 'team2' && substituteTarget?.slot === 'player2'}
              onClick={() => onPlayerClick(match.id, 'team2', 'player2', match.team2.player2)}
              showNtrp={showNtrp}
              gameNum={matchGameNumbers?.get(`${match.id}_${match.team2.player2.id}`)}
              onDragStart={() => onPlayerDragStart?.(match.id, 'team2', 'player2')}
              onDrop={() => onPlayerDrop?.(match.id, 'team2', 'player2')}
            />
          </div>
          {showNtrp && <div className="text-xs text-slate-400 mt-2">평균 {t2Ntrp}</div>}
        </div>
      </div>
    </div>
  );
}

export function RoundCard({
  round, matches, attendingPlayers, canEditScore, onScoreUpdate,
  editMode, pendingMatches, substituteTarget, onPlayerClick, showNtrp,
  dragMatchId, dragOverMatchId, onDragStart, onDragOver, onDrop,
  dragOverEmptyRound, onDragOverEmptyRound, onDropIntoRound,
  matchGameNumbers, onAutoFillRound, onDeleteMatch, onDeleteRound,
  onPlayerDragStart, onPlayerDrop, onBenchDragStart,
  dragRound, dragOverRound, onRoundDragStart, onRoundDragOver, onRoundDrop,
  onAddMatch, onMatchTypeChange,
  onSetDragOver, onTouchDropToRound,
  onMoveUp, onMoveDown,
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
  onPlayerDragStart?: (matchId: string, team: 'team1' | 'team2', slot: 'player1' | 'player2') => void;
  onPlayerDrop?: (matchId: string, team: 'team1' | 'team2', slot: 'player1' | 'player2') => void;
  onBenchDragStart?: (player: Player) => void;
  dragRound?: number | null;
  dragOverRound?: number | null;
  onRoundDragStart?: (round: number) => void;
  onRoundDragOver?: (round: number | null) => void;
  onRoundDrop?: (round: number) => void;
  onAddMatch?: (round: number) => void;
  onMatchTypeChange?: (matchId: string, newType: MatchType) => void;
  /** 모바일 터치 드래그용 */
  onSetDragOver?: (id: string | null) => void;
  onTouchDropToRound?: (round: number) => void;
  /** ↑↓ 버튼 라운드 순서 이동 (모바일용) */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const displayMatches = editMode ? pendingMatches : matches;
  const playingIds = new Set(
    displayMatches.flatMap(m => [m.team1.player1.id, m.team1.player2.id, m.team2.player1.id, m.team2.player2.id])
  );
  const restingPlayers = attendingPlayers.filter(p => !playingIds.has(p.id));
  const isEmptyRound = editMode && displayMatches.length === 0;

  const isThisRoundDragging = editMode && dragRound === round;
  const isThisRoundDragOver = editMode && dragOverRound === round && dragRound !== round;

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
      isThisRoundDragOver ? 'border-blue-400 ring-2 ring-blue-300' : 'border-slate-200'
    } ${isThisRoundDragging ? 'opacity-50' : ''}`}>
      <div
        className={`px-5 py-3 border-b border-slate-100 flex items-center justify-between ${
          editMode && onRoundDragStart
            ? 'bg-slate-50 cursor-grab active:cursor-grabbing select-none'
            : 'bg-slate-50'
        } ${isThisRoundDragOver ? 'bg-blue-50' : ''}`}
        draggable={editMode && !!onRoundDragStart}
        onDragStart={editMode && onRoundDragStart ? (e) => {
          e.stopPropagation();
          onRoundDragStart(round);
        } : undefined}
        onDragOver={editMode && onRoundDragOver ? (e) => {
          e.preventDefault();
          e.stopPropagation();
          onRoundDragOver(round);
        } : undefined}
        onDragLeave={editMode && onRoundDragOver ? (e) => {
          e.stopPropagation();
          onRoundDragOver(null);
        } : undefined}
        onDrop={editMode && onRoundDrop ? (e) => {
          e.preventDefault();
          e.stopPropagation();
          onRoundDrop(round);
        } : undefined}
      >
        <div className="flex items-center gap-2">
          {/* 드래그 핸들 — 데스크톱 전용 */}
          {editMode && onRoundDragStart && (
            <span className="hidden sm:inline text-slate-400 text-sm select-none">⠿⠿</span>
          )}
          <h2 className="font-semibold text-slate-700">{round}라운드</h2>
          {isThisRoundDragOver && (
            <span className="hidden sm:inline text-xs text-blue-500 font-medium">여기로 이동</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* ↑↓ 버튼 — 모바일 포함 항상 표시 (드래그가 어려운 환경에서 사용) */}
          {editMode && (onMoveUp || onMoveDown) && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={onMoveUp}
                disabled={!onMoveUp}
                title="라운드 위로"
                className="w-7 h-7 flex items-center justify-center rounded text-slate-500 hover:bg-slate-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-sm"
              >
                ↑
              </button>
              <button
                onClick={onMoveDown}
                disabled={!onMoveDown}
                title="라운드 아래로"
                className="w-7 h-7 flex items-center justify-center rounded text-slate-500 hover:bg-slate-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-sm"
              >
                ↓
              </button>
            </div>
          )}
          {editMode && onDeleteRound && (
            <button
              onClick={() => {
                if (window.confirm(`${round}라운드를 삭제하시겠습니까?`)) {
                  onDeleteRound(round);
                }
              }}
              className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors"
            >
              라운드 삭제
            </button>
          )}
        </div>
      </div>
      {isEmptyRound ? (
        <div
          data-empty-round={round}
          className={`px-5 py-6 text-center transition-colors ${dragOverEmptyRound === round ? 'bg-indigo-50 border-2 border-dashed border-indigo-400' : 'border-2 border-dashed border-slate-200'}`}
          onDragOver={e => { e.preventDefault(); onDragOverEmptyRound?.(round); }}
          onDragLeave={() => onDragOverEmptyRound?.(null)}
          onDrop={e => { e.preventDefault(); onDropIntoRound?.(round); onDragOverEmptyRound?.(null); }}
        >
          <p className="hidden sm:block text-sm text-slate-400 mb-3">경기 카드를 여기로 드래그하세요</p>
          <div className="flex justify-center gap-2">
            {onAutoFillRound && (
              <button
                onClick={() => onAutoFillRound(round)}
                className="px-4 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 font-medium"
              >
                자동 배정
              </button>
            )}
            {onAddMatch && (
              <button
                onClick={() => onAddMatch(round)}
                className="px-4 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 font-medium"
              >
                + 경기 추가
              </button>
            )}
          </div>
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
              onPlayerDragStart={onPlayerDragStart}
              onPlayerDrop={onPlayerDrop}
              onMatchTypeChange={onMatchTypeChange}
              onSetDragOver={onSetDragOver}
              onTouchDropToRound={onTouchDropToRound}
            />
          ))}
          {editMode && onAddMatch && (
            <div className="px-5 py-3 flex justify-center">
              <button
                onClick={() => onAddMatch(round)}
                className="px-4 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-300 text-xs rounded-lg hover:bg-emerald-100 font-medium transition-colors"
              >
                + 경기 추가
              </button>
            </div>
          )}
        </div>
      )}
      {restingPlayers.length > 0 && (
        <div className="px-5 py-2.5 bg-amber-50 border-t border-amber-100 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-amber-600 shrink-0">
            {editMode ? '후보' : '휴식'}
          </span>
          {restingPlayers.map(p => (
            editMode ? (
              <button
                key={p.id}
                draggable={true}
                onDragStart={e => { e.stopPropagation(); onBenchDragStart?.(p); }}
                onDragEnd={() => {/* drag end는 부모가 처리 */}}
                className="flex items-center gap-1 text-xs text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-full px-2 py-0.5 cursor-grab active:cursor-grabbing transition-colors"
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                {p.name}
              </button>
            ) : (
              <span key={p.id} className="flex items-center gap-1 text-xs text-amber-700">
                <span className={`w-1.5 h-1.5 rounded-full ${p.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                {p.name}
              </span>
            )
          ))}
          {editMode && (
            <span className="hidden sm:inline text-xs text-amber-500 ml-1">← 코트 선수에게 드래그</span>
          )}
        </div>
      )}
    </div>
  );
}
