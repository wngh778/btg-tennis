import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import type { Member, Session, AttendanceRecord, Match, Guest, AdminUser, AppUser } from '../types';

// --- Username/Email conversion ---
export function usernameToEmail(username: string): string {
  // Encode any username (including Korean) to valid email
  const bytes = new TextEncoder().encode(username.trim());
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  const b64 = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `u${b64}@btg-app.com`;
}

// --- Members ---
export async function getMembers(): Promise<Member[]> {
  const snap = await getDocs(query(collection(db, 'members'), orderBy('name')));
  return snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: (d.data().createdAt as Timestamp)?.toDate() } as Member));
}

export async function addMember(data: Omit<Member, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'members'), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateMember(id: string, data: Partial<Omit<Member, 'id' | 'createdAt'>>): Promise<void> {
  await updateDoc(doc(db, 'members', id), data);
}

export async function deleteMember(id: string): Promise<void> {
  await deleteDoc(doc(db, 'members', id));
}

// --- Sessions ---
export async function getSessions(): Promise<Session[]> {
  const snap = await getDocs(query(collection(db, 'sessions'), orderBy('date', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: (d.data().createdAt as Timestamp)?.toDate() } as Session));
}

export async function getSession(id: string): Promise<Session | null> {
  const snap = await getDoc(doc(db, 'sessions', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data(), createdAt: (snap.data().createdAt as Timestamp)?.toDate() } as Session;
}

export async function addSession(data: Omit<Session, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'sessions'), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateSession(id: string, data: Partial<Omit<Session, 'id' | 'createdAt'>>): Promise<void> {
  await updateDoc(doc(db, 'sessions', id), data);
}

export async function deleteSession(id: string): Promise<void> {
  await deleteDoc(doc(db, 'sessions', id));
}

// --- Attendance ---
export async function getAttendance(sessionId: string): Promise<AttendanceRecord[]> {
  const snap = await getDocs(query(collection(db, 'attendance'), where('sessionId', '==', sessionId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data(), updatedAt: (d.data().updatedAt as Timestamp)?.toDate() } as AttendanceRecord));
}

export async function setAttendance(data: Omit<AttendanceRecord, 'id' | 'updatedAt'>): Promise<void> {
  // Use sessionId_playerId as document ID to prevent duplicates
  const docId = `${data.sessionId}_${data.playerId}`;
  await setDoc(doc(db, 'attendance', docId), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteAttendance(sessionId: string, playerId: string): Promise<void> {
  await deleteDoc(doc(db, 'attendance', `${sessionId}_${playerId}`));
}

// --- Guests ---
export async function getGuests(sessionId: string): Promise<Guest[]> {
  const snap = await getDocs(query(collection(db, 'guests'), where('sessionId', '==', sessionId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Guest));
}

export async function addGuest(data: Omit<Guest, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'guests'), data);
  return ref.id;
}

export async function deleteGuest(id: string): Promise<void> {
  await deleteDoc(doc(db, 'guests', id));
}

// --- Matches ---
export async function getMatches(sessionId: string): Promise<Match[]> {
  const snap = await getDocs(query(collection(db, 'matches'), where('sessionId', '==', sessionId), orderBy('round'), orderBy('court')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Match));
}

export async function saveMatches(sessionId: string, matches: Omit<Match, 'id'>[]): Promise<void> {
  // Delete existing matches for this session first
  const existing = await getDocs(query(collection(db, 'matches'), where('sessionId', '==', sessionId)));
  const deletes = existing.docs.map(d => deleteDoc(d.ref));
  await Promise.all(deletes);
  // Add new matches
  const adds = matches.map(m => addDoc(collection(db, 'matches'), m));
  await Promise.all(adds);
}

export async function updateMatchScore(id: string, score1: string, score2: string): Promise<void> {
  await updateDoc(doc(db, 'matches', id), { score1, score2, isCompleted: true });
}

// --- Admins ---
export async function getAdmins(): Promise<AdminUser[]> {
  const snap = await getDocs(collection(db, 'admins'));
  return snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: (d.data().createdAt as Timestamp)?.toDate() } as AdminUser));
}

export async function addAdmin(data: Omit<AdminUser, 'id' | 'createdAt'>): Promise<void> {
  await setDoc(doc(db, 'admins', data.email), { ...data, createdAt: serverTimestamp() });
}

export async function removeAdmin(email: string): Promise<void> {
  await deleteDoc(doc(db, 'admins', email));
}

export async function isAdmin(email: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'admins', email));
  return snap.exists();
}

// --- Match History (for algorithm) ---
export async function getAllMatches(): Promise<Match[]> {
  const snap = await getDocs(collection(db, 'matches'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Match));
}

export async function updateMatch(id: string, data: Partial<Pick<Match, 'team1' | 'team2' | 'court' | 'matchType' | 'score1' | 'score2' | 'isCompleted'>>): Promise<void> {
  await updateDoc(doc(db, 'matches', id), data as Record<string, unknown>);
}

// --- AppUsers ---
export async function getAppUser(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(db, 'appUsers', uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data(), createdAt: (snap.data().createdAt as Timestamp)?.toDate() } as AppUser;
}

export async function createAppUser(uid: string, data: { username: string; role: 'admin' | 'member' }): Promise<void> {
  await setDoc(doc(db, 'appUsers', uid), { ...data, createdAt: serverTimestamp() });
}

export async function getAllAppUsers(): Promise<AppUser[]> {
  const snap = await getDocs(collection(db, 'appUsers'));
  return snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: (d.data().createdAt as Timestamp)?.toDate() } as AppUser));
}

export async function deleteAppUser(uid: string): Promise<void> {
  await deleteDoc(doc(db, 'appUsers', uid));
}
