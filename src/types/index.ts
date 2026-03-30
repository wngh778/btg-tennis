export type Gender = 'male' | 'female';

export interface Club {
  id: string;
  name: string;
  defaultCourts: number;
  color: string;
  dayOfWeek: string;
  createdAt: Date;
}

export interface Member {
  id: string;
  clubId: string;
  name: string;
  gender: Gender;
  ntrp: number; // 2.0 ~ 5.0, step 0.5
  isActive: boolean;
  createdAt: Date;
}

export interface Guest {
  id: string;
  name: string;
  gender: Gender;
  ntrp: number;
  sessionId: string;
}

export type SessionType = 'weekly' | 'quarterly';
export type GameMode = 'normal' | 'group';

export interface Session {
  id: string;
  clubId: string;
  date: string; // YYYY-MM-DD
  type: SessionType;
  gameMode: GameMode;
  courts: number; // default 4
  rounds: number; // default 6
  mixedRounds: number; // 혼복 라운드 수 (weekly only)
  votingDeadline: string | null; // ISO date string, null = 마감 없음
  isGenerated: boolean;
  isConfirmed: boolean;
  trackLate: boolean; // 지각여부 추적 여부
  createdAt: Date;
}

export interface SessionGroup {
  id: string;
  sessionId: string;
  name: string;
  orderNum: number;
  memberIds: string[];
  createdAt: Date;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  playerId: string; // member id or guest id
  playerType: 'member' | 'guest';
  playerName: string;
  gender: Gender;
  ntrp: number;
  attending: boolean;
  isLate?: boolean; // 지각 여부 (true=지각, false=정시, undefined=미응답)
  updatedAt: Date;
}

export type MatchType = 'male' | 'female' | 'mixed';

export interface Player {
  id: string;
  name: string;
  gender: Gender;
  ntrp: number;
  type: 'member' | 'guest';
}

export interface Team {
  player1: Player;
  player2: Player;
}

export interface Match {
  id: string;
  sessionId: string;
  round: number;
  court: number;
  matchType: MatchType;
  team1: Team;
  team2: Team;
  score1?: string; // e.g. "6"
  score2?: string;
  isCompleted: boolean;
  groupId?: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export interface AppUser {
  id: string;
  username: string;
  role: 'superadmin' | 'admin' | 'member';
  clubIds: string[];
  defaultClubId: string | null;
  createdAt: Date;
}

export interface MatchHistory {
  playerId: string;
  partnerIds: string[]; // people played as partner
  opponentIds: string[]; // people played as opponent
}
