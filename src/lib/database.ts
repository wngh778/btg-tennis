import { supabase } from './supabase';
import { supabaseAdmin } from './supabaseAdmin';
import type { Club, Member, Session, AttendanceRecord, Match, Guest, AppUser } from '../types';

// username → email conversion (same as before)
export function usernameToEmail(username: string): string {
  const bytes = new TextEncoder().encode(username.trim());
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  const b64 = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `u${b64}@btg-app.com`;
}

// --- Clubs ---
function rowToClub(row: Record<string, unknown>): Club {
  return {
    id: row.id as string,
    name: row.name as string,
    defaultCourts: row.default_courts as number,
    createdAt: new Date(row.created_at as string),
  };
}

export async function getClubs(): Promise<Club[]> {
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map(rowToClub);
}

export async function getClub(id: string): Promise<Club | null> {
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data ? rowToClub(data) : null;
}

export async function getClubsByIds(ids: string[]): Promise<Club[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .in('id', ids)
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map(rowToClub);
}

export async function addClub(data: { name: string; defaultCourts: number }): Promise<string> {
  const { data: inserted, error } = await supabase
    .from('clubs')
    .insert({ name: data.name, default_courts: data.defaultCourts })
    .select('id')
    .single();
  if (error) throw error;
  return inserted.id;
}

export async function updateClub(id: string, data: Partial<{ name: string; defaultCourts: number }>): Promise<void> {
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.defaultCourts !== undefined) update.default_courts = data.defaultCourts;
  const { error } = await supabase.from('clubs').update(update).eq('id', id);
  if (error) throw error;
}

export async function deleteClub(id: string): Promise<void> {
  const { error } = await supabase.from('clubs').delete().eq('id', id);
  if (error) throw error;
}

// --- Members ---
export async function getMembers(clubId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('club_id', clubId)
    .order('name');
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id,
    clubId: row.club_id,
    name: row.name,
    gender: row.gender,
    ntrp: row.ntrp,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
  }));
}

export async function addMember(data: Omit<Member, 'id' | 'createdAt'>): Promise<string> {
  const { data: inserted, error } = await supabase
    .from('members')
    .insert({ club_id: data.clubId, name: data.name, gender: data.gender, ntrp: data.ntrp, is_active: data.isActive })
    .select('id')
    .single();
  if (error) throw error;
  return inserted.id;
}

export async function updateMember(id: string, data: Partial<Omit<Member, 'id' | 'createdAt'>>): Promise<void> {
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.gender !== undefined) update.gender = data.gender;
  if (data.ntrp !== undefined) update.ntrp = data.ntrp;
  if (data.isActive !== undefined) update.is_active = data.isActive;
  const { error } = await supabase.from('members').update(update).eq('id', id);
  if (error) throw error;
}

export async function deleteMember(id: string): Promise<void> {
  const { error } = await supabase.from('members').delete().eq('id', id);
  if (error) throw error;
}

// --- Sessions ---
function rowToSession(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    clubId: row.club_id as string,
    date: row.date as string,
    type: row.type as Session['type'],
    courts: row.courts as number,
    rounds: row.rounds as number,
    mixedRounds: row.mixed_rounds as number,
    votingDeadline: row.voting_deadline as string,
    isGenerated: row.is_generated as boolean,
    isConfirmed: row.is_confirmed as boolean,
    createdAt: new Date(row.created_at as string),
  };
}

export async function getSessions(clubId: string): Promise<Session[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('club_id', clubId)
    .order('date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToSession);
}

export async function getSession(id: string): Promise<Session | null> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  if (!data) return null;
  return rowToSession(data);
}

export async function addSession(data: Omit<Session, 'id' | 'createdAt'>): Promise<string> {
  const { data: inserted, error } = await supabase
    .from('sessions')
    .insert({
      club_id: data.clubId,
      date: data.date,
      type: data.type,
      courts: data.courts,
      rounds: data.rounds,
      mixed_rounds: data.mixedRounds,
      voting_deadline: data.votingDeadline,
      is_generated: data.isGenerated,
      is_confirmed: data.isConfirmed,
    })
    .select('id')
    .single();
  if (error) throw error;
  return inserted.id;
}

export async function updateSession(id: string, data: Partial<Omit<Session, 'id' | 'createdAt'>>): Promise<void> {
  const update: Record<string, unknown> = {};
  if (data.date !== undefined) update.date = data.date;
  if (data.type !== undefined) update.type = data.type;
  if (data.courts !== undefined) update.courts = data.courts;
  if (data.rounds !== undefined) update.rounds = data.rounds;
  if (data.mixedRounds !== undefined) update.mixed_rounds = data.mixedRounds;
  if (data.votingDeadline !== undefined) update.voting_deadline = data.votingDeadline;
  if (data.isGenerated !== undefined) update.is_generated = data.isGenerated;
  if (data.isConfirmed !== undefined) update.is_confirmed = data.isConfirmed;
  const { error } = await supabase.from('sessions').update(update).eq('id', id);
  if (error) throw error;
}

export async function confirmSession(id: string): Promise<void> {
  const { error } = await supabase.from('sessions').update({ is_confirmed: true }).eq('id', id);
  if (error) throw error;
}

export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase.from('sessions').delete().eq('id', id);
  if (error) throw error;
}

// --- Attendance ---
function rowToAttendance(row: Record<string, unknown>): AttendanceRecord {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    playerId: row.player_id as string,
    playerType: row.player_type as 'member' | 'guest',
    playerName: row.player_name as string,
    gender: row.gender as AttendanceRecord['gender'],
    ntrp: row.ntrp as number,
    attending: row.attending as boolean,
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function getAttendance(sessionId: string): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('session_id', sessionId);
  if (error) throw error;
  return (data ?? []).map(rowToAttendance);
}

export async function setAttendance(data: Omit<AttendanceRecord, 'id' | 'updatedAt'>): Promise<void> {
  const { error } = await supabase
    .from('attendance')
    .upsert(
      {
        session_id: data.sessionId,
        player_id: data.playerId,
        player_type: data.playerType,
        player_name: data.playerName,
        gender: data.gender,
        ntrp: data.ntrp,
        attending: data.attending,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'session_id,player_id' }
    );
  if (error) throw error;
}

export async function deleteAttendance(sessionId: string, playerId: string): Promise<void> {
  const { error } = await supabase
    .from('attendance')
    .delete()
    .eq('session_id', sessionId)
    .eq('player_id', playerId);
  if (error) throw error;
}

// --- Guests ---
export async function getGuests(sessionId: string): Promise<Guest[]> {
  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .eq('session_id', sessionId);
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    gender: row.gender,
    ntrp: row.ntrp,
    sessionId: row.session_id,
  }));
}

export async function addGuest(data: Omit<Guest, 'id'>): Promise<string> {
  const { data: inserted, error } = await supabase
    .from('guests')
    .insert({ name: data.name, gender: data.gender, ntrp: data.ntrp, session_id: data.sessionId })
    .select('id')
    .single();
  if (error) throw error;
  return inserted.id;
}

export async function deleteGuest(id: string): Promise<void> {
  const { error } = await supabase.from('guests').delete().eq('id', id);
  if (error) throw error;
}

// --- Matches ---
function rowToMatch(row: Record<string, unknown>): Match {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    round: row.round as number,
    court: row.court as number,
    matchType: row.match_type as Match['matchType'],
    team1: row.team1 as Match['team1'],
    team2: row.team2 as Match['team2'],
    score1: row.score1 as string | undefined,
    score2: row.score2 as string | undefined,
    isCompleted: row.is_completed as boolean,
  };
}

export async function getMatches(sessionId: string): Promise<Match[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('session_id', sessionId)
    .order('round')
    .order('court');
  if (error) throw error;
  return (data ?? []).map(rowToMatch);
}

export async function saveMatches(sessionId: string, matches: Omit<Match, 'id'>[]): Promise<void> {
  const { error: delError } = await supabase
    .from('matches')
    .delete()
    .eq('session_id', sessionId);
  if (delError) throw delError;

  if (matches.length === 0) return;

  const rows = matches.map(m => ({
    session_id: m.sessionId,
    round: m.round,
    court: m.court,
    match_type: m.matchType,
    team1: m.team1,
    team2: m.team2,
    score1: m.score1 ?? null,
    score2: m.score2 ?? null,
    is_completed: m.isCompleted,
  }));

  const { error } = await supabase.from('matches').insert(rows);
  if (error) throw error;
}

export async function updateMatchScore(id: string, score1: string, score2: string): Promise<void> {
  const { error } = await supabase
    .from('matches')
    .update({ score1, score2, is_completed: true })
    .eq('id', id);
  if (error) throw error;
}

export async function updateMatch(
  id: string,
  data: Partial<Pick<Match, 'team1' | 'team2' | 'court' | 'matchType' | 'score1' | 'score2' | 'isCompleted'>>
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (data.team1 !== undefined) update.team1 = data.team1;
  if (data.team2 !== undefined) update.team2 = data.team2;
  if (data.court !== undefined) update.court = data.court;
  if (data.matchType !== undefined) update.match_type = data.matchType;
  if (data.score1 !== undefined) update.score1 = data.score1;
  if (data.score2 !== undefined) update.score2 = data.score2;
  if (data.isCompleted !== undefined) update.is_completed = data.isCompleted;
  const { error } = await supabase.from('matches').update(update).eq('id', id);
  if (error) throw error;
}

export async function getAllMatches(clubId: string): Promise<Match[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('*, sessions!inner(club_id)')
    .eq('sessions.club_id', clubId);
  if (error) throw error;
  return (data ?? []).map(rowToMatch);
}

export async function getAllAttendance(clubId: string): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('*, sessions!inner(club_id)')
    .eq('sessions.club_id', clubId)
    .eq('attending', true);
  if (error) throw error;
  return (data ?? []).map(rowToAttendance);
}

// --- App Users ---
function rowToAppUser(row: Record<string, unknown>): AppUser {
  return {
    id: row.id as string,
    username: row.username as string,
    role: row.role as AppUser['role'],
    clubIds: (row.club_ids as string[]) ?? [],
    defaultClubId: (row.default_club_id as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
  };
}

export async function getAppUser(uid: string): Promise<AppUser | null> {
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .eq('id', uid)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  if (!data) return null;
  return rowToAppUser(data);
}

export async function createAppUser(uid: string, data: {
  username: string;
  role: AppUser['role'];
  clubIds?: string[];
  defaultClubId?: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('app_users')
    .insert({
      id: uid,
      username: data.username,
      role: data.role,
      club_ids: data.clubIds ?? [],
      default_club_id: data.defaultClubId ?? null,
    });
  if (error) throw error;
}

export async function updateAppUser(uid: string, data: Partial<{
  role: AppUser['role'];
  clubIds: string[];
  defaultClubId: string | null;
}>): Promise<void> {
  const update: Record<string, unknown> = {};
  if (data.role !== undefined) update.role = data.role;
  if (data.clubIds !== undefined) update.club_ids = data.clubIds;
  if (data.defaultClubId !== undefined) update.default_club_id = data.defaultClubId;
  const { error } = await supabase.from('app_users').update(update).eq('id', uid);
  if (error) throw error;
}

export async function getAllAppUsers(): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map(rowToAppUser);
}

export async function getClubUsers(clubId: string): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .contains('club_ids', [clubId])
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map(rowToAppUser);
}

export async function deleteAppUser(uid: string): Promise<void> {
  const { error } = await supabase.from('app_users').delete().eq('id', uid);
  if (error) throw error;
}

export async function isAdmin(uid: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('app_users')
    .select('role')
    .eq('id', uid)
    .single();
  if (error) return false;
  return data?.role === 'admin' || data?.role === 'superadmin';
}

// --- Password Management ---
export async function resetUserPassword(userId: string): Promise<void> {
  if (!supabaseAdmin) throw new Error('SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: '123456' });
  if (error) throw error;
}
