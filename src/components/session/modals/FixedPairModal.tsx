import type { Player } from '../../../types';

interface FixedPairModalProps {
  attendingPlayers: Player[];
  fixedPairSelection: string[];
  fixedPairCourts: number;
  fixedPairRounds: number;
  setFixedPairSelection: (fn: (prev: string[]) => string[]) => void;
  setFixedPairCourts: (fn: (c: number) => number) => void;
  setFixedPairRounds: (fn: (r: number) => number) => void;
  onClose: () => void;
  onGenerate: () => void;
}

export function FixedPairModal({
  attendingPlayers,
  fixedPairSelection,
  fixedPairCourts,
  fixedPairRounds,
  setFixedPairSelection,
  setFixedPairCourts,
  setFixedPairRounds,
  onClose,
  onGenerate,
}: FixedPairModalProps) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-xs max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 shrink-0">
          <h3 className="font-semibold text-slate-800">대회연습모드</h3>
          <p className="text-xs text-slate-500 mt-1">고정 페어 2명을 선택하세요. 두 선수는 항상 같은 팀으로 출전합니다.</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* 고정 페어 선수 선택 */}
          <div className="px-5 pt-4 pb-2">
            <p className="text-xs font-semibold text-slate-500 mb-2">
              고정 페어 선택 <span className="text-purple-500">({fixedPairSelection.length}/2 선택)</span>
            </p>
            {attendingPlayers.map(p => {
              const selected = fixedPairSelection.includes(p.id);
              return (
                <label
                  key={p.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl border mb-1 cursor-pointer hover:bg-slate-50 transition-colors"
                  style={{ borderColor: selected ? '#7c3aed' : '#e2e8f0', backgroundColor: selected ? '#f5f3ff' : '' }}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => {
                      setFixedPairSelection(prev =>
                        prev.includes(p.id)
                          ? prev.filter(x => x !== p.id)
                          : prev.length < 2 ? [...prev, p.id] : prev,
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
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex gap-2 justify-end shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">취소</button>
          <button
            onClick={onGenerate}
            disabled={fixedPairSelection.length !== 2}
            className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 font-medium disabled:opacity-40"
          >
            편성 생성
          </button>
        </div>
      </div>
    </div>
  );
}
