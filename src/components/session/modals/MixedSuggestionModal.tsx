import { calculateExpectedGames } from '../../../utils/matchmaking';

interface MixedSuggestionModalProps {
  maleCount: number;
  femaleCount: number;
  generateCourts: number;
  generateRounds: number;
  generateMixedRounds: number;
  suggestedMixedRounds: number;
  onKeepCurrent: () => void;
  onApplySuggestion: () => void;
}

export function MixedSuggestionModal({
  maleCount,
  femaleCount,
  generateCourts,
  generateRounds,
  generateMixedRounds,
  suggestedMixedRounds,
  onKeepCurrent,
  onApplySuggestion,
}: MixedSuggestionModalProps) {
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
            onClick={onKeepCurrent}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            아니오 (현재 설정 유지)
          </button>
          <button
            onClick={onApplySuggestion}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            예 (혼복 {suggestedMixedRounds}R)
          </button>
        </div>
      </div>
    </div>
  );
}
