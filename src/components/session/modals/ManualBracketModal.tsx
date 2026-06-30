import type { Player } from '../../../types';

interface ManualBracketModalProps {
  attendingPlayers: Player[];
  manualStep: 'setup' | 'assign';
  manualRounds: number;
  manualCourts: number;
  manualActiveRound: number;
  manualSlots: Record<string, Player[]>;
  setManualStep: (step: 'setup' | 'assign') => void;
  setManualRounds: (fn: (prev: number) => number) => void;
  setManualCourts: (n: number) => void;
  setManualActiveRound: (r: number) => void;
  onTogglePlayer: (round: number, court: number, player: Player) => void;
  onClose: () => void;
  onSave: () => void;
}

export function ManualBracketModal({
  attendingPlayers,
  manualStep,
  manualRounds,
  manualCourts,
  manualActiveRound,
  manualSlots,
  setManualStep,
  setManualRounds,
  setManualCourts,
  setManualActiveRound,
  onTogglePlayer,
  onClose,
  onSave,
}: ManualBracketModalProps) {
  // 이미 다른 슬롯에 배정된 선수 ID 집합 (현재 라운드 전체)
  const assignedInRound = new Set<string>();
  for (let c = 1; c <= manualCourts; c++) {
    const key = `${manualActiveRound}_${c}`;
    (manualSlots[key] ?? []).forEach(p => assignedInRound.add(p.id));
  }

  const renderPlayerBtn = (p: Player, court: number) => {
    const inOtherSlot = assignedInRound.has(p.id);
    return (
      <button
        key={p.id}
        onClick={() => !inOtherSlot && onTogglePlayer(manualActiveRound, court, p)}
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-semibold text-slate-800">수기 입력</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">닫기</button>
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
                const males = attendingPlayers.filter(p => p.gender === 'male' && !slotPlayers.some(sp => sp.id === p.id));
                const females = attendingPlayers.filter(p => p.gender === 'female' && !slotPlayers.some(sp => sp.id === p.id));
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
                            onClick={() => onTogglePlayer(manualActiveRound, c, p)}
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
                    {/* 선수 선택 목록 */}
                    {slotPlayers.length < 4 && (
                      <div className="space-y-1.5">
                        {males.length > 0 && (
                          <div>
                            <span className="text-xs text-blue-400 font-medium mr-1">남</span>
                            <span className="inline-flex flex-wrap gap-1">{males.map(p => renderPlayerBtn(p, c))}</span>
                          </div>
                        )}
                        {females.length > 0 && (
                          <div>
                            <span className="text-xs text-pink-400 font-medium mr-1">여</span>
                            <span className="inline-flex flex-wrap gap-1">{females.map(p => renderPlayerBtn(p, c))}</span>
                          </div>
                        )}
                      </div>
                    )}
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
                onClick={onSave}
                className="flex-1 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
              >저장</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
