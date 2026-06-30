import type { Player } from '../../../types';

interface MondayScheduleModalProps {
  attendingPlayers: Player[];
  mondayBasePlayer: string;
  mondayR1Selection: string[];
  mondayCompanion: string;
  mondayRounds: number;
  setMondayBasePlayer: (id: string) => void;
  setMondayR1Selection: (fn: (prev: string[]) => string[]) => void;
  setMondayCompanion: (id: string) => void;
  setMondayRounds: (r: number) => void;
  onClose: () => void;
  onGenerate: () => void;
}

export function MondayScheduleModal({
  attendingPlayers,
  mondayBasePlayer,
  mondayR1Selection,
  mondayCompanion,
  mondayRounds,
  setMondayBasePlayer,
  setMondayR1Selection,
  setMondayCompanion,
  setMondayRounds,
  onClose,
  onGenerate,
}: MondayScheduleModalProps) {
  const malePlayers = attendingPlayers.filter(p => p.gender === 'male');
  const basePlayer = malePlayers.find(p => p.id === mondayBasePlayer);
  const othersForR1 = malePlayers.filter(p => p.id !== mondayBasePlayer);

  const toggleR1 = (pid: string) => {
    setMondayR1Selection(prev =>
      prev.includes(pid) ? prev.filter(x => x !== pid) : prev.length < 3 ? [...prev, pid] : prev,
    );
    setMondayCompanion(mondayCompanion === pid ? '' : mondayCompanion);
  };

  const selectBase = (pid: string) => {
    setMondayBasePlayer(pid);
    setMondayR1Selection(() => []);
    setMondayCompanion('');
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-xs max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 shrink-0">
          <h3 className="font-semibold text-slate-800">월요일 편성</h3>
          <p className="text-xs text-slate-500 mt-1">기준 선수를 선택하고, 첫 경기 추가 선수 3명과 파트너를 지정하세요.</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* 기준 선수(Y) 선택 */}
          <div className="px-5 pt-4 pb-2">
            <p className="text-xs font-semibold text-slate-500 mb-2">
              1단계 — 기준 선수 선택 <span className="text-xs font-normal text-slate-400">(항상 파트너와 함께 출전)</span>
            </p>
            {malePlayers.map(p => {
              const isBase = p.id === mondayBasePlayer;
              return (
                <label
                  key={p.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl border mb-1 cursor-pointer hover:bg-slate-50 transition-colors"
                  style={{ borderColor: isBase ? '#6366f1' : '#e2e8f0', backgroundColor: isBase ? '#eef2ff' : '' }}
                >
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

          {/* R1 추가 선수 선택 */}
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
                <label
                  key={p.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl border mb-1 cursor-pointer hover:bg-slate-50 transition-colors"
                  style={{ borderColor: selected ? '#6366f1' : '#e2e8f0', backgroundColor: selected ? '#eef2ff' : '' }}
                >
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

          {/* 파트너 선택 */}
          {mondayR1Selection.length === 3 && (
            <div className="px-5 pb-3 pt-1">
              <p className="text-xs font-semibold text-slate-500 mb-2">
                3단계 — 파트너 선택 <span className="text-xs font-normal text-slate-400">(기준 선수와 R1·R2·R4·R5 함께 출전)</span>
              </p>
              {mondayR1Selection.map(pid => {
                const p = malePlayers.find(mp => mp.id === pid)!;
                return (
                  <label
                    key={pid}
                    className="flex items-center gap-3 p-2.5 rounded-xl border mb-1 cursor-pointer hover:bg-slate-50 transition-colors"
                    style={{ borderColor: mondayCompanion === pid ? '#6366f1' : '#e2e8f0', backgroundColor: mondayCompanion === pid ? '#eef2ff' : '' }}
                  >
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

          {/* 라운드 수 */}
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
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex gap-2 justify-end shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">취소</button>
          <button
            onClick={onGenerate}
            disabled={mondayR1Selection.length !== 3 || !mondayCompanion}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-40"
          >
            편성 생성
          </button>
        </div>
      </div>
    </div>
  );
}
