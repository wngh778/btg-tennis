import { useState } from 'react';
import {
  addGuest, deleteGuest, updateGuest, setAttendance, deleteAttendance, updateMatch,
} from '../lib/database';
import type { Session, Guest, Match, Gender } from '../types';

interface UseGuestFormOptions {
  session: Session | null;
  matches: Match[];
  isAdminUser: boolean;
  load: () => Promise<void>;
}

export function useGuestForm({ session, matches, isAdminUser, load }: UseGuestFormOptions) {
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestGender, setGuestGender] = useState<Gender>('male');
  const [guestNtrp, setGuestNtrp] = useState(3.0);

  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [editGuestName, setEditGuestName] = useState('');
  const [editGuestGender, setEditGuestGender] = useState<Gender>('male');
  const [editGuestNtrp, setEditGuestNtrp] = useState(3.0);

  const handleAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    const guestId = await addGuest({
      name: guestName,
      gender: guestGender,
      ntrp: guestNtrp,
      sessionId: session.id,
    });
    await setAttendance({
      sessionId: session.id,
      playerId: guestId,
      playerType: 'guest',
      playerName: guestName,
      gender: guestGender,
      ntrp: guestNtrp,
      attending: true,
    }, isAdminUser);
    setGuestName('');
    setGuestGender('male');
    setGuestNtrp(3.0);
    setShowGuestForm(false);
    load();
  };

  const handleRemoveGuest = async (guest: Guest) => {
    if (!session) return;
    await deleteGuest(guest.id);
    await deleteAttendance(session.id, guest.id, isAdminUser);
    load();
  };

  const handleStartEditGuest = (guest: Guest) => {
    setEditingGuestId(guest.id);
    setEditGuestName(guest.name);
    setEditGuestGender(guest.gender);
    setEditGuestNtrp(guest.ntrp);
  };

  const handleSaveEditGuest = async () => {
    if (!session || !editingGuestId) return;
    const oldGuest = matches
      .flatMap(m => [m.team1.player1, m.team1.player2, m.team2.player1, m.team2.player2])
      .find(p => p.id === editingGuestId);
    await updateGuest(editingGuestId, {
      name: editGuestName,
      gender: editGuestGender,
      ntrp: editGuestNtrp,
    });
    await setAttendance({
      sessionId: session.id,
      playerId: editingGuestId,
      playerType: 'guest',
      playerName: editGuestName,
      gender: editGuestGender,
      ntrp: editGuestNtrp,
      attending: true,
    }, isAdminUser);
    // 대진표에 해당 게스트가 포함되어 있으면 match 내 player 정보도 업데이트
    if (oldGuest) {
      for (const m of matches) {
        let changed = false;
        const updated = { team1: { ...m.team1 }, team2: { ...m.team2 } };
        for (const team of ['team1', 'team2'] as const) {
          for (const slot of ['player1', 'player2'] as const) {
            if (m[team][slot].id === editingGuestId) {
              updated[team][slot] = {
                ...m[team][slot],
                name: editGuestName,
                gender: editGuestGender,
                ntrp: editGuestNtrp,
              };
              changed = true;
            }
          }
        }
        if (changed) {
          await updateMatch(m.id, { team1: updated.team1, team2: updated.team2 });
        }
      }
    }
    setEditingGuestId(null);
    load();
  };

  return {
    // state
    showGuestForm,
    guestName,
    guestGender,
    guestNtrp,
    editingGuestId,
    editGuestName,
    editGuestGender,
    editGuestNtrp,
    // setters
    setShowGuestForm,
    setGuestName,
    setGuestGender,
    setGuestNtrp,
    setEditingGuestId,
    setEditGuestName,
    setEditGuestGender,
    setEditGuestNtrp,
    // handlers
    handleAddGuest,
    handleRemoveGuest,
    handleStartEditGuest,
    handleSaveEditGuest,
  };
}
