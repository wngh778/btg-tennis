import { getSessions, addSession } from '../lib/database';
import { getNextDay } from './matchmaking';
import type { Club, Session } from '../types';

/**
 * 자동 세션 생성: 최신 세션 날짜가 지났고, 다음 주 세션이 없으면 자동 생성
 * @returns 새로 생성된 세션 ID 또는 null
 */
export async function checkAndAutoCreateSession(club: Club): Promise<string | null> {
  if (!club.autoCreateSession) return null;

  const sessions = await getSessions(club.id);
  if (sessions.length === 0) return null;

  // 최신 세션 (날짜 기준 내림차순)
  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0];

  const today = new Date().toISOString().split('T')[0];
  if (latest.date >= today) return null; // 아직 최신 세션이 지나지 않음

  // 다음 세션 날짜 계산
  const nextDate = getNextDay(club.dayOfWeek);

  // 이미 해당 날짜에 세션이 있으면 중복 방지
  if (sessions.some(s => s.date === nextDate)) return null;

  // 이전 세션의 투표 마감일 오프셋 계산 (세션 날짜 기준 며칠 전인지)
  let deadlineOffset = 1; // 기본 1일 전
  if (latest.votingDeadline) {
    const sessionMs = new Date(latest.date + 'T00:00:00').getTime();
    const deadlineMs = new Date(latest.votingDeadline).getTime();
    deadlineOffset = Math.max(0, Math.round((sessionMs - deadlineMs) / (1000 * 60 * 60 * 24)));
  }

  const deadlineDate = new Date(nextDate + 'T00:00:00');
  deadlineDate.setDate(deadlineDate.getDate() - deadlineOffset);
  const votingDeadline = new Date(`${deadlineDate.toISOString().split('T')[0]}T23:59:00`).toISOString();

  const newSession: Omit<Session, 'id' | 'createdAt'> = {
    clubId: club.id,
    date: nextDate,
    title: null,
    type: latest.type,
    gameMode: latest.gameMode,
    courts: latest.courts,
    rounds: latest.rounds,
    mixedRounds: latest.mixedRounds,
    votingDeadline,
    isGenerated: false,
    isConfirmed: false,
    trackLate: latest.trackLate,
  };

  return await addSession(newSession);
}
