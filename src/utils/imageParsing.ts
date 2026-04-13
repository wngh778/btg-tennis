import { supabase } from '../lib/supabase';
import type { Match, Player, MatchType } from '../types';

export interface ParsedPlayer {
  name: string;
  gender: 'male' | 'female';
  courts: (number | null)[]; // index = round-1, null = 휴식
}

export interface ParsedBracket {
  players: ParsedPlayer[];
  rounds: number;
}

/**
 * 칠판 대진표 사진을 Supabase Edge Function(parse-bracket)을 통해 파싱.
 * - API 키는 서버사이드에만 존재 (GEMINI_API_KEY Supabase secret)
 * - 왼쪽 열: 남자 / 오른쪽 열: 여자 / 숫자: 코트번호 / -: 휴식
 */
export async function parseBracketImage(
  imageBase64: string,
  mediaType: string,
): Promise<ParsedBracket> {
  const { data, error } = await supabase.functions.invoke('parse-bracket', {
    body: { imageBase64, mediaType },
  });

  if (error) throw new Error(`대진표 인식 실패: ${error.message}`);
  if (data?.error) throw new Error(data.error);

  const text: string = data?.text ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.');

  const parsed = JSON.parse(jsonMatch[0]) as { players: ParsedPlayer[] };
  const rounds = Math.max(...parsed.players.map(p => p.courts.length), 0);

  return { players: parsed.players, rounds };
}

/**
 * 파싱된 데이터 → Match 배열 변환.
 * 팀 배정은 임의(rotation=0)로 초기화되며 이후 팀 배정 UI에서 조정.
 */
export function buildMatchesFromParsed(
  sessionId: string,
  parsed: ParsedBracket,
  knownPlayers: Player[],
): { matches: Omit<Match, 'id'>[]; unmatchedNames: string[] } {
  const unmatchedNames: string[] = [];
  const cache = new Map<string, Player>();

  const resolvePlayer = (name: string, gender: 'male' | 'female'): Player => {
    if (cache.has(name)) return cache.get(name)!;
    const found =
      knownPlayers.find(p => p.name === name) ||
      knownPlayers.find(p => p.name.includes(name) || name.includes(p.name));
    const player: Player = found ?? { id: `img_${name}`, name, gender, ntrp: 3.0, type: 'guest' };
    if (!found) unmatchedNames.push(name);
    cache.set(name, player);
    return player;
  };

  const allMatches: Omit<Match, 'id'>[] = [];

  for (let round = 1; round <= parsed.rounds; round++) {
    const courtMap = new Map<number, ParsedPlayer[]>();
    for (const p of parsed.players) {
      const court = p.courts[round - 1];
      if (court != null) {
        if (!courtMap.has(court)) courtMap.set(court, []);
        courtMap.get(court)!.push(p);
      }
    }

    for (const [court, group] of courtMap.entries()) {
      if (group.length !== 4) continue;

      const resolved = group.map(p => resolvePlayer(p.name, p.gender));
      const maleCount = resolved.filter(p => p.gender === 'male').length;
      const matchType: MatchType =
        maleCount === 4 ? 'male' : maleCount === 0 ? 'female' : 'mixed';

      // 초기 배정 (rotation=0): 실제 팀은 팀 배정 UI에서 결정
      let t1p1: Player, t1p2: Player, t2p1: Player, t2p2: Player;
      if (matchType === 'mixed') {
        const males = resolved.filter(p => p.gender === 'male');
        const females = resolved.filter(p => p.gender === 'female');
        t1p1 = males[0]; t1p2 = females[0];
        t2p1 = males[1]; t2p2 = females[1];
      } else {
        [t1p1, t1p2, t2p1, t2p2] = resolved as [Player, Player, Player, Player];
      }

      allMatches.push({
        sessionId, round, court, matchType,
        team1: { player1: t1p1, player2: t1p2 },
        team2: { player1: t2p1, player2: t2p2 },
        isCompleted: false,
      });
    }
  }

  allMatches.sort((a, b) => a.round - b.round || a.court - b.court);
  return { matches: allMatches, unmatchedNames: [...new Set(unmatchedNames)] };
}
