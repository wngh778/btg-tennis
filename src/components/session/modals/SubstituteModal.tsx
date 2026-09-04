import type { Player, Match } from '../../../types';
import type { SubstituteTarget } from '../RoundCard';

interface SubstituteModalProps {
  substituteTarget: NonNullable<SubstituteTarget>;
  attendingPlayers: Player[];
  pendingMatches: Match[];
  onSubstitute: (player: Player) => void;
  onClose: () => void;
}

/** 빈 슬롯(placeholder)이 아닌 실제 선수인지 */
const isRealPlayer = (p: Player | undefined | null): p is Player =>
  !!p && p.id !== '' && !p.id.startsWith('placeholder_');

/** 선수 선택 버튼 — 대기/경기 중 공용 */
function PlayerOption({
  player,
  hoverColor,
  onSelect,
}: {
  player: Player;
  hoverColor: 'green' | 'blue';
  onSelect: (player: Player) => void;
}) {
  const hoverClass =
    hoverColor === 'green'
      ? 'hover:border-green-400 hover:bg-green-50'
      : 'hover:border-blue-400 hover:bg-blue-50';
  return (
    <button
      onClick={() => onSelect(player)}
      className={`w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 ${hoverClass} transition-colors text-left`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${player.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
      <span className="font-medium text-slate-800 text-sm">{player.name}</span>
      {player.type === 'guest' && (
        <span className="text-xs bg-orange-100 text-orange-600 px-1 rounded">G</span>
      )}
      <span className="ml-auto text-xs text-slate-400 font-mono">{player.ntrp.toFixed(1)}</span>
    </button>
  );
}

export function SubstituteModal({
  substituteTarget,
  attendingPlayers,
  pendingMatches,
  onSubstitute,
  onClose,
}: SubstituteModalProps) {
  // 같은 라운드 경기 목록 (코트 순 정렬)
  const roundMatches = pendingMatches
    .filter(m => m.round === substituteTarget.round)
    .sort((a, b) => a.court - b.court);

  // 라운드 내 배정된 선수 id — 대진표 데이터 기준 (attendance와 무관하게 전원 노출 보장)
  const playingInRound = new Set(
    roundMatches
      .flatMap(m => [m.team1.player1, m.team1.player2, m.team2.player1, m.team2.player2])
      .filter(isRealPlayer)
      .map(p => p.id),
  );

  // 대기 선수: 참석했지만 이 라운드에 배정되지 않은 선수
  const restingPlayers = attendingPlayers.filter(
    p => !playingInRound.has(p.id) && p.id !== substituteTarget.player.id,
  );

  // 경기 중인 선수: 코트별 그룹 — 같은 라운드의 모든 코트 선수 노출 (선택 시 자리 맞교환)
  const courtGroups = roundMatches
    .map(m => ({
      court: m.court,
      isTargetCourt: m.id === substituteTarget.matchId,
      players: [m.team1.player1, m.team1.player2, m.team2.player1, m.team2.player2].filter(
        (p): p is Player => isRealPlayer(p) && p.id !== substituteTarget.player.id,
      ),
    }))
    .filter(g => g.players.length > 0);

  const targetCourt = roundMatches.find(m => m.id === substituteTarget.matchId)?.court;
  const hasAny = restingPlayers.length > 0 || courtGroups.length > 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">선수 교체</h3>
          <p className="text-xs text-slate-500 mt-1">
            {substituteTarget.round}R{targetCourt !== undefined ? ` ${targetCourt}코트` : ''} ·{' '}
            <span className="font-medium text-amber-600">{substituteTarget.player.name}</span>
            {substituteTarget.player.name ? ' 자리에' : ' 빈 슬롯에'} 넣을 선수 선택
          </p>
        </div>
        <div className="px-5 py-3 max-h-80 overflow-y-auto space-y-3">
          {!hasAny ? (
            <p className="text-sm text-slate-400 text-center py-4">교체 가능한 선수가 없습니다.</p>
          ) : (
            <>
              {restingPlayers.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1.5">대기 선수 (새로 투입)</p>
                  <div className="space-y-1.5">
                    {restingPlayers.map(p => (
                      <PlayerOption key={p.id} player={p} hoverColor="green" onSelect={onSubstitute} />
                    ))}
                  </div>
                </div>
              )}
              {courtGroups.map(g => (
                <div key={g.court}>
                  <p className="text-xs font-semibold text-slate-500 mb-1.5">
                    {g.court}코트{g.isTargetCourt ? ' · 같은 경기' : ''}{' '}
                    <span className="font-normal text-slate-400">(자리 맞교환)</span>
                  </p>
                  <div className="space-y-1.5">
                    {g.players.map(p => (
                      <PlayerOption key={p.id} player={p} hoverColor="blue" onSelect={onSubstitute} />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-100">
          <button
            onClick={onClose}
            className="w-full py-2 text-sm text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-50 transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
