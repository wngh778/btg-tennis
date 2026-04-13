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
/**
 * 이미지를 최대 1200px, JPEG quality 0.75로 압축하여 base64 반환.
 * 브라우저 Canvas API 사용 — 폰 카메라 원본(5~8MB)을 Edge Function 제한 이내로 축소.
 */
async function compressImage(imageBase64: string, mediaType: string): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
    };
    img.onerror = reject;
    img.src = `data:${mediaType};base64,${imageBase64}`;
  });
}

export async function parseBracketImage(
  imageBase64: string,
  mediaType: string,
): Promise<ParsedBracket> {
  // 이미지 압축 (폰 카메라 원본이 너무 크면 Edge Function 요청 크기 제한 초과)
  const compressed = await compressImage(imageBase64, mediaType);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  const res = await fetch(`${supabaseUrl}/functions/v1/parse-bracket`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ imageBase64: compressed.base64, mediaType: compressed.mediaType }),
  });

  const data = await res.json() as { text?: string; error?: string };

  if (!res.ok || data?.error) {
    throw new Error(data?.error ?? `Edge Function 오류 (${res.status})`);
  }

  const text: string = data?.text ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.');

  const parsed = JSON.parse(jsonMatch[0]) as { players: ParsedPlayer[] };
  const rounds = Math.max(...parsed.players.map(p => p.courts.length), 0);

  return { players: parsed.players, rounds };
}

/**
 * 칠판에 쓰인 이름과 알려진 선수 목록을 매칭.
 * - 정확히 일치 우선
 * - 회원은 이름만(철수) / 게스트는 성+이름(김철수)으로 쓸 수 있으므로
 *   부분 포함 여부로 2차 매칭 (최소 2자 이상)
 */
function matchKnownPlayer(parsedName: string, knownPlayers: Player[]): Player | undefined {
  if (!parsedName) return undefined;

  // 1. 정확히 일치
  const exact = knownPlayers.find(p => p.name === parsedName);
  if (exact) return exact;

  // 2. DB 이름이 칠판 이름 안에 포함 (예: DB="철수", 칠판="김철수")
  const dbInParsed = knownPlayers.find(p => p.name.length >= 2 && parsedName.includes(p.name));
  if (dbInParsed) return dbInParsed;

  // 3. 칠판 이름이 DB 이름 안에 포함 (예: DB="김철수", 칠판="철수")
  const parsedInDb = knownPlayers.find(p => parsedName.length >= 2 && p.name.includes(parsedName));
  if (parsedInDb) return parsedInDb;

  return undefined;
}

/**
 * 파싱된 데이터 → Match 배열 변환.
 * 팀 배정은 임의(rotation=0)로 초기화되며 이후 팀 배정 UI에서 조정.
 * unmatchedPlayers: 회원 목록에 없어 새로 추가해야 할 선수 목록 (이름+성별)
 */
export function buildMatchesFromParsed(
  sessionId: string,
  parsed: ParsedBracket,
  knownPlayers: Player[],
): { matches: Omit<Match, 'id'>[]; unmatchedPlayers: { name: string; gender: 'male' | 'female' }[] } {
  const unmatchedSet = new Map<string, 'male' | 'female'>(); // name → gender
  const cache = new Map<string, Player>();

  const resolvePlayer = (name: string, gender: 'male' | 'female'): Player => {
    if (cache.has(name)) return cache.get(name)!;
    const found = matchKnownPlayer(name, knownPlayers);
    const player: Player = found ?? { id: `img_${name}`, name, gender, ntrp: 3.0, type: 'guest' };
    if (!found) unmatchedSet.set(name, gender);
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
  const unmatchedPlayers = Array.from(unmatchedSet.entries()).map(([name, gender]) => ({ name, gender }));
  return { matches: allMatches, unmatchedPlayers };
}
