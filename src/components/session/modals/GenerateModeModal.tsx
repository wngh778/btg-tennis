interface GenerateModeModalProps {
  isSuperAdmin: boolean;
  currentClubName: string | undefined;
  gameMode?: 'normal' | 'group';
  onClose: () => void;
  onSelectNormal: () => void;
  onSelectMonthly: () => void;
  onSelectFixedPair: () => void;
  onSelectMonday: () => void;
  onSelectManual: () => void;
}

export function GenerateModeModal({
  isSuperAdmin,
  currentClubName,
  gameMode,
  onClose,
  onSelectNormal,
  onSelectMonthly,
  onSelectFixedPair,
  onSelectMonday,
  onSelectManual,
}: GenerateModeModalProps) {
  const isGroupMode = gameMode === 'group';
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-xs max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">대진표 생성 모드 선택</h3>
          <p className="text-xs text-slate-500 mt-1">원하는 방식을 선택하세요.</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {/* 일반 대진표 */}
          <button
            onClick={onSelectNormal}
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

          {/* 월례대회 — 중복 페어 없음 우선, 연속 경기 허용, 설정 모달 없이 즉시 생성 */}
          {!isGroupMode && (
            <button
              onClick={onSelectMonthly}
              className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50 transition-all group"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">🟡</span>
                <div>
                  <p className="font-semibold text-slate-800 text-sm group-hover:text-amber-700">월례대회 대진</p>
                  <p className="text-xs text-slate-400 mt-0.5">중복 페어 없음 최우선 — 연속 경기 허용</p>
                </div>
              </div>
            </button>
          )}

          {/* 대회연습모드 — 그룹 모드에서는 그룹 개념 없이 경기를 생성하므로 표시 안 함 */}
          {!isGroupMode && (
            <button
              onClick={onSelectFixedPair}
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
          )}

          {/* 월요일 편성 (superadmin + 비일요일 클럽 + 비그룹 모드) */}
          {!isGroupMode && isSuperAdmin && !currentClubName?.includes('일요일') && (
            <button
              onClick={onSelectMonday}
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
            onClick={onSelectManual}
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
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">취소</button>
        </div>
      </div>
    </div>
  );
}
