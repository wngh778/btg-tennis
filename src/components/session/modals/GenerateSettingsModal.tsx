import type { Session, Player, SessionGroup } from '../../../types';
import type { PairingStrategy } from '../../../utils/matchmaking';
import { calcOptimalGroupRounds } from '../../../utils/matchmaking';

interface GenerateSettingsModalProps {
  session: Session;
  attendingPlayers: Player[];
  groups: SessionGroup[];
  maleAttending: number;
  femaleAttending: number;
  // 생성 옵션
  generateCourts: number;
  generateRounds: number;
  generateMixedRounds: number;
  generateMode: 'rounds' | 'games';
  generateTargetGames: number;
  generateStrategy: PairingStrategy;
  generateTargetGroup: string | 'all';
  generateCrossGroup: boolean;
  crossGroupPairs: { groupAId: string; groupBId: string }[];
  aiRecommendMsg: string | null;
  // setters
  setGenerateCourts: (n: number) => void;
  setGenerateRounds: (n: number) => void;
  setGenerateMixedRounds: (n: number) => void;
  setGenerateMode: (mode: 'rounds' | 'games') => void;
  setGenerateTargetGames: (fn: (prev: number) => number) => void;
  setGenerateStrategy: (s: PairingStrategy) => void;
  setGenerateTargetGroup: (id: string | 'all') => void;
  setGenerateCrossGroup: (v: boolean) => void;
  setCrossGroupPairs: (fn: (prev: { groupAId: string; groupBId: string }[]) => { groupAId: string; groupBId: string }[]) => void;
  // 핸들러
  handleAiRecommend: () => void;
  onClose: () => void;
  onGenerate: () => void;
}

const STRATEGIES: { value: PairingStrategy; label: string; desc: string }[] = [
  { value: 'no-repeat-pair', label: '동일 페어 제거 우선', desc: '같은 파트너와 경기 안 하도록 최적화' },
  { value: 'balanced-rest', label: '연속 경기 제거 우선', desc: '쉰 선수 먼저 투입 (2경기→휴식→2경기 패턴)' },
  { value: 'random', label: '랜덤 생성', desc: '최적화 없이 무작위 배치' },
];

export function GenerateSettingsModal({
  session,
  attendingPlayers,
  groups,
  maleAttending,
  femaleAttending,
  generateCourts,
  generateRounds,
  generateMixedRounds,
  generateMode,
  generateTargetGames,
  generateStrategy,
  generateTargetGroup,
  generateCrossGroup,
  crossGroupPairs,
  aiRecommendMsg,
  setGenerateCourts,
  setGenerateRounds,
  setGenerateMixedRounds,
  setGenerateMode,
  setGenerateTargetGames,
  setGenerateStrategy,
  setGenerateTargetGroup,
  setGenerateCrossGroup,
  setCrossGroupPairs,
  handleAiRecommend,
  onClose,
  onGenerate,
}: GenerateSettingsModalProps) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-sm sm:max-w-sm max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="font-bold text-slate-800 text-lg">
            {session.isGenerated ? '대진표 재생성 설정' : '대진표 생성 설정'}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">참석 인원 {attendingPlayers.length}명 · 남{maleAttending} 여{femaleAttending}</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-4">
            {/* AI 추천 버튼 */}
            {session.gameMode !== 'group' && (
              <>
                <button
                  onClick={handleAiRecommend}
                  disabled={attendingPlayers.length === 0}
                  className="w-full py-2 rounded-lg text-sm font-medium bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 disabled:opacity-50 transition-colors"
                >
                  ✨ 최적 조건 자동 추천
                </button>
                {aiRecommendMsg && (
                  <div className="p-2 rounded-lg bg-purple-50 border border-purple-100 text-xs text-purple-700">
                    {aiRecommendMsg}
                  </div>
                )}
              </>
            )}

            {/* 코트 수 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">코트 수</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5, 6].map(n => (
                  <button
                    key={n}
                    onClick={() => setGenerateCourts(n)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      generateCourts === n ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* 생성 전략 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">생성 전략</label>
              <div className="flex flex-col gap-1.5">
                {STRATEGIES.map(s => (
                  <button
                    key={s.value}
                    onClick={() => setGenerateStrategy(s.value)}
                    className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      generateStrategy === s.value ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span className="font-medium">{s.label}</span>
                    <span className={`block text-xs mt-0.5 ${generateStrategy === s.value ? 'text-blue-100' : 'text-slate-400'}`}>
                      {s.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* 입력 방식 (그룹 모드) */}
            {session.gameMode === 'group' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">입력 방식</label>
                <div className="flex gap-2">
                  {(['rounds', 'games'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => {
                        setGenerateMode(m);
                        if (m === 'games') {
                          const targetGrps = generateTargetGroup === 'all' ? groups : groups.filter(g => g.id === generateTargetGroup);
                          const firstGrp = targetGrps[0];
                          if (firstGrp) {
                            const gp = attendingPlayers.filter(p => firstGrp.memberIds.includes(p.id));
                            const ac = Math.min(generateCourts, Math.floor(gp.length / 4));
                            const pl = ac * 4;
                            const optR = calcOptimalGroupRounds(gp.length, generateCourts, generateRounds);
                            const optG = gp.length > 0 && pl > 0 ? Math.round(optR * pl / gp.length) : generateRounds;
                            setGenerateTargetGames(() => optG > 0 ? optG : 1);
                          }
                        }
                      }}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        generateMode === m ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {m === 'rounds' ? '총 라운드 수' : '균등 경기수'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 총 라운드 수 */}
            {(generateMode === 'rounds' || session.gameMode !== 'group') && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">총 라운드 수</label>
                <div className="flex gap-2">
                  {[4, 5, 6, 7, 8].map(n => (
                    <button
                      key={n}
                      onClick={() => {
                        setGenerateRounds(n);
                        setGenerateMixedRounds(Math.min(generateMixedRounds, n));
                      }}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        generateRounds === n ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 인당 최소 경기수 (games 모드) */}
            {generateMode === 'games' && session.gameMode === 'group' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  인당 최소 경기 수 <span className="font-normal text-slate-400">(일부 +1 가능)</span>
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setGenerateTargetGames(prev => Math.max(1, prev - 1))}
                    className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 text-xl font-bold hover:bg-slate-200 transition-colors"
                  >−</button>
                  <span className="text-2xl font-bold text-slate-800 w-12 text-center">{generateTargetGames}</span>
                  <button
                    onClick={() => setGenerateTargetGames(prev => prev + 1)}
                    className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 text-xl font-bold hover:bg-slate-200 transition-colors"
                  >+</button>
                  <span className="text-xs text-slate-400">게임/명</span>
                </div>
              </div>
            )}

            {/* 월례대회 균등 게임수 안내 */}
            {session.type === 'monthly' && (() => {
              const total = maleAttending + femaleAttending;
              if (total < 4) return null;
              const activeCourts = Math.min(generateCourts, Math.floor(total / 4));
              const playing = activeCourts * 4;
              const totalSlots = generateRounds * playing;
              const avgGames = total > 0 ? (totalSlots / total).toFixed(1) : '0';
              const isEven = total > 0 && totalSlots % total === 0;
              // 연속 경기 없이 가능한지: 쉬는 수 >= 뛰는 수의 절반
              // (각 라운드 쉬는 수 = total - playing, 이게 0이면 모두 연속)
              const restPerRound = total - playing;
              return (
                <div className="bg-orange-50 rounded-xl p-3 space-y-1 text-xs">
                  <p className="font-semibold text-orange-700">월례대회 예상</p>
                  <p className="text-orange-600">
                    {total}명 · {generateRounds}라운드 · {activeCourts}코트
                    → 인당 {isEven ? `${avgGames}게임` : `${Math.floor(Number(avgGames))}~${Math.ceil(Number(avgGames))}게임`}
                  </p>
                  {restPerRound === 0 ? (
                    <p className="text-amber-600">⚠ 매 라운드 전원 출전 — 연속 경기 불가피</p>
                  ) : (
                    <p className="text-green-600">✓ 라운드당 {restPerRound}명 휴식 — 연속 경기 최소화 가능</p>
                  )}
                </div>
              );
            })()}

            {/* 혼복 라운드 수 (weekly) */}
            {session.type === 'weekly' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  혼복 라운드 수
                  <span className="text-xs text-slate-400 font-normal ml-1">(전체 {generateRounds}R 중)</span>
                </label>
                <div className="flex gap-2 flex-wrap">
                  {Array.from({ length: generateRounds + 1 }, (_, i) => i).map(n => (
                    <button
                      key={n}
                      onClick={() => setGenerateMixedRounds(Math.min(n, generateRounds))}
                      className={`w-10 py-2 rounded-lg text-sm font-medium transition-colors ${
                        generateMixedRounds === n ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 대진 방식: 조 내부 vs 조간 (그룹 모드 + 2개 이상 조) */}
          {session.gameMode === 'group' && groups.length >= 2 && (
            <div className="px-6 pb-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">대진 방식</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setGenerateCrossGroup(false)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${!generateCrossGroup ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  조 내부 대진
                </button>
                <button
                  onClick={() => setGenerateCrossGroup(true)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${generateCrossGroup ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  조간 대진
                </button>
              </div>
            </div>
          )}

          {/* 조간 대진: 대결 쌍 설정 */}
          {session.gameMode === 'group' && generateCrossGroup && (
            <div className="px-6 pb-2 space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">대결 쌍 설정</label>
                  <span className="text-xs text-slate-400">
                    코트 {Math.max(1, Math.floor(generateCourts / Math.max(1, crossGroupPairs.length)))}개/쌍
                  </span>
                </div>
                {crossGroupPairs.map((pair, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-50 rounded-xl p-2">
                    <select
                      value={pair.groupAId}
                      onChange={e => setCrossGroupPairs(prev => prev.map((p, i) => i === idx ? { ...p, groupAId: e.target.value } : p))}
                      className="flex-1 text-sm border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400"
                    >
                      {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    <span className="text-slate-500 text-sm font-bold shrink-0">vs</span>
                    <select
                      value={pair.groupBId}
                      onChange={e => setCrossGroupPairs(prev => prev.map((p, i) => i === idx ? { ...p, groupBId: e.target.value } : p))}
                      className="flex-1 text-sm border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400"
                    >
                      {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    {crossGroupPairs.length > 1 && (
                      <button
                        onClick={() => setCrossGroupPairs(prev => prev.filter((_, i) => i !== idx))}
                        className="text-red-400 hover:text-red-600 shrink-0 text-xl leading-none px-1"
                      >×</button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setCrossGroupPairs(prev => [...prev, { groupAId: groups[0].id, groupBId: groups[1 % groups.length].id }])}
                  className="w-full py-2 text-sm text-purple-600 border border-dashed border-purple-300 rounded-xl hover:bg-purple-50 transition-colors"
                >
                  + 대결 쌍 추가
                </button>
              </div>
              {/* 예상 정보 */}
              <div className="bg-purple-50 rounded-xl p-3 space-y-1.5">
                {crossGroupPairs.map((pair, idx) => {
                  const gA = groups.find(g => g.id === pair.groupAId);
                  const gB = groups.find(g => g.id === pair.groupBId);
                  if (!gA || !gB) return null;
                  const pA = attendingPlayers.filter(p => gA.memberIds.includes(p.id)).length;
                  const pB = attendingPlayers.filter(p => gB.memberIds.includes(p.id)).length;
                  const baseC = Math.max(1, Math.floor(generateCourts / crossGroupPairs.length));
                  const remC = generateCourts % crossGroupPairs.length;
                  const c = baseC + (idx < remC ? 1 : 0);
                  const sameGroup = pair.groupAId === pair.groupBId;
                  const ok = !sameGroup && pA >= 2 && pB >= 2;
                  const activeCourts = ok ? Math.min(c, Math.floor(pA / 2), Math.floor(pB / 2)) : 0;
                  let previewRounds = generateRounds;
                  if (generateMode === 'games' && activeCourts > 0) {
                    const rA = Math.ceil(generateTargetGames * pA / (activeCourts * 2));
                    const rB = Math.ceil(generateTargetGames * pB / (activeCourts * 2));
                    previewRounds = Math.max(rA, rB);
                  }
                  const totalGamesA = previewRounds * activeCourts * 2;
                  const minGamesA = pA > 0 ? Math.floor(totalGamesA / pA) : 0;
                  const maxGamesA = pA > 0 ? Math.ceil(totalGamesA / pA) : 0;
                  const minGamesB = pB > 0 ? Math.floor(totalGamesA / pB) : 0;
                  const maxGamesB = pB > 0 ? Math.ceil(totalGamesA / pB) : 0;
                  const gamesLabelA = minGamesA === maxGamesA ? `${minGamesA}경기` : `${minGamesA}~${maxGamesA}경기`;
                  const gamesLabelB = minGamesB === maxGamesB ? `${minGamesB}경기` : `${minGamesB}~${maxGamesB}경기`;
                  return (
                    <div key={idx} className={`text-xs space-y-0.5 ${ok ? 'text-purple-700' : 'text-red-500'}`}>
                      <div>
                        <span className="font-medium">{gA.name}</span>
                        <span className="text-slate-400 mx-1">({pA}명)</span>
                        <span className="font-bold">vs</span>
                        <span className="font-medium ml-1">{gB.name}</span>
                        <span className="text-slate-400 mx-1">({pB}명)</span>
                        <span>· {c}코트 · {previewRounds}라운드</span>
                        {sameGroup && <span className="ml-1 text-red-500">⚠ 같은 조</span>}
                        {!sameGroup && (pA < 2 || pB < 2) && <span className="ml-1 text-red-500">⚠ 인원 부족</span>}
                      </div>
                      {ok && activeCourts > 0 && (
                        <div className="text-purple-500">
                          인당 경기 수 — {gA.name}: <span className="font-semibold">{gamesLabelA}</span>
                          {' / '}{gB.name}: <span className="font-semibold">{gamesLabelB}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 조 내부 대진: 조 선택 */}
          {session.gameMode === 'group' && !generateCrossGroup && groups.length > 0 && (
            <div className="px-6 pb-2 space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">대진 생성 조</label>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setGenerateTargetGroup('all')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      generateTargetGroup === 'all' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    전체 조
                  </button>
                  {groups.map(g => (
                    <button
                      key={g.id}
                      onClick={() => setGenerateTargetGroup(g.id)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        generateTargetGroup === g.id ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              </div>
              {/* 조별 예상 라운드 안내 */}
              <div className="bg-purple-50 rounded-xl p-3 space-y-1.5">
                {(generateTargetGroup === 'all' ? groups : groups.filter(g => g.id === generateTargetGroup)).map(g => {
                  const groupPlayers = attendingPlayers.filter(p => g.memberIds.includes(p.id));
                  const activeCourts = Math.min(generateCourts, Math.floor(groupPlayers.length / 4));
                  const playing = activeCourts * 4;
                  const optRounds = calcOptimalGroupRounds(groupPlayers.length, generateCourts, generateRounds);
                  const optGames = groupPlayers.length > 0 && playing > 0
                    ? Math.round(optRounds * playing / groupPlayers.length) : 0;

                  if (generateMode === 'games') {
                    const derivedRounds = playing > 0
                      ? Math.round(generateTargetGames * groupPlayers.length / playing) : 0;
                    const isUnequal = playing > 0 && (generateTargetGames * groupPlayers.length) % playing !== 0;
                    const isRepeat = derivedRounds > optRounds && optRounds > 0;
                    return (
                      <div key={g.id} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-purple-700">{g.name}</span>
                          <span className="text-purple-600">
                            {groupPlayers.length < 4
                              ? '인원 부족 (4명 이상 필요)'
                              : `${groupPlayers.length}명 · ${derivedRounds}라운드 · 인당 ${generateTargetGames}게임`}
                          </span>
                        </div>
                        {groupPlayers.length >= 4 && optGames > 0 && generateTargetGames !== optGames && (
                          <p className="text-xs text-amber-600">
                            권장 {optGames}게임 {isRepeat ? '· ⚠️ 중복 페어 발생 가능' : isUnequal ? '· ⚠️ 경기수 불균등 가능' : ''}
                          </p>
                        )}
                        {groupPlayers.length >= 4 && generateTargetGames === optGames && (
                          <p className="text-xs text-green-600">✓ 최적 게임 수</p>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={g.id} className="flex items-center justify-between text-xs">
                      <span className="font-medium text-purple-700">{g.name}</span>
                      <span className="text-purple-600">
                        {groupPlayers.length < 4
                          ? '인원 부족 (4명 이상 필요)'
                          : `${groupPlayers.length}명 · ${optRounds}라운드 · 인당 ${optGames}게임`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={onGenerate}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            {session.isGenerated ? '재생성' : '생성'}
          </button>
        </div>
      </div>
    </div>
  );
}
