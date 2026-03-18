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
  const partnerPenalty = getPartnerCount(history, p1.id, p2.id) * 3;
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

  for (let attempt = 0; attempt < 200; attempt++) {
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

  for (let attempt = 0; attempt < 200; attempt++) {
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
  mixedRounds: number; // 혼복 라운드 수 (처음 N라운드)
  sessionType: 'weekly' | 'quarterly';
  pastMatches: Match[];
}

export function generateMatches(options: GenerateOptions): Omit<Match, 'id'>[] {
  const { sessionId, courts, totalRounds, mixedRounds, sessionType, pastMatches } = options;
  const { players } = options;

  const history = buildHistory(pastMatches);
  const allMatches: Omit<Match, 'id'>[] = [];

  const allMales = players.filter(p => p.gender === 'male').sort((a, b) => b.ntrp - a.ntrp);
  const allFemales = players.filter(p => p.gender === 'female').sort((a, b) => b.ntrp - a.ntrp);

  // 휴식 순환 큐 (쉰 선수가 다음 라운드 우선 배정)
  let maleQueue = [...allMales];
  let femaleQueue = [...allFemales];

  for (let round = 1; round <= totalRounds; round++) {
    const roundMatches: Array<{ team1: Team; team2: Team; matchType: MatchType; court: number }> = [];
    let courtNum = 1;

    if (sessionType === 'quarterly') {
      // 분기대회: 홀수 라운드=남복, 짝수 라운드=여복 (코트 전체 단일 타입)
      const matchType: MatchType = round % 2 === 1 ? 'male' : 'female';
      const queue = matchType === 'male' ? maleQueue : femaleQueue;
      const activeCourts = Math.min(courts, Math.floor(queue.length / 4));
      if (activeCourts > 0) {
        const { matches, resting } = generateSameGenderRound(queue, history, activeCourts, matchType);
        for (const m of matches) {
          roundMatches.push({ ...m, court: courtNum++ });
        }
        const restIds = new Set(resting.map(p => p.id));
        if (matchType === 'male') {
          maleQueue = [...allMales.filter(p => restIds.has(p.id)), ...allMales.filter(p => !restIds.has(p.id))];
        } else {
          femaleQueue = [...allFemales.filter(p => restIds.has(p.id)), ...allFemales.filter(p => !restIds.has(p.id))];
        }
      }
    } else {
      // 주간 경기: 한 라운드 안에 남복+여복 코트가 동시에 돌아감
      const isMixedRound = round <= mixedRounds;

      if (isMixedRound) {
        // 혼복 라운드: 혼복 코트 최대화 (코트당 남2+여2 필요), 남는 남자는 남복
        const mixedCourtCount = Math.min(
          courts,
          Math.floor(maleQueue.length / 2),
          Math.floor(femaleQueue.length / 2),
        );

        if (mixedCourtCount > 0) {
          const { matches, restingMales, restingFemales } = generateMixedRound(
            maleQueue, femaleQueue, history, mixedCourtCount,
          );
          for (const m of matches) {
            roundMatches.push({ ...m, court: courtNum++ });
          }

          // 남은 남자 → 남복
          const maleCourtsCount = Math.floor(restingMales.length / 4);
          if (maleCourtsCount > 0) {
            const { matches: maleMatches, resting } = generateSameGenderRound(restingMales, history, maleCourtsCount, 'male');
            for (const m of maleMatches) {
              roundMatches.push({ ...m, court: courtNum++ });
            }
            const restIds = new Set(resting.map(p => p.id));
            const mixedMaleIds = new Set(maleQueue.slice(0, mixedCourtCount * 2).map(p => p.id));
            maleQueue = [
              ...allMales.filter(p => restIds.has(p.id)),
              ...allMales.filter(p => !restIds.has(p.id) && !mixedMaleIds.has(p.id)),
              ...allMales.filter(p => mixedMaleIds.has(p.id)),
            ];
          } else {
            const mixedMaleIds = new Set(maleQueue.slice(0, mixedCourtCount * 2).map(p => p.id));
            maleQueue = [
              ...allMales.filter(p => !mixedMaleIds.has(p.id)),
              ...allMales.filter(p => mixedMaleIds.has(p.id)),
            ];
          }

          // 남은 여자 → 여복
          const femaleCourtsCount = Math.floor(restingFemales.length / 4);
          if (femaleCourtsCount > 0) {
            const { matches: femaleMatches, resting } = generateSameGenderRound(restingFemales, history, femaleCourtsCount, 'female');
            for (const m of femaleMatches) {
              roundMatches.push({ ...m, court: courtNum++ });
            }
            const restIds = new Set(resting.map(p => p.id));
            const mixedFemaleIds = new Set(femaleQueue.slice(0, mixedCourtCount * 2).map(p => p.id));
            femaleQueue = [
              ...allFemales.filter(p => restIds.has(p.id)),
              ...allFemales.filter(p => !restIds.has(p.id) && !mixedFemaleIds.has(p.id)),
              ...allFemales.filter(p => mixedFemaleIds.has(p.id)),
            ];
          } else {
            const mixedFemaleIds = new Set(femaleQueue.slice(0, mixedCourtCount * 2).map(p => p.id));
            femaleQueue = [
              ...allFemales.filter(p => !mixedFemaleIds.has(p.id)),
              ...allFemales.filter(p => mixedFemaleIds.has(p.id)),
            ];
          }
        }
      } else {
        // 비혼복 라운드: 남자는 남복 + 여자는 여복 → 같은 라운드, 다른 코트에서 동시 진행
        const maleCourtsCount = Math.min(courts, Math.floor(maleQueue.length / 4));
        if (maleCourtsCount > 0) {
          const { matches, resting } = generateSameGenderRound(maleQueue, history, maleCourtsCount, 'male');
          for (const m of matches) {
            roundMatches.push({ ...m, court: courtNum++ });
          }
          const restIds = new Set(resting.map(p => p.id));
          maleQueue = [...allMales.filter(p => restIds.has(p.id)), ...allMales.filter(p => !restIds.has(p.id))];
        }

        const remainingCourts = courts - (courtNum - 1);
        const femaleCourtsCount = Math.min(remainingCourts, Math.floor(femaleQueue.length / 4));
        if (femaleCourtsCount > 0) {
          const { matches, resting } = generateSameGenderRound(femaleQueue, history, femaleCourtsCount, 'female');
          for (const m of matches) {
            roundMatches.push({ ...m, court: courtNum++ });
          }
          const restIds = new Set(resting.map(p => p.id));
          femaleQueue = [...allFemales.filter(p => restIds.has(p.id)), ...allFemales.filter(p => !restIds.has(p.id))];
        }
      }
    }

    for (const m of roundMatches) {
      allMatches.push({
        sessionId,
        round,
        court: m.court,
        matchType: m.matchType,
        team1: m.team1,
        team2: m.team2,
        isCompleted: false,
      });
    }
  }

  return allMatches;
}

export function getNextSunday(): string {
  const today = new Date();
  const day = today.getDay();
  const daysUntilSunday = day === 0 ? 7 : 7 - day;
  const sunday = new Date(today);
  sunday.setDate(today.getDate() + daysUntilSunday);
  return sunday.toISOString().split('T')[0];
}

export function getVotingDeadline(sessionDate: string, deadlineDay: 'friday' | 'saturday'): string {
  const date = new Date(sessionDate);
  const offset = deadlineDay === 'friday' ? -2 : -1;
  date.setDate(date.getDate() + offset);
  date.setHours(23, 59, 59, 0);
  return date.toISOString();
}

export function isVotingOpen(deadline: string): boolean {
  return new Date() < new Date(deadline);
}

export const NTRP_OPTIONS = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
