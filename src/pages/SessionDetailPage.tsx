import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  getSession, getMembers, getGuests, getAttendance,
  setAttendance, deleteAttendance, addGuest, deleteGuest,
  getMatches, saveMatches, updateMatchScore, updateSession, getAllMatches, updateMatch, confirmSession,
} from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { generateMatches, isVotingOpen, NTRP_OPTIONS } from '../utils/matchmaking';
import type { Session, Member, Guest, AttendanceRecord, Match, Player, Gender } from '../types';

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

const matchTypeLabel = { male: '남복', female: '여복', mixed: '혼복' };
const matchTypeBg = { male: 'bg-blue-50 border-blue-200', female: 'bg-pink-50 border-pink-200', mixed: 'bg-purple-50 border-purple-200' };
const matchTypeBadge = { male: 'bg-blue-100 text-blue-700', female: 'bg-pink-100 text-pink-700', mixed: 'bg-purple-100 text-purple-700' };

type SelectedPlayer = {
  matchId: string;
  team: 'team1' | 'team2';
  slot: 'player1' | 'player2';
  player: Player;
} | null;

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdminUser, loading: authLoading } = useAuth();

  const [session, setSession] = useState<Session | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [attendance, setAttendanceState] = useState<AttendanceRecord[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'vote' | 'bracket' | 'detail' | 'result'>('vote');

  // Bracket editing
  const [editMode, setEditMode] = useState(false);
  const [pendingMatches, setPendingMatches] = useState<Match[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<SelectedPlayer>(null);
  const [saving, setSaving] = useState(false);

  // Generate settings modal
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateCourts, setGenerateCourts] = useState(4);
  const [generateRounds, setGenerateRounds] = useState(6);
  const [generateMixedRounds, setGenerateMixedRounds] = useState(2);

  // Guest form
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestGender, setGuestGender] = useState<Gender>('male');
  const [guestNtrp, setGuestNtrp] = useState(3.0);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [s, m, g, a, mx] = await Promise.all([
        getSession(id), getMembers(), getGuests(id), getAttendance(id), getMatches(id),
      ]);
      setSession(s);
      setMembers(m);
      setGuests(g);
      setAttendanceState(a);
      setMatches(mx);
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  // auth 초기화 완료 후에만 데이터 로드 (새로고침 시 세션 미초기화 상태에서 쿼리 실행 방지)
  useEffect(() => { if (!authLoading) load(); }, [load, authLoading]);

  if (loading) return <div className="text-center py-16 text-slate-500">불러오는 중...</div>;
  if (error) return (
    <div className="text-center py-16">
      <p className="text-red-500 font-medium mb-2">오류가 발생했습니다</p>
      <p className="text-slate-500 text-sm break-all max-w-lg mx-auto">{error}</p>
    </div>
  );
  if (!session) return <div className="text-center py-16 text-slate-500">경기를 찾을 수 없습니다.</div>;

  const votingOpen = isVotingOpen(session.votingDeadline);
  const canVote = votingOpen || isAdminUser;
  const attendingIds = new Set(attendance.filter(a => a.attending).map(a => a.playerId));
  const attendingPlayers: Player[] = attendance
    .filter(a => a.attending)
    .map(a => ({ id: a.playerId, name: a.playerName, gender: a.gender, ntrp: a.ntrp, type: a.playerType }));

  // --- Voting ---
  const handleMemberVote = async (member: Member, attending: boolean) => {
    if (!canVote) return;
    await setAttendance({
      sessionId: session.id,
      playerId: member.id,
      playerType: 'member',
      playerName: member.name,
      gender: member.gender,
      ntrp: member.ntrp,
      attending,
    });
    load();
  };

  const handleAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    const guestId = await addGuest({ name: guestName, gender: guestGender, ntrp: guestNtrp, sessionId: session.id });
    await setAttendance({
      sessionId: session.id,
      playerId: guestId,
      playerType: 'guest',
      playerName: guestName,
      gender: guestGender,
      ntrp: guestNtrp,
      attending: true,
    });
    setGuestName(''); setGuestGender('male'); setGuestNtrp(3.0);
    setShowGuestForm(false);
    load();
  };

  const handleRemoveGuest = async (guest: Guest) => {
    await deleteGuest(guest.id);
    await deleteAttendance(session.id, guest.id);
    load();
  };

  // --- Bracket Generation ---
  const handleGenerateClick = () => {
    setGenerateCourts(session.courts);
    setGenerateRounds(session.rounds);
    setGenerateMixedRounds(session.mixedRounds);
    setShowGenerateModal(true);
  };

  const handleGenerate = async () => {
    setShowGenerateModal(false);
    const pastMatches = await getAllMatches();
    const generated = generateMatches({
      sessionId: session.id,
      players: attendingPlayers,
      courts: generateCourts,
      totalRounds: generateRounds,
      mixedRounds: session.type === 'weekly' ? generateMixedRounds : 0,
      sessionType: session.type,
      pastMatches,
    });
    await saveMatches(session.id, generated);
    await updateSession(session.id, {
      isGenerated: true,
      courts: generateCourts,
      rounds: generateRounds,
      mixedRounds: session.type === 'weekly' ? generateMixedRounds : 0,
    });
    load();
    setTab('bracket');
  };

  const handleScoreUpdate = async (matchId: string, score1: string, score2: string) => {
    await updateMatchScore(matchId, score1, score2);
    load();
  };

  const handleConfirm = async () => {
    if (!confirm('대진표를 확정하시겠습니까? 확정 후에는 스코어를 수정할 수 없습니다.')) return;
    await confirmSession(session!.id);
    load();
    setTab('result');
  };

  // --- Bracket Editing ---
  const handleEditModeStart = () => {
    setPendingMatches(JSON.parse(JSON.stringify(matches)));
    setSelectedPlayer(null);
    setEditMode(true);
  };

  const handleEditCancel = () => {
    setEditMode(false);
    setPendingMatches([]);
    setSelectedPlayer(null);
  };

  const handleEditSave = async () => {
    setSaving(true);
    try {
      // Find modified matches and save them
      for (const pm of pendingMatches) {
        const original = matches.find(m => m.id === pm.id);
        if (!original) continue;
        const changed =
          JSON.stringify(original.team1) !== JSON.stringify(pm.team1) ||
          JSON.stringify(original.team2) !== JSON.stringify(pm.team2);
        if (changed) {
          await updateMatch(pm.id, { team1: pm.team1, team2: pm.team2 });
        }
      }
      setEditMode(false);
      setPendingMatches([]);
      setSelectedPlayer(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handlePlayerClick = (
    matchId: string,
    team: 'team1' | 'team2',
    slot: 'player1' | 'player2',
    player: Player
  ) => {
    if (!selectedPlayer) {
      // Select this player
      setSelectedPlayer({ matchId, team, slot, player });
    } else {
      // Swap the two players
      if (selectedPlayer.matchId === matchId && selectedPlayer.team === team && selectedPlayer.slot === slot) {
        // Deselect if clicking the same player
        setSelectedPlayer(null);
        return;
      }
      const newPending = pendingMatches.map(m => {
        const updated = { ...m, team1: { ...m.team1, player1: { ...m.team1.player1 }, player2: { ...m.team1.player2 } }, team2: { ...m.team2, player1: { ...m.team2.player1 }, player2: { ...m.team2.player2 } } };
        return updated;
      });

      // Find and swap
      const matchA = newPending.find(m => m.id === selectedPlayer.matchId);
      const matchB = newPending.find(m => m.id === matchId);

      if (matchA && matchB) {
        const playerA = matchA[selectedPlayer.team][selectedPlayer.slot];
        const playerB = matchB[team][slot];
        matchA[selectedPlayer.team][selectedPlayer.slot] = playerB;
        matchB[team][slot] = playerA;
      }

      setPendingMatches(newPending);
      setSelectedPlayer(null);
    }
  };

  // Group matches by round
  const rounds = Array.from(new Set(matches.map(m => m.round))).sort((a, b) => a - b);

  const activeMembers = members.filter(m => m.isActive);
  const maleAttending = attendingPlayers.filter(p => p.gender === 'male').length;
  const femaleAttending = attendingPlayers.filter(p => p.gender === 'female').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-slate-800">{formatDate(session.date)}</h1>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                session.type === 'quarterly' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
              }`}>
                {session.type === 'quarterly' ? '🏆 분기대회' : '주간 경기'}
              </span>
            </div>
            <p className="text-slate-500 text-sm">
              {session.courts}개 코트 · {session.rounds}라운드
              {session.type === 'weekly' && session.mixedRounds > 0 ? ` · 혼복 ${session.mixedRounds}R` : ''}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              투표 마감: {new Date(session.votingDeadline).toLocaleDateString('ko-KR', {
                month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit'
              })}
              {votingOpen
                ? <span className="ml-1 text-green-500 font-medium">· 투표 진행 중</span>
                : <span className="ml-1 text-orange-500 font-medium">· 투표 마감</span>
              }
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-green-600">{attendingIds.size}명</p>
            <p className="text-xs text-slate-400">참석 예정 · 남{maleAttending} 여{femaleAttending}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-2xl overflow-hidden">
        <button
          onClick={() => setTab('vote')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            tab === 'vote' ? 'text-green-600 border-b-2 border-green-600 bg-green-50' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          참석 투표
        </button>
        <button
          onClick={() => setTab('bracket')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            tab === 'bracket' ? 'text-green-600 border-b-2 border-green-600 bg-green-50' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          대진표 {session.isGenerated ? '✓' : ''}
        </button>
        <button
          onClick={() => setTab('detail')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            tab === 'detail' ? 'text-green-600 border-b-2 border-green-600 bg-green-50' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          참석인원상세
        </button>
        {session.isConfirmed && (
          <button
            onClick={() => setTab('result')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === 'result' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            결과 🏆
          </button>
        )}
      </div>

      {/* Vote Tab */}
      {tab === 'vote' && (
        <div className="space-y-4">
          {!votingOpen && !isAdminUser && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-700">
              투표 마감 후에는 관리자만 참석 여부를 변경할 수 있습니다.
            </div>
          )}

          {/* Member list */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="font-semibold text-slate-700">회원 참석 여부</h2>
              <span className="text-sm text-slate-400">{activeMembers.length}명</span>
            </div>
            <div className="divide-y divide-slate-100">
              {activeMembers.map(m => {
                const rec = attendance.find(a => a.playerId === m.id);
                const attending = rec?.attending ?? null;
                return (
                  <div key={m.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${m.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                      <span className="font-medium text-slate-800">{m.name}</span>
                      {isAdminUser && <span className="text-xs font-mono text-slate-400">{m.ntrp.toFixed(1)}</span>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => canVote && handleMemberVote(m, true)}
                        disabled={!canVote}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          attending === true
                            ? 'bg-green-500 text-white'
                            : canVote
                            ? 'bg-slate-100 text-slate-600 hover:bg-green-100 hover:text-green-700'
                            : 'bg-slate-50 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        참석
                      </button>
                      <button
                        onClick={() => canVote && handleMemberVote(m, false)}
                        disabled={!canVote}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          attending === false
                            ? 'bg-red-400 text-white'
                            : canVote
                            ? 'bg-slate-100 text-slate-600 hover:bg-red-100 hover:text-red-600'
                            : 'bg-slate-50 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        불참
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Guests */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="font-semibold text-slate-700">게스트 ({guests.length}명)</h2>
              {isAdminUser && (
                <button
                  onClick={() => setShowGuestForm(!showGuestForm)}
                  className="text-sm text-green-600 font-medium hover:text-green-700"
                >
                  + 게스트 추가
                </button>
              )}
            </div>

            {showGuestForm && (
              <form onSubmit={handleAddGuest} className="px-5 py-4 border-b border-slate-100 bg-green-50">
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">이름</label>
                    <input
                      value={guestName}
                      onChange={e => setGuestName(e.target.value)}
                      required
                      placeholder="게스트 이름"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">성별</label>
                    <select
                      value={guestGender}
                      onChange={e => setGuestGender(e.target.value as Gender)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="male">남성</option>
                      <option value="female">여성</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">NTRP</label>
                    <select
                      value={guestNtrp}
                      onChange={e => setGuestNtrp(parseFloat(e.target.value))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      {NTRP_OPTIONS.map(n => <option key={n} value={n}>{n.toFixed(1)}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowGuestForm(false)} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5">취소</button>
                  <button type="submit" className="px-4 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors">추가</button>
                </div>
              </form>
            )}

            <div className="divide-y divide-slate-100">
              {guests.length === 0 ? (
                <p className="px-5 py-4 text-slate-400 text-sm text-center">등록된 게스트가 없습니다.</p>
              ) : (
                guests.map(g => (
                  <div key={g.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded text-xs font-medium">게스트</span>
                      <span className={`w-2 h-2 rounded-full ${g.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                      <span className="font-medium text-slate-800">{g.name}</span>
                      {isAdminUser && <span className="text-xs font-mono text-slate-400">{g.ntrp.toFixed(1)}</span>}
                      <span className="text-xs text-slate-400">{g.gender === 'male' ? '남' : '여'}</span>
                    </div>
                    {isAdminUser && (
                      <button
                        onClick={() => handleRemoveGuest(g)}
                        className="text-red-400 hover:text-red-600 text-sm"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Generate Settings Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800 text-lg">
                {session.isGenerated ? '대진표 재생성 설정' : '대진표 생성 설정'}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">참석 인원 {attendingPlayers.length}명 · 남{maleAttending} 여{femaleAttending}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">코트 수</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5, 6].map(n => (
                    <button
                      key={n}
                      onClick={() => setGenerateCourts(n)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        generateCourts === n
                          ? 'bg-green-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">총 라운드 수</label>
                <div className="flex gap-2">
                  {[4, 5, 6, 7, 8].map(n => (
                    <button
                      key={n}
                      onClick={() => {
                        setGenerateRounds(n);
                        setGenerateMixedRounds(prev => Math.min(prev, n));
                      }}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        generateRounds === n
                          ? 'bg-green-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              {session.type === 'weekly' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    혼복 라운드 수
                    <span className="text-xs text-slate-400 font-normal ml-1">(전체 {generateRounds}R 중)</span>
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {Array.from({ length: generateRounds + 1 }, (_, i) => i).map(n => (
                      <button
                        key={n}
                        onClick={() => setGenerateMixedRounds(Math.min(n, generateRounds))}
                        className={`w-10 py-2 rounded-lg text-sm font-medium transition-colors ${
                          generateMixedRounds === n
                            ? 'bg-purple-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setShowGenerateModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleGenerate}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
              >
                {session.isGenerated ? '재생성' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bracket Tab */}
      {tab === 'bracket' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              참석 인원 {attendingPlayers.length}명 · 남{maleAttending} 여{femaleAttending}
            </p>
            <div className="flex items-center gap-2">
              {isAdminUser && !editMode && matches.length > 0 && (
                <button
                  onClick={handleEditModeStart}
                  className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
                >
                  편집
                </button>
              )}
              {isAdminUser && editMode && (
                <>
                  <button
                    onClick={handleEditCancel}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleEditSave}
                    disabled={saving}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </>
              )}
              {isAdminUser && !editMode && session.isGenerated && !session.isConfirmed && (
                <button
                  onClick={handleConfirm}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  확정
                </button>
              )}
              {isAdminUser && !editMode && (
                <button
                  onClick={handleGenerateClick}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  {session.isGenerated ? '대진표 재생성' : '대진표 생성'}
                </button>
              )}
            </div>
          </div>

          {session.isConfirmed && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700">
              ✓ 확정된 결과입니다. 스코어 수정이 잠겨 있습니다.
            </div>
          )}
          {editMode && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
              선수 이름을 클릭하여 위치를 바꿀 수 있습니다. 첫 번째 선수 선택 후 두 번째 선수를 클릭하면 위치가 교환됩니다.
            </div>
          )}

          {matches.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
              <p className="text-slate-400 text-lg mb-2">아직 대진표가 없습니다.</p>
              {isAdminUser && <p className="text-slate-400 text-sm">참석 투표 완료 후 대진표를 생성하세요.</p>}
            </div>
          ) : (
            rounds.map(round => (
              <RoundCard
                key={round}
                round={round}
                matches={matches.filter(m => m.round === round)}
                attendingPlayers={attendingPlayers}
                canEditScore={!!user && !session.isConfirmed}
                onScoreUpdate={handleScoreUpdate}
                editMode={editMode}
                pendingMatches={pendingMatches.filter(m => m.round === round)}
                selectedPlayer={selectedPlayer}
                onPlayerClick={handlePlayerClick}
                showNtrp={isAdminUser}
              />
            ))
          )}
        </div>
      )}

      {/* Detail Tab */}
      {tab === 'detail' && (
        <PlayerDetailTab attendingPlayers={attendingPlayers} matches={matches} showNtrp={isAdminUser} />
      )}

      {/* Result Tab */}
      {tab === 'result' && session.isConfirmed && (
        <SessionResultTab attendingPlayers={attendingPlayers} matches={matches} />
      )}
    </div>
  );
}

function PlayerDetailTab({ attendingPlayers, matches, showNtrp }: { attendingPlayers: Player[]; matches: Match[]; showNtrp: boolean }) {
  // Per-player game count by type
  type PlayerStat = { male: number; female: number; mixed: number; total: number };
  const stats = new Map<string, PlayerStat>();

  for (const p of attendingPlayers) {
    stats.set(p.id, { male: 0, female: 0, mixed: 0, total: 0 });
  }

  for (const m of matches) {
    const players = [m.team1.player1, m.team1.player2, m.team2.player1, m.team2.player2];
    for (const p of players) {
      if (!stats.has(p.id)) stats.set(p.id, { male: 0, female: 0, mixed: 0, total: 0 });
      const s = stats.get(p.id)!;
      s[m.matchType]++;
      s.total++;
    }
  }

  // Summary: total games by type across all matches
  const totalMale = matches.filter(m => m.matchType === 'male').length;
  const totalFemale = matches.filter(m => m.matchType === 'female').length;
  const totalMixed = matches.filter(m => m.matchType === 'mixed').length;

  const sorted = [...attendingPlayers].sort((a, b) => {
    // Sort: male first, then female; within same gender sort by name
    if (a.gender !== b.gender) return a.gender === 'male' ? -1 : 1;
    return a.name.localeCompare(b.name, 'ko');
  });

  if (attendingPlayers.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
        <p className="text-slate-400">참석 예정 인원이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-700 mb-3">라운드 구성 요약</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{totalMale}</p>
            <p className="text-xs text-blue-500 mt-0.5">남복 게임</p>
          </div>
          <div className="bg-purple-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-purple-600">{totalMixed}</p>
            <p className="text-xs text-purple-500 mt-0.5">혼복 게임</p>
          </div>
          <div className="bg-pink-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-pink-600">{totalFemale}</p>
            <p className="text-xs text-pink-500 mt-0.5">여복 게임</p>
          </div>
        </div>
      </div>

      {/* Per player list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center">
          <span className="text-xs font-semibold text-slate-500">이름</span>
          <span className="text-xs font-semibold text-blue-500 w-10 text-center">남복</span>
          <span className="text-xs font-semibold text-purple-500 w-10 text-center">혼복</span>
          <span className="text-xs font-semibold text-pink-500 w-10 text-center">여복</span>
          <span className="text-xs font-semibold text-slate-600 w-12 text-center">합계</span>
        </div>
        <div className="divide-y divide-slate-100">
          {sorted.map(p => {
            const s = stats.get(p.id) ?? { male: 0, female: 0, mixed: 0, total: 0 };
            return (
              <div key={p.id} className="px-5 py-3 grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${p.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                  <span className="font-medium text-slate-800 text-sm">{p.name}</span>
                  {p.type === 'guest' && (
                    <span className="text-xs bg-orange-100 text-orange-600 px-1 rounded">G</span>
                  )}
                  {showNtrp && <span className="text-xs font-mono text-slate-400">{p.ntrp.toFixed(1)}</span>}
                </div>
                <span className="text-sm text-blue-600 font-medium w-10 text-center">{s.male > 0 ? s.male : '-'}</span>
                <span className="text-sm text-purple-600 font-medium w-10 text-center">{s.mixed > 0 ? s.mixed : '-'}</span>
                <span className="text-sm text-pink-600 font-medium w-10 text-center">{s.female > 0 ? s.female : '-'}</span>
                <span className={`text-sm font-bold w-12 text-center ${s.total === 0 ? 'text-slate-300' : 'text-slate-700'}`}>
                  {s.total}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {matches.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700 text-center">
          대진표가 생성되면 각 인원의 게임 배정 현황을 볼 수 있습니다.
        </div>
      )}
    </div>
  );
}

function SessionResultTab({ attendingPlayers, matches }: { attendingPlayers: Player[]; matches: Match[] }) {
  type ResultStat = {
    name: string;
    gender: string;
    wins: number;
    losses: number;
    games: number;
  };

  const stats = new Map<string, ResultStat>();

  for (const p of attendingPlayers) {
    stats.set(p.id, { name: p.name, gender: p.gender, wins: 0, losses: 0, games: 0 });
  }

  for (const m of matches) {
    if (!m.isCompleted || m.score1 === undefined || m.score2 === undefined) continue;
    const s1 = parseInt(m.score1, 10);
    const s2 = parseInt(m.score2, 10);
    if (isNaN(s1) || isNaN(s2)) continue;

    const team1Players = [m.team1.player1, m.team1.player2];
    const team2Players = [m.team2.player1, m.team2.player2];

    const team1Won = s1 > s2;

    for (const p of team1Players) {
      if (!stats.has(p.id)) stats.set(p.id, { name: p.name, gender: p.gender, wins: 0, losses: 0, games: 0 });
      const s = stats.get(p.id)!;
      s.games++;
      if (team1Won) s.wins++; else s.losses++;
    }
    for (const p of team2Players) {
      if (!stats.has(p.id)) stats.set(p.id, { name: p.name, gender: p.gender, wins: 0, losses: 0, games: 0 });
      const s = stats.get(p.id)!;
      s.games++;
      if (!team1Won) s.wins++; else s.losses++;
    }
  }

  const sorted = [...stats.entries()]
    .map(([id, s]) => ({ id, ...s, winRate: s.games > 0 ? Math.round((s.wins / s.games) * 100) : 0 }))
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || a.name.localeCompare(b.name, 'ko'));

  const completedMatches = matches.filter(m => m.isCompleted).length;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-700 mb-3">이번 경기 결과</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-slate-700">{matches.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">전체 매치</p>
          </div>
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{completedMatches}</p>
            <p className="text-xs text-green-500 mt-0.5">완료된 매치</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center">
          <span className="text-xs font-semibold text-slate-500">이름</span>
          <span className="text-xs font-semibold text-green-600 w-10 text-center">승</span>
          <span className="text-xs font-semibold text-red-500 w-10 text-center">패</span>
          <span className="text-xs font-semibold text-slate-500 w-12 text-center">게임</span>
          <span className="text-xs font-semibold text-blue-600 w-14 text-center">승률</span>
        </div>
        <div className="divide-y divide-slate-100">
          {sorted.map((s, i) => (
            <div key={s.id} className="px-5 py-3 grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold w-5 text-center ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-600' : 'text-slate-300'}`}>
                  {i + 1}
                </span>
                <span className={`w-2 h-2 rounded-full shrink-0 ${s.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                <span className="font-medium text-slate-800 text-sm">{s.name}</span>
              </div>
              <span className="text-sm font-bold text-green-600 w-10 text-center">{s.wins}</span>
              <span className="text-sm text-red-400 w-10 text-center">{s.losses}</span>
              <span className="text-sm text-slate-500 w-12 text-center">{s.games}</span>
              <div className="w-14 text-center">
                <span className={`text-sm font-bold ${s.winRate >= 70 ? 'text-green-600' : s.winRate >= 50 ? 'text-blue-600' : 'text-slate-500'}`}>
                  {s.games > 0 ? `${s.winRate}%` : '-'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RoundCard({
  round, matches, attendingPlayers, canEditScore, onScoreUpdate,
  editMode, pendingMatches, selectedPlayer, onPlayerClick, showNtrp,
}: {
  round: number;
  matches: Match[];
  attendingPlayers: Player[];
  canEditScore: boolean;
  onScoreUpdate: (id: string, s1: string, s2: string) => void;
  editMode: boolean;
  pendingMatches: Match[];
  selectedPlayer: SelectedPlayer;
  onPlayerClick: (matchId: string, team: 'team1' | 'team2', slot: 'player1' | 'player2', player: Player) => void;
  showNtrp: boolean;
}) {
  const displayMatches = editMode ? pendingMatches : matches;
  const playingIds = new Set(
    displayMatches.flatMap(m => [m.team1.player1.id, m.team1.player2.id, m.team2.player1.id, m.team2.player2.id])
  );
  const restingPlayers = attendingPlayers.filter(p => !playingIds.has(p.id));

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
        <h2 className="font-semibold text-slate-700">{round}라운드</h2>
      </div>
      <div className="divide-y divide-slate-100">
        {displayMatches.sort((a, b) => a.court - b.court).map(m => (
          <MatchCard
            key={m.id}
            match={m}
            canEditScore={canEditScore}
            onScoreUpdate={onScoreUpdate}
            editMode={editMode}
            selectedPlayer={selectedPlayer}
            onPlayerClick={onPlayerClick}
            showNtrp={showNtrp}
          />
        ))}
      </div>
      {restingPlayers.length > 0 && (
        <div className="px-5 py-2.5 bg-amber-50 border-t border-amber-100 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-amber-600 shrink-0">휴식</span>
          {restingPlayers.map(p => (
            <span key={p.id} className="flex items-center gap-1 text-xs text-amber-700">
              <span className={`w-1.5 h-1.5 rounded-full ${p.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
              {p.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MatchCard({
  match, canEditScore, onScoreUpdate, editMode, selectedPlayer, onPlayerClick, showNtrp,
}: {
  match: Match;
  canEditScore: boolean;
  onScoreUpdate: (id: string, s1: string, s2: string) => void;
  editMode: boolean;
  selectedPlayer: SelectedPlayer;
  onPlayerClick: (matchId: string, team: 'team1' | 'team2', slot: 'player1' | 'player2', player: Player) => void;
  showNtrp: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [score1, setScore1] = useState(match.score1 || '');
  const [score2, setScore2] = useState(match.score2 || '');

  const handleSave = () => {
    onScoreUpdate(match.id, score1, score2);
    setEditing(false);
  };

  const t1Ntrp = ((match.team1.player1.ntrp + match.team1.player2.ntrp) / 2).toFixed(1);
  const t2Ntrp = ((match.team2.player1.ntrp + match.team2.player2.ntrp) / 2).toFixed(1);

  return (
    <div className={`p-4 border-l-4 ${matchTypeBg[match.matchType]}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-600 text-sm">{match.court}번 코트</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${matchTypeBadge[match.matchType]}`}>
            {matchTypeLabel[match.matchType]}
          </span>
        </div>
        {match.isCompleted && (
          <span className="text-xs text-slate-400">✓ 완료</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Team 1 */}
        <div className="flex-1 bg-white rounded-xl p-3 border border-slate-200">
          <div className="space-y-1">
            <PlayerBadge
              player={match.team1.player1}
              editMode={editMode}
              isSelected={selectedPlayer?.matchId === match.id && selectedPlayer?.team === 'team1' && selectedPlayer?.slot === 'player1'}
              onClick={() => onPlayerClick(match.id, 'team1', 'player1', match.team1.player1)}
              showNtrp={showNtrp}
            />
            <PlayerBadge
              player={match.team1.player2}
              editMode={editMode}
              isSelected={selectedPlayer?.matchId === match.id && selectedPlayer?.team === 'team1' && selectedPlayer?.slot === 'player2'}
              onClick={() => onPlayerClick(match.id, 'team1', 'player2', match.team1.player2)}
              showNtrp={showNtrp}
            />
          </div>
          {showNtrp && <div className="text-xs text-slate-400 mt-2">평균 {t1Ntrp}</div>}
        </div>

        {/* Score */}
        <div className="text-center px-1 flex flex-col items-center gap-1">
          {editing ? (
            <>
              <div className="flex items-center gap-1">
                <input
                  value={score1}
                  onChange={e => setScore1(e.target.value)}
                  className="w-10 text-center border border-slate-300 rounded-lg py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="0"
                />
                <span className="text-slate-400 text-xs font-bold">:</span>
                <input
                  value={score2}
                  onChange={e => setScore2(e.target.value)}
                  className="w-10 text-center border border-slate-300 rounded-lg py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="0"
                />
              </div>
              <div className="flex gap-1">
                <button onClick={handleSave} className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700">저장</button>
                <button onClick={() => setEditing(false)} className="px-2 py-1 bg-slate-200 text-slate-600 text-xs rounded hover:bg-slate-300">취소</button>
              </div>
            </>
          ) : (
            <>
              {match.isCompleted ? (
                <div className="flex items-center gap-1">
                  <span className="text-lg font-bold text-slate-800">{match.score1}</span>
                  <span className="text-xs text-slate-400 font-bold">:</span>
                  <span className="text-lg font-bold text-slate-800">{match.score2}</span>
                </div>
              ) : (
                <div className="text-slate-300 text-sm">vs</div>
              )}
              {canEditScore && !editMode && (
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs text-slate-400 hover:text-green-600"
                >
                  {match.isCompleted ? '수정' : '입력'}
                </button>
              )}
            </>
          )}
        </div>

        {/* Team 2 */}
        <div className="flex-1 bg-white rounded-xl p-3 border border-slate-200">
          <div className="space-y-1">
            <PlayerBadge
              player={match.team2.player1}
              editMode={editMode}
              isSelected={selectedPlayer?.matchId === match.id && selectedPlayer?.team === 'team2' && selectedPlayer?.slot === 'player1'}
              onClick={() => onPlayerClick(match.id, 'team2', 'player1', match.team2.player1)}
              showNtrp={showNtrp}
            />
            <PlayerBadge
              player={match.team2.player2}
              editMode={editMode}
              isSelected={selectedPlayer?.matchId === match.id && selectedPlayer?.team === 'team2' && selectedPlayer?.slot === 'player2'}
              onClick={() => onPlayerClick(match.id, 'team2', 'player2', match.team2.player2)}
              showNtrp={showNtrp}
            />
          </div>
          {showNtrp && <div className="text-xs text-slate-400 mt-2">평균 {t2Ntrp}</div>}
        </div>
      </div>
    </div>
  );
}

function PlayerBadge({
  player, editMode, isSelected, onClick, showNtrp,
}: {
  player: Player;
  editMode: boolean;
  isSelected: boolean;
  onClick: () => void;
  showNtrp: boolean;
}) {
  const content = (
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${player.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
      <span className="text-sm font-medium text-slate-800 truncate">{player.name}</span>
      {player.type === 'guest' && (
        <span className="text-xs bg-orange-100 text-orange-600 px-1 rounded">G</span>
      )}
      {showNtrp && <span className="text-xs font-mono text-slate-400 ml-auto">{player.ntrp.toFixed(1)}</span>}
    </div>
  );

  if (editMode) {
    return (
      <button
        onClick={onClick}
        className={`w-full text-left rounded-lg px-1.5 py-0.5 transition-colors ${
          isSelected
            ? 'bg-yellow-300 border border-yellow-500'
            : 'hover:bg-yellow-100 border border-transparent'
        }`}
      >
        {content}
      </button>
    );
  }

  return <div>{content}</div>;
}
