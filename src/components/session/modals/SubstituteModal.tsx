import type { Player, Match } from '../../../types';
import type { SubstituteTarget } from '../RoundCard';

interface SubstituteModalProps {
  substituteTarget: NonNullable<SubstituteTarget>;
  attendingPlayers: Player[];
  pendingMatches: Match[];
  onSubstitute: (player: Player) => void;
  onClose: () => void;
}

export function SubstituteModal({
  substituteTarget,
  attendingPlayers,
  pendingMatches,
  onSubstitute,
  onClose,
}: SubstituteModalProps) {
  const playingInRound = new Set(
    pendingMatches
      .filter(m => m.round === substituteTarget.round)
      .flatMap(m => [m.team1.player1.id, m.team1.player2.id, m.team2.player1.id, m.team2.player2.id]),
  );
  const restingPlayers = attendingPlayers.filter(
    p => !playingInRound.has(p.id) && p.id !== substituteTarget.player.id,
  );
  const playingPlayers = attendingPlayers.filter(
    p => playingInRound.has(p.id) && p.id !== substituteTarget.player.id,
  );
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
                        onClick={() => onSubstitute(p)}
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
                        onClick={() => onSubstitute(p)}
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
