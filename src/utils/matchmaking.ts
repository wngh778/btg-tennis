import type { Player, Match, Team, MatchType } from '../types';

interface PairingHistory {
  partnerCount: Map<string, number>;
  opponentCount: Map<string, number>;
}

type PlayerHistory = Map<string, PairingHistory>;

function buildHistory(pastMatches: Match[]): PlayerHistory {
  const history: PlayerHistory = new Map();

  const ensurePlayer = (id: string) => {
    if (!history.has(id)) {
      history.set(id, { partnerCount: new Map(), opponentCount: new Map() });
    }
    return history.get(id)!;
  };

  for (const match of pastMatches) {
    const players = [
      match.team1.player1,
      match.team1.player2,
      match.team2.player1,
      match.team2.player2,
    ];

    const addPartner = (p1: Player, p2: Player) => {
      const h1 = ensurePlayer(p1.id);
      const h2 = ensurePlayer(p2.id);
      h1.partnerCount.set(p2.id, (h1.partnerCount.get(p2.id) || 0) + 1);
      h2.partnerCount.set(p1.id, (h2.partnerCount.get(p1.id) || 0) + 1);
    };

    const addOpponent = (p1: Player, p2: Player) => {
      const h1 = ensurePlayer(p1.id);
      const h2 = ensurePlayer(p2.id);
      h1.opponentCount.set(p2.id, (h1.opponentCount.get(p2.id) || 0) + 1);
      h2.opponentCount.set(p1.id, (h2.opponentCount.get(p1.id) || 0) + 1);
    };

    addPartner(match.team1.player1, match.team1.player2);
    addPartner(match.team2.player1, match.team2.player2);

    for (const t1p of [match.team1.player1, match.team1.player2]) {
      for (const t2p of [match.team2.player1, match.team2.player2]) {
        addOpponent(t1p, t2p);
      }
    }

    players.forEach(p => ensurePlayer(p.id));
  }

  return history;
}

function getPartnerCount(history: PlayerHistory, id1: string, id2: string): number {
  return history.get(id1)?.partnerCount.get(id2) || 0;
}

function getOpponentCount(history: PlayerHistory, id1: string, id2: string): number {
  return history.get(id1)?.opponentCount.get(id2) || 0;
}

function pairScore(history: PlayerHistory, p1: Player, p2: Player): number {
  const partnerPenalty = getPartnerCount(history, p1.id, p2.id) * 10000;
  const ntrpDiff = Math.abs(p1.ntrp - p2.ntrp);
  return partnerPenalty + ntrpDiff;
}

function matchScore(history: PlayerHistory, team1: Team, team2: Team): number {
  const pairScore1 = pairScore(history, team1.player1, team1.player2);
  const pairScore2 = pairScore(history, team2.player1, team2.player2);

  const team1Ntrp = team1.player1.ntrp + team1.player2.ntrp;
  const team2Ntrp = team2.player1.ntrp + team2.player2.ntrp;
  const ntrpBalance = Math.abs(team1Ntrp - team2Ntrp) * 2;

  let opponentPenalty = 0;
  for (const p1 of [team1.player1, team1.player2]) {
    for (const p2 of [team2.player1, team2.player2]) {
      opponentPenalty += getOpponentCount(history, p1.id, p2.id);
    }
  }

  return pairScore1 + pairScore2 + ntrpBalance + opponentPenalty;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function updateHistory(history: PlayerHistory, matches: Array<{ team1: Team; team2: Team }>) {
  for (const m of matches) {
    const update = (p1: Player, p2: Player, type: 'partner' | 'opponent') => {
      if (!history.has(p1.id)) history.set(p1.id, { partnerCount: new Map(), opponentCount: new Map() });
      if (!history.has(p2.id)) history.set(p2.id, { partnerCount: new Map(), opponentCount: new Map() });
      const h1 = history.get(p1.id)!;
      const h2 = history.get(p2.id)!;
      if (type === 'partner') {
        h1.partnerCount.set(p2.id, (h1.partnerCount.get(p2.id) || 0) + 1);
        h2.partnerCount.set(p1.id, (h2.partnerCount.get(p1.id) || 0) + 1);
      } else {
        h1.opponentCount.set(p2.id, (h1.opponentCount.get(p2.id) || 0) + 1);
        h2.opponentCount.set(p1.id, (h2.opponentCount.get(p1.id) || 0) + 1);
      }
    };
    update(m.team1.player1, m.team1.player2, 'partner');
    update(m.team2.player1, m.team2.player2, 'partner');
    [m.team1.player1, m.team1.player2].forEach(p1 =>
      [m.team2.player1, m.team2.player2].forEach(p2 => update(p1, p2, 'opponent'))
    );
  }
}

// 단성 라운드 생성 (남복 또는 여복)
function generateSameGenderRound(
  players: Player[],
  history: PlayerHistory,
  courts: number,
  matchType: MatchType,
): { matches: Array<{ team1: Team; team2: Team; matchType: MatchType }>; resting: Player[] } {
  const playing = players.slice(0, courts * 4);
  const resting = players.slice(courts * 4);

  let bestScore = Infinity;
  let bestMatches: Array<{ team1: Team; team2: Team; matchType: MatchType }> = [];

  for (let attempt = 0; attempt < 500; attempt++) {
    const shuffled = shuffle(playing);
    const matches: Array<{ team1: Team; team2: Team; matchType: MatchType }> = [];
    let totalScore = 0;

    for (let c = 0; c < courts; c++) {
      const [p1, p2, p3, p4] = shuffled.slice(c * 4, c * 4 + 4);
      const team1: Team = { player1: p1, player2: p2 };
      const team2: Team = { player1: p3, player2: p4 };
      totalScore += matchScore(history, team1, team2);
      matches.push({ team1, team2, matchType });
    }

    if (totalScore < bestScore) {
      bestScore = totalScore;
      bestMatches = matches;
    }
  }

  updateHistory(history, bestMatches);
  return { matches: bestMatches, resting };
}

// 혼복 라운드 생성 - 각 팀은 반드시 남1+여1
function generateMixedRound(
  males: Player[],
  females: Player[],
  history: PlayerHistory,
  courts: number,
): { matches: Array<{ team1: Team; team2: Team; matchType: MatchType }>; restingMales: Player[]; restingFemales: Player[] } {
  const malesPlaying = males.slice(0, courts * 2);
  const femalesPlaying = females.slice(0, courts * 2);
  const restingMales = males.slice(courts * 2);
  const restingFemales = females.slice(courts * 2);

  let bestScore = Infinity;
  let bestMatches: Array<{ team1: Team; team2: Team; matchType: MatchType }> = [];

  for (let attempt = 0; attempt < 500; attempt++) {
    const shuffledM = shuffle(malesPlaying);
    const shuffledF = shuffle(femalesPlaying);
    const matches: Array<{ team1: Team; team2: Team; matchType: MatchType }> = [];
    let totalScore = 0;

    for (let c = 0; c < courts; c++) {
      const m1 = shuffledM[c * 2];
      const m2 = shuffledM[c * 2 + 1];
      const f1 = shuffledF[c * 2];
      const f2 = shuffledF[c * 2 + 1];
      // 각 팀: 남1 + 여1
      const team1: Team = { player1: m1, player2: f1 };
      const team2: Team = { player1: m2, player2: f2 };
      totalScore += matchScore(history, team1, team2);
      matches.push({ team1, team2, matchType: 'mixed' });
    }

    if (totalScore < bestScore) {
      bestScore = totalScore;
      bestMatches = matches;
    }
  }

  updateHistory(history, bestMatches);
  return { matches: bestMatches, restingMales, restingFemales };
}

export interface GenerateOptions {
  sessionId: string;
  players: Player[];
  courts: number;
  totalRounds: number;
  mixedRounds: number; // 혼복 라운드 수
  mixedLast?: boolean; // true면 남복/여복 먼저, 혼복 나중 배치 (기본: 혼복 먼저)
  sessionType: 'weekly' | 'quarterly';
  pastMatches: Match[];
  latePlayerIds?: Set<string>; // 지각자 ID 집합 - 1라운드 제외
}

export function generateMatches(options: GenerateOptions): Omit<Match, 'id'>[] {
  const { sessionId, courts, totalRounds, mixedRounds, mixedLast = false, sessionType, pastMatches } = options;
  const { players, latePlayerIds = new Set<string>() } = options;

  const history = buildHistory(pastMatches);
  const allMatches: Omit<Match, 'id'>[] = [];

  const males = players.filter(p => p.gender === 'male');
  const females = players.filter(p => p.gender === 'female');

  // 게임 횟수 추적 - 적게 뛴 선수 우선 배정
  const gameCounts = new Map<string, number>();
  players.forEach(p => gameCounts.set(p.id, 0));

  // 게임 횟수 적은 순 정렬 (동점이면 랜덤), 1라운드는 지각자 후순위
  const byLeastGames = (arr: Player[], round: number): Player[] =>
    [...arr].sort((a, b) => {
      if (round === 1 && latePlayerIds.size > 0) {
        const aLate = latePlayerIds.has(a.id) ? 1 : 0;
        const bLate = latePlayerIds.has(b.id) ? 1 : 0;
        if (aLate !== bLate) return aLate - bLate;
      }
      const d = (gameCounts.get(a.id) || 0) - (gameCounts.get(b.id) || 0);
      return d !== 0 ? d : Math.random() - 0.5;
    });

  const addGames = (ps: Player[]) =>
    ps.forEach(p => gameCounts.set(p.id, (gameCounts.get(p.id) || 0) + 1));

  for (let round = 1; round <= totalRounds; round++) {
    const roundMatches: Array<{ team1: Team; team2: Team; matchType: MatchType; court: number }> = [];
    let courtNum = 1;

    if (sessionType === 'quarterly') {
      const matchType: MatchType = round % 2 === 1 ? 'male' : 'female';
      const pool = byLeastGames(matchType === 'male' ? males : females, round);
      const activeCourts = Math.min(courts, Math.floor(pool.length / 4));
      if (activeCourts > 0) {
        const playing = pool.slice(0, activeCourts * 4);
        const { matches } = generateSameGenderRound(playing, history, activeCourts, matchType);
        matches.forEach(m => roundMatches.push({ ...m, court: courtNum++ }));
        addGames(playing);
      }
    } else {
      // mixedLast=true면 뒤쪽 N라운드가 혼복, 앞쪽이 남복/여복
      const isMixed = mixedLast
        ? round > totalRounds - mixedRounds
        : round <= mixedRounds;

      if (isMixed) {
        const sm = byLeastGames(males, round);
        const sf = byLeastGames(females, round);
        const mixedCourts = Math.min(courts, Math.floor(sm.length / 2), Math.floor(sf.length / 2));

        const mixedMaleIds = new Set<string>();
        const mixedFemaleIds = new Set<string>();

        if (mixedCourts > 0) {
          const mixedM = sm.slice(0, mixedCourts * 2);
          const mixedF = sf.slice(0, mixedCourts * 2);
          mixedM.forEach(p => mixedMaleIds.add(p.id));
          mixedF.forEach(p => mixedFemaleIds.add(p.id));
          const { matches: mx } = generateMixedRound(mixedM, mixedF, history, mixedCourts);
          mx.forEach(m => roundMatches.push({ ...m, court: courtNum++ }));
          addGames([...mixedM, ...mixedF]);
        }

        // 남은 남자 → 남복 (남은 코트 수 제한)
        const remMales = byLeastGames(males.filter(p => !mixedMaleIds.has(p.id)), round);
        const maleCourts = Math.min(courts - mixedCourts, Math.floor(remMales.length / 4));
        if (maleCourts > 0) {
          const playing = remMales.slice(0, maleCourts * 4);
          const { matches } = generateSameGenderRound(playing, history, maleCourts, 'male');
          matches.forEach(m => roundMatches.push({ ...m, court: courtNum++ }));
          addGames(playing);
        }

        // 남은 여자 → 여복 (남은 코트 수 제한)
        const remFemales = byLeastGames(females.filter(p => !mixedFemaleIds.has(p.id)), round);
        const femaleCourts = Math.min(courts - mixedCourts - maleCourts, Math.floor(remFemales.length / 4));
        if (femaleCourts > 0) {
          const playing = remFemales.slice(0, femaleCourts * 4);
          const { matches } = generateSameGenderRound(playing, history, femaleCourts, 'female');
          matches.forEach(m => roundMatches.push({ ...m, court: courtNum++ }));
          addGames(playing);
        }
      } else {
        // 비혼복 라운드: 남복 + 여복 동시 진행
        const sm = byLeastGames(males, round);
        const maleCourts = Math.min(courts, Math.floor(sm.length / 4));
        if (maleCourts > 0) {
          const playing = sm.slice(0, maleCourts * 4);
          const { matches } = generateSameGenderRound(playing, history, maleCourts, 'male');
          matches.forEach(m => roundMatches.push({ ...m, court: courtNum++ }));
          addGames(playing);
        }

        const sf = byLeastGames(females, round);
        const femaleCourts = Math.min(courts - (courtNum - 1), Math.floor(sf.length / 4));
        if (femaleCourts > 0) {
          const playing = sf.slice(0, femaleCourts * 4);
          const { matches } = generateSameGenderRound(playing, history, femaleCourts, 'female');
          matches.forEach(m => roundMatches.push({ ...m, court: courtNum++ }));
          addGames(playing);
        }
      }
    }

    for (const m of roundMatches) {
      allMatches.push({
        sessionId, round, court: m.court,
        matchType: m.matchType,
        team1: m.team1, team2: m.team2,
        isCompleted: false,
      });
    }
  }

  return allMatches;
}

const DAY_MAP: Record<string, number> = {
  '일요일': 0, '월요일': 1, '화요일': 2, '수요일': 3,
  '목요일': 4, '금요일': 5, '토요일': 6,
};

export function getNextDay(dayOfWeek: string = '일요일'): string {
  const target = DAY_MAP[dayOfWeek] ?? 0;
  const today = new Date();
  const current = today.getDay();
  const daysUntil = current === target ? 7 : (target - current + 7) % 7;
  const next = new Date(today);
  next.setDate(today.getDate() + daysUntil);
  return next.toISOString().split('T')[0];
}

export function getNextSunday(): string {
  return getNextDay('일요일');
}

export function isVotingOpen(deadline: string | null): boolean {
  if (deadline === null) return true; // 마감 없음 = 항상 열림
  return new Date() < new Date(deadline);
}

export const NTRP_OPTIONS = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

// 최대공약수
function gcd(a: number, b: number): number {
  while (b > 0) { [a, b] = [b, a % b]; }
  return a;
}

/**
 * 주간 경기에서 남녀 경기수 예상치를 계산.
 * byLeastGames 정렬로 인해 슬롯이 균등 분배된다고 가정.
 */
export function calculateExpectedGames(
  maleCount: number,
  femaleCount: number,
  courts: number,
  totalRounds: number,
  mixedRounds: number,
): { maleAvg: number; femaleAvg: number } {
  if (maleCount === 0 && femaleCount === 0) return { maleAvg: 0, femaleAvg: 0 };

  // 혼복 라운드 1회당 슬롯 계산
  const mixedCourts = Math.min(courts, Math.floor(maleCount / 2), Math.floor(femaleCount / 2));
  const malesInMixed = mixedCourts * 2;
  const femalesInMixed = mixedCourts * 2;
  const remCourtsAfterMixed = courts - mixedCourts;
  const maleCourtsInMixed = Math.min(remCourtsAfterMixed, Math.floor((maleCount - malesInMixed) / 4));
  const femaleCourtsInMixed = Math.min(
    remCourtsAfterMixed - maleCourtsInMixed,
    Math.floor((femaleCount - femalesInMixed) / 4),
  );
  const maleSlotsPerMixed = malesInMixed + maleCourtsInMixed * 4;
  const femaleSlotsPerMixed = femalesInMixed + femaleCourtsInMixed * 4;

  // 비혼복 라운드 1회당 슬롯 계산
  const maleCourtsPerPure = Math.min(courts, Math.floor(maleCount / 4));
  const maleSlotsPerPure = maleCourtsPerPure * 4;
  const femaleCourtsPerPure = Math.min(courts - maleCourtsPerPure, Math.floor(femaleCount / 4));
  const femaleSlotsPerPure = femaleCourtsPerPure * 4;

  const pureRounds = totalRounds - mixedRounds;
  const totalMaleSlots = mixedRounds * maleSlotsPerMixed + pureRounds * maleSlotsPerPure;
  const totalFemaleSlots = mixedRounds * femaleSlotsPerMixed + pureRounds * femaleSlotsPerPure;

  return {
    maleAvg: maleCount > 0 ? totalMaleSlots / maleCount : 0,
    femaleAvg: femaleCount > 0 ? totalFemaleSlots / femaleCount : 0,
  };
}

/**
 * 남녀 경기수 차이가 1 이하가 되는 최소 혼복 라운드 수를 탐색.
 * 균형을 맞출 수 없으면 totalRounds(최대값) 반환.
 */
export function findOptimalMixedRounds(
  maleCount: number,
  femaleCount: number,
  courts: number,
  totalRounds: number,
): number {
  for (let mx = 0; mx <= totalRounds; mx++) {
    const { maleAvg, femaleAvg } = calculateExpectedGames(maleCount, femaleCount, courts, totalRounds, mx);
    if (Math.abs(maleAvg - femaleAvg) <= 1) return mx;
  }
  return totalRounds; // 완전 균형 불가 시 최대값 반환
}

/**
 * 조별경기에서 모든 인원이 같은 게임수를 갖는 최적 라운드 수를 계산.
 * maxRounds 이하에서 "인원당 게임수"가 정수가 되는 최대 라운드 반환.
 * 불가능하면(step > maxRounds) maxRounds 그대로 반환 (최대한 같게).
 */
export function calcOptimalGroupRounds(playerCount: number, courts: number, maxRounds: number): number {
  const activeCourts = Math.min(courts, Math.floor(playerCount / 4));
  if (activeCourts === 0 || playerCount < 4) return 0;
  const playing = activeCourts * 4;
  if (playing >= playerCount) return maxRounds; // 전원 매 라운드 출전 → 어떤 라운드수든 동일
  const step = playerCount / gcd(playerCount, playing); // 균등해지는 최소 라운드 단위
  const opt = Math.floor(maxRounds / step) * step;
  return opt > 0 ? opt : maxRounds; // step > maxRounds이면 best-effort
}

// 조별경기 페어 스코어 - 중복 페어 패널티를 매우 크게 설정
const REPEAT_PARTNER_PENALTY = 10000;

function groupPairScore(history: PlayerHistory, p1: Player, p2: Player): number {
  return getPartnerCount(history, p1.id, p2.id) * REPEAT_PARTNER_PENALTY;
}

function groupMatchScore(history: PlayerHistory, team1: Team, team2: Team): number {
  const ps1 = groupPairScore(history, team1.player1, team1.player2);
  const ps2 = groupPairScore(history, team2.player1, team2.player2);
  let opPenalty = 0;
  for (const p1 of [team1.player1, team1.player2]) {
    for (const p2 of [team2.player1, team2.player2]) {
      opPenalty += getOpponentCount(history, p1.id, p2.id);
    }
  }
  return ps1 + ps2 + opPenalty;
}

export interface GroupGenerateOptions {
  sessionId: string;
  groupId: string;
  players: Player[];
  courts: number;
  totalRounds: number;
}

export function generateGroupMatches(options: GroupGenerateOptions): Omit<Match, 'id'>[] {
  const { sessionId, groupId, players, courts, totalRounds } = options;
  if (players.length < 4) return [];

  // 1) 최적 라운드 수 자동 계산 (균등 게임수 보장)
  const optimalRounds = calcOptimalGroupRounds(players.length, courts, totalRounds);
  const actualRounds = optimalRounds > 0 ? optimalRounds : totalRounds;

  const history: PlayerHistory = new Map();
  const gameCounts = new Map<string, number>();
  players.forEach(p => gameCounts.set(p.id, 0));

  const allMatches: Omit<Match, 'id'>[] = [];

  for (let round = 1; round <= actualRounds; round++) {
    const activeCourts = Math.min(courts, Math.floor(players.length / 4));
    if (activeCourts === 0) continue;

    // 게임수 적은 순 → 이번 라운드 출전자 선정
    const sorted = [...players].sort((a, b) => {
      const diff = (gameCounts.get(a.id) || 0) - (gameCounts.get(b.id) || 0);
      return diff !== 0 ? diff : Math.random() - 0.5;
    });
    const playing = sorted.slice(0, activeCourts * 4);

    let bestScore = Infinity;
    let bestMatches: Array<{ team1: Team; team2: Team }> = [];

    // 2) 충분한 시도로 중복 페어 최소화
    for (let attempt = 0; attempt < 500; attempt++) {
      const shuffled = shuffle(playing);
      const roundMatches: Array<{ team1: Team; team2: Team }> = [];
      let totalScore = 0;
      for (let c = 0; c < activeCourts; c++) {
        const [p1, p2, p3, p4] = shuffled.slice(c * 4, c * 4 + 4);
        const t1: Team = { player1: p1, player2: p2 };
        const t2: Team = { player1: p3, player2: p4 };
        totalScore += groupMatchScore(history, t1, t2);
        roundMatches.push({ team1: t1, team2: t2 });
      }
      if (totalScore < bestScore) {
        bestScore = totalScore;
        bestMatches = roundMatches;
      }
      // 중복 페어 없는 완벽한 조합 찾으면 조기 종료
      if (bestScore < REPEAT_PARTNER_PENALTY) break;
    }

    updateHistory(history, bestMatches);
    playing.forEach(p => gameCounts.set(p.id, (gameCounts.get(p.id) || 0) + 1));

    bestMatches.forEach((m, i) => {
      const allPlayers = [m.team1.player1, m.team1.player2, m.team2.player1, m.team2.player2];
      const maleCount = allPlayers.filter(p => p.gender === 'male').length;
      const matchType: MatchType = maleCount === 4 ? 'male' : maleCount === 0 ? 'female' : 'mixed';
      allMatches.push({
        sessionId,
        groupId,
        round,
        court: i + 1,
        matchType,
        team1: m.team1,
        team2: m.team2,
        isCompleted: false,
      });
    });
  }

  return allMatches;
}
