import type { Match, Player, MatchType } from '../types';

// Claude Vision API가 반환하는 선수별 파싱 결과
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
 * 칠판 대진표 사진을 Claude Vision API로 파싱.
 * - 왼쪽 열: 남자 선수 (gender: "male")
 * - 오른쪽 열: 여자 선수 (gender: "female")
 * - 각 행: 이름 + 라운드별 코트번호 (숫자=코트, -=휴식)
 */
export async function parseBracketImage(
  imageBase64: string,
  mediaType: string,
): Promise<ParsedBracket> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Anthropic API 키가 설정되지 않았습니다. 관리자에게 문의하세요.');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-calls': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageBase64 },
          },
          {
            type: 'text',
            text: `테니스 대진표가 적힌 칠판 사진입니다.
규칙:
- 왼쪽 열: 남자 선수 → gender: "male"
- 오른쪽 열: 여자 선수 → gender: "female"
- 각 행 형식: 선수이름 + 라운드별 코트번호 (공백으로 구분)
- 숫자(1~4): 해당 라운드 배정 코트번호
- 하이픈(-): 해당 라운드 휴식 → null

아래 JSON 형식으로만 응답해주세요 (설명 없이, JSON만):
{"players":[{"name":"이름","gender":"male","courts":[1,2,null,3,1]},{"name":"이름","gender":"female","courts":[3,null,3,2,3]}]}`,
          },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = (err as { error?: { message?: string } })?.error?.message;
    throw new Error(msg || `API 오류 (${response.status})`);
  }

  const data = await response.json() as { content: { text: string }[] };
  const text = data.content[0].text.trim();

  // JSON 블록 추출 (마크다운 코드블록 또는 순수 JSON)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.');

  const parsed = JSON.parse(jsonMatch[0]) as { players: ParsedPlayer[] };
  const rounds = Math.max(...parsed.players.map(p => p.courts.length), 0);

  return { players: parsed.players, rounds };
}

/**
 * 파싱된 칠판 데이터 → Match 배열 변환.
 * knownPlayers: 현재 세션 참석자(또는 전체 멤버+게스트) 목록으로 이름 매칭.
 * 매칭 실패 시 임시 guest Player 생성 (id: "img_이름").
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

    // 정확히 일치 → 이름 포함 관계 순으로 매칭
    const found =
      knownPlayers.find(p => p.name === name) ||
      knownPlayers.find(p => p.name.includes(name) || name.includes(p.name));

    const player: Player = found ?? {
      id: `img_${name}`,
      name,
      gender,
      ntrp: 3.0,
      type: 'guest',
    };

    if (!found) unmatchedNames.push(name);
    cache.set(name, player);
    return player;
  };

  const allMatches: Omit<Match, 'id'>[] = [];

  for (let round = 1; round <= parsed.rounds; round++) {
    // 코트번호별로 선수 그룹핑
    const courtMap = new Map<number, ParsedPlayer[]>();
    for (const p of parsed.players) {
      const court = p.courts[round - 1];
      if (court != null) {
        if (!courtMap.has(court)) courtMap.set(court, []);
        courtMap.get(court)!.push(p);
      }
    }

    for (const [court, group] of courtMap.entries()) {
      if (group.length !== 4) continue; // 4명이 아니면 스킵

      const resolved = group.map(p => resolvePlayer(p.name, p.gender));
      const maleCount = resolved.filter(p => p.gender === 'male').length;
      const matchType: MatchType =
        maleCount === 4 ? 'male' : maleCount === 0 ? 'female' : 'mixed';

      let t1p1: Player, t1p2: Player, t2p1: Player, t2p2: Player;

      if (matchType === 'mixed') {
        // 혼복: 남1+여1 vs 남1+여1
        const males = resolved.filter(p => p.gender === 'male');
        const females = resolved.filter(p => p.gender === 'female');
        t1p1 = males[0]; t1p2 = females[0];
        t2p1 = males[1]; t2p2 = females[1];
      } else {
        // 남복/여복: 앞 2명 vs 뒤 2명 (임의 - 실제 팀은 게임 전 결정)
        [t1p1, t1p2, t2p1, t2p2] = resolved as [Player, Player, Player, Player];
      }

      allMatches.push({
        sessionId,
        round,
        court,
        matchType,
        team1: { player1: t1p1, player2: t1p2 },
        team2: { player1: t2p1, player2: t2p2 },
        isCompleted: false,
      });
    }
  }

  // 라운드 → 코트 순 정렬
  allMatches.sort((a, b) => a.round - b.round || a.court - b.court);

  return { matches: allMatches, unmatchedNames: [...new Set(unmatchedNames)] };
}
