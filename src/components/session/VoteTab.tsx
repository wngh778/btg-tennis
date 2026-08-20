import type React from 'react';
import type { Session, Member, Guest, AttendanceRecord, Gender } from '../../types';
import type { AppUser } from '../../types';
import { NTRP_OPTIONS } from '../../utils/matchmaking';
import type { User } from '@supabase/supabase-js';

interface VoteTabProps {
  session: Session;
  activeMembers: Member[];
  guests: Guest[];
  attendance: AttendanceRecord[];
  isAdminUser: boolean;
  user: User | null;
  appUser: AppUser | null;
  canVote: boolean;
  votingOpen: boolean;
  myMember: Member | null;
  myAttendance: boolean | null;
  myIsLate: boolean | undefined;
  canVoteForMember: (memberId: string) => boolean;
  // 게스트 폼 상태
  showGuestForm: boolean;
  guestName: string;
  guestGender: Gender;
  guestNtrp: number;
  editingGuestId: string | null;
  editGuestName: string;
  editGuestGender: Gender;
  editGuestNtrp: number;
  setShowGuestForm: (v: boolean) => void;
  setGuestName: (v: string) => void;
  setGuestGender: (v: Gender) => void;
  setGuestNtrp: (v: number) => void;
  setEditingGuestId: (v: string | null) => void;
  setEditGuestName: (v: string) => void;
  setEditGuestGender: (v: Gender) => void;
  setEditGuestNtrp: (v: number) => void;
  handleAddGuest: (e: React.FormEvent) => void;
  handleRemoveGuest: (guest: Guest) => void;
  handleStartEditGuest: (guest: Guest) => void;
  handleSaveEditGuest: () => void;
  // 투표 핸들러
  handleMemberVote: (member: Member, attending: boolean) => void;
  handleMemberLate: (member: Member, isLate: boolean) => void;
  handleGuestLate: (guest: Guest, isLate: boolean) => void;
  // 도착 순위 (관리자 전용)
  handleArrivalOrder: (playerId: string, playerType: 'member' | 'guest', order: number | null) => void;
  // 도착 순위 위아래 교환 (관리자 전용)
  handleSwapArrival: (playerId: string, playerType: 'member' | 'guest', direction: 'up' | 'down') => void;
}

export function VoteTab({
  session,
  activeMembers,
  guests,
  attendance,
  isAdminUser,
  user,
  appUser,
  canVote,
  myMember,
  myAttendance,
  myIsLate,
  canVoteForMember,
  showGuestForm,
  guestName,
  guestGender,
  guestNtrp,
  editingGuestId,
  editGuestName,
  editGuestGender,
  editGuestNtrp,
  setShowGuestForm,
  setGuestName,
  setGuestGender,
  setGuestNtrp,
  setEditingGuestId,
  setEditGuestName,
  setEditGuestGender,
  setEditGuestNtrp,
  handleAddGuest,
  handleRemoveGuest,
  handleStartEditGuest,
  handleSaveEditGuest,
  handleMemberVote,
  handleMemberLate,
  handleGuestLate,
  handleArrivalOrder,
  handleSwapArrival,
}: VoteTabProps) {
  // 등록된 수 + 1 방식: 삭제 후 재등록해도 빈 번호 없이 이어짐
  const getNextRank = () => {
    const registeredCount = attendance.filter(a => a.attending && a.arrivalOrder != null).length;
    return registeredCount + 1;
  };

  // 도착 순서 패널용: 참석 + 순위 있는 선수를 순서대로 정렬
  const sortedArrivals = attendance
    .filter(a => a.attending && a.arrivalOrder != null)
    .map(a => {
      const member = activeMembers.find(m => m.id === a.playerId);
      const guest = guests.find(g => g.id === a.playerId);
      return {
        playerId: a.playerId,
        playerType: a.playerType as 'member' | 'guest',
        name: member?.name ?? guest?.name ?? a.playerName,
        gender: a.gender,
        order: a.arrivalOrder as number,
        isGuest: a.playerType === 'guest',
      };
    })
    .sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4">
      {!canVote && !isAdminUser && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-700">
          투표 마감 후에는 관리자만 참석 여부를 변경할 수 있습니다.
        </div>
      )}

      {/* 내 참석 투표 박스 */}
      {user && myMember && (
        <div className={`rounded-2xl border-2 p-5 ${
          myAttendance === true ? 'bg-green-50 border-green-300' :
          myAttendance === false ? 'bg-red-50 border-red-200' :
          'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 mb-0.5">내 참석 여부</p>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${myMember.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                <p className="text-lg font-bold text-slate-800">{myMember.name}</p>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {myAttendance === true ? '✅ 참석 예정' : myAttendance === false ? '❌ 불참' : '미응답'}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => canVote && handleMemberVote(myMember, true)}
                disabled={!canVote}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                  myAttendance === true
                    ? 'bg-green-500 text-white shadow-sm'
                    : canVote
                    ? 'bg-slate-100 text-slate-600 hover:bg-green-100 hover:text-green-700'
                    : 'bg-slate-50 text-slate-400 cursor-not-allowed'
                }`}
              >
                참석
              </button>
              <button
                onClick={() => canVote && handleMemberVote(myMember, false)}
                disabled={!canVote}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                  myAttendance === false
                    ? 'bg-red-400 text-white shadow-sm'
                    : canVote
                    ? 'bg-slate-100 text-slate-600 hover:bg-red-100 hover:text-red-500'
                    : 'bg-slate-50 text-slate-400 cursor-not-allowed'
                }`}
              >
                불참
              </button>
            </div>
          </div>
          {/* 정시/지각 버튼 — 나중에 쓸 수 있도록 숨김 처리 */}
          {false && session.trackLate && myAttendance === true && (
            <div className="mt-3 pt-3 border-t border-slate-200 flex items-center gap-2">
              <span className="text-xs text-slate-500 mr-1">지각여부</span>
              <button
                onClick={() => canVote && handleMemberLate(myMember!, false)}
                disabled={!canVote}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  myIsLate === false
                    ? 'bg-green-500 text-white'
                    : canVote
                    ? 'bg-slate-100 text-slate-600 hover:bg-green-100 hover:text-green-700'
                    : 'bg-slate-50 text-slate-400 cursor-not-allowed'
                }`}
              >
                정시참여
              </button>
              <button
                onClick={() => canVote && handleMemberLate(myMember!, true)}
                disabled={!canVote}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  myIsLate === true
                    ? 'bg-orange-400 text-white'
                    : canVote
                    ? 'bg-slate-100 text-slate-600 hover:bg-orange-100 hover:text-orange-600'
                    : 'bg-slate-50 text-slate-400 cursor-not-allowed'
                }`}
              >
                지각
              </button>
            </div>
          )}
        </div>
      )}

      {user && !myMember && !isAdminUser && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-500 text-center">
          계정({appUser?.username})과 연결된 회원을 찾을 수 없습니다. 관리자에게 문의하세요.
        </div>
      )}

      {/* ── 도착 순서 관리 패널 (관리자 + 1명 이상 등록 시) ────────────────── */}
      {isAdminUser && sortedArrivals.length > 0 && (
        <div className="bg-amber-50 rounded-2xl border border-amber-200 shadow-sm">
          <div className="px-5 py-3 border-b border-amber-100 flex items-center justify-between">
            <h2 className="font-semibold text-amber-800">도착 순서</h2>
            <span className="text-xs text-amber-600 font-medium">{sortedArrivals.length}명 등록</span>
          </div>
          <div className="px-4 py-2 divide-y divide-amber-100">
            {sortedArrivals.map((item, idx) => (
              <div key={item.playerId} className="flex items-center gap-2 py-2">
                {/* 순위 번호 */}
                <span className="w-6 text-center text-sm font-bold text-amber-600 shrink-0">
                  {item.order}
                </span>
                {/* 성별 도트 */}
                <span className={`w-2 h-2 rounded-full shrink-0 ${item.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                {/* 이름 */}
                <span className="flex-1 text-sm font-medium text-slate-800 truncate">{item.name}</span>
                {item.isGuest && (
                  <span className="text-xs bg-orange-100 text-orange-500 px-1.5 py-0.5 rounded shrink-0">게스트</span>
                )}
                {/* 순서 조작 버튼 */}
                <div className="flex gap-0.5 shrink-0">
                  <button
                    onClick={() => handleSwapArrival(item.playerId, item.playerType, 'up')}
                    disabled={idx === 0}
                    className="w-7 h-7 rounded-lg bg-white border border-amber-200 text-amber-600 text-xs flex items-center justify-center disabled:opacity-25 hover:bg-amber-100 active:bg-amber-200 transition-colors"
                    title="순서 올리기"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => handleSwapArrival(item.playerId, item.playerType, 'down')}
                    disabled={idx === sortedArrivals.length - 1}
                    className="w-7 h-7 rounded-lg bg-white border border-amber-200 text-amber-600 text-xs flex items-center justify-center disabled:opacity-25 hover:bg-amber-100 active:bg-amber-200 transition-colors"
                    title="순서 내리기"
                  >
                    ▼
                  </button>
                  <button
                    onClick={() => handleArrivalOrder(item.playerId, item.playerType, null)}
                    className="w-7 h-7 rounded-lg bg-white border border-red-200 text-red-400 text-xs flex items-center justify-center hover:bg-red-50 active:bg-red-100 transition-colors"
                    title="도착 등록 취소"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 pb-3">
            <p className="text-xs text-amber-500">
              ▲▼로 순서 변경 · 뱃지 클릭으로 등록 취소 (이후 순위 자동 당김)
            </p>
          </div>
        </div>
      )}

      {/* 회원 참석 여부 리스트 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 rounded-t-2xl flex items-center justify-between">
          <h2 className="font-semibold text-slate-700">회원 참석 여부</h2>
          <span className="text-sm text-slate-400">{activeMembers.length}명</span>
        </div>
        <div className="scrollable-box" style={{ maxHeight: '384px' }}>
          <div className="divide-y divide-slate-100">
            {activeMembers.map(m => {
              const rec = attendance.find(a => a.playerId === m.id);
              const attending = rec?.attending ?? null;
              const canVoteThis = canVoteForMember(m.id);
              const isMe = m.id === myMember?.id;
              const arrivalOrder = rec?.arrivalOrder;
              return (
                <div key={m.id} className={`px-5 py-3 flex items-center justify-between transition-colors ${
                  attending === true
                    ? isMe ? 'bg-green-100' : 'bg-green-50'
                    : isMe ? 'bg-green-50' : ''
                }`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${m.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                    <span className={`font-medium truncate ${attending === true ? 'text-green-700' : isMe ? 'text-green-700' : 'text-slate-800'}`}>{m.name}</span>
                    {isMe && <span className="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full shrink-0">나</span>}
                    {isAdminUser && <span className="text-xs font-mono text-slate-400 shrink-0">{m.ntrp.toFixed(1)}</span>}
                  </div>
                  <div className="flex gap-1.5 items-center shrink-0 ml-2">
                    <button
                      onClick={() => canVoteThis && handleMemberVote(m, true)}
                      disabled={!canVoteThis}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        attending === true
                          ? 'bg-green-500 text-white'
                          : canVoteThis
                          ? 'bg-slate-100 text-slate-600 hover:bg-green-100 hover:text-green-700'
                          : 'bg-slate-50 text-slate-300 cursor-not-allowed'
                      }`}
                    >
                      참석
                    </button>
                    <button
                      onClick={() => canVoteThis && handleMemberVote(m, false)}
                      disabled={!canVoteThis}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        attending === false
                          ? 'bg-red-400 text-white'
                          : canVoteThis
                          ? 'bg-slate-100 text-slate-600 hover:bg-red-100 hover:text-red-600'
                          : 'bg-slate-50 text-slate-300 cursor-not-allowed'
                      }`}
                    >
                      불참
                    </button>
                    {/* 정시/지각 버튼 — 나중에 쓸 수 있도록 숨김 처리 */}
                    {false && session.trackLate ? (
                      attending === true ? (
                        canVoteThis ? (
                          <button
                            onClick={() => handleMemberLate(m, !(rec?.isLate ?? false))}
                            className={`w-10 py-1 rounded text-xs font-medium text-center transition-colors ${
                              rec?.isLate
                                ? 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                                : 'bg-green-50 text-green-600 hover:bg-green-100'
                            }`}
                          >
                            {rec?.isLate ? '지각' : '정시'}
                          </button>
                        ) : (
                          <span className={`w-10 py-1 rounded text-xs font-medium text-center ${
                            rec?.isLate
                              ? 'bg-orange-100 text-orange-600'
                              : rec?.isLate === false
                              ? 'bg-green-50 text-green-600'
                              : 'bg-slate-100 text-slate-400'
                          }`}>
                            {rec?.isLate ? '지각' : rec?.isLate === false ? '정시' : '-'}
                          </span>
                        )
                      ) : (
                        <span className="w-10 py-1 rounded text-xs font-medium text-center bg-slate-100 text-slate-300">-</span>
                      )
                    ) : null}

                    {/* 도착 순위 — 관리자: 항상 칸 표시(레이아웃 고정), 참석 여부로 활성/비활성 전환 */}
                    {isAdminUser ? (
                      attending === true ? (
                        arrivalOrder != null ? (
                          // 참석 + 등록됨 → 클릭 시 취소
                          <button
                            onClick={() => handleArrivalOrder(m.id, 'member', null)}
                            title="도착 등록 취소"
                            className="min-w-[2.25rem] h-7 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center px-1.5 leading-none shrink-0 hover:bg-amber-600 active:bg-amber-700 transition-colors"
                          >
                            {arrivalOrder}번째
                          </button>
                        ) : (
                          // 참석 + 미등록 → 도착 등록 버튼 (활성)
                          <button
                            onClick={() => handleArrivalOrder(m.id, 'member', getNextRank())}
                            className="px-2 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 active:bg-amber-200 transition-colors whitespace-nowrap shrink-0"
                          >
                            도착 등록
                          </button>
                        )
                      ) : (
                        // 불참/미응답 → 비활성 칸 (레이아웃 유지)
                        <span className="px-2 py-1 rounded-lg text-xs font-medium bg-slate-50 text-slate-300 border border-slate-100 whitespace-nowrap shrink-0 select-none">
                          도착 등록
                        </span>
                      )
                    ) : (
                      // 비관리자: 등록된 경우 뱃지만 표시
                      arrivalOrder != null ? (
                        <span className="min-w-[2.25rem] h-7 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center px-1.5 leading-none shrink-0">
                          {arrivalOrder}번째
                        </span>
                      ) : null
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 게스트 섹션 */}
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
          <form onSubmit={handleAddGuest} className="px-4 sm:px-5 py-4 border-b border-slate-100 bg-green-50">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
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
            guests.map(g => {
              const gRec = attendance.find(a => a.playerId === g.id);
              const gAttending = gRec?.attending ?? false;
              const gArrivalOrder = gRec?.arrivalOrder;

              return editingGuestId === g.id ? (
                <div key={g.id} className="px-4 sm:px-5 py-3 bg-amber-50 border-b border-amber-100">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                    <input
                      value={editGuestName}
                      onChange={e => setEditGuestName(e.target.value)}
                      className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="이름"
                    />
                    <select
                      value={editGuestGender}
                      onChange={e => setEditGuestGender(e.target.value as Gender)}
                      className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="male">남성</option>
                      <option value="female">여성</option>
                    </select>
                    <select
                      value={editGuestNtrp}
                      onChange={e => setEditGuestNtrp(parseFloat(e.target.value))}
                      className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      {NTRP_OPTIONS.map(n => <option key={n} value={n}>{n.toFixed(1)}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditingGuestId(null)} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1">취소</button>
                    <button onClick={handleSaveEditGuest} className="px-3 py-1 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600">저장</button>
                  </div>
                </div>
              ) : (
                <div key={g.id} className="px-4 sm:px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded text-xs font-medium shrink-0">게스트</span>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${g.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                    <span className="font-medium text-slate-800 truncate">{g.name}</span>
                    {isAdminUser && <span className="text-xs font-mono text-slate-400 shrink-0">{g.ntrp.toFixed(1)}</span>}
                    <span className="text-xs text-slate-400 shrink-0">{g.gender === 'male' ? '남' : '여'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {/* 게스트 지각 토글 — 나중에 쓸 수 있도록 숨김 처리 */}
                    {false && session.trackLate && isAdminUser && gAttending && (
                      <button
                        onClick={() => handleGuestLate(g, !(gRec?.isLate ?? false))}
                        className={`w-10 py-1 rounded text-xs font-medium text-center transition-colors ${
                          gRec?.isLate
                            ? 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                            : 'bg-green-50 text-green-600 hover:bg-green-100'
                        }`}
                      >
                        {gRec?.isLate ? '지각' : '정시'}
                      </button>
                    )}

                    {/* 게스트 도착 순위 — 관리자: 항상 칸 표시(레이아웃 고정) */}
                    {isAdminUser ? (
                      gAttending ? (
                        gArrivalOrder != null ? (
                          // 참석 + 등록됨 → 클릭 시 취소
                          <button
                            onClick={() => handleArrivalOrder(g.id, 'guest', null)}
                            title="도착 등록 취소"
                            className="min-w-[2.25rem] h-7 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center px-1.5 leading-none shrink-0 hover:bg-amber-600 active:bg-amber-700 transition-colors"
                          >
                            {gArrivalOrder}번째
                          </button>
                        ) : (
                          // 참석 + 미등록 → 도착 등록 버튼 (활성)
                          <button
                            onClick={() => handleArrivalOrder(g.id, 'guest', getNextRank())}
                            className="px-2 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 active:bg-amber-200 transition-colors whitespace-nowrap shrink-0"
                          >
                            도착 등록
                          </button>
                        )
                      ) : (
                        // 미참석 → 비활성 칸 (레이아웃 유지)
                        <span className="px-2 py-1 rounded-lg text-xs font-medium bg-slate-50 text-slate-300 border border-slate-100 whitespace-nowrap shrink-0 select-none">
                          도착 등록
                        </span>
                      )
                    ) : (
                      // 비관리자: 등록된 경우 뱃지만
                      gArrivalOrder != null ? (
                        <span className="min-w-[2.25rem] h-7 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center px-1.5 leading-none shrink-0">
                          {gArrivalOrder}번째
                        </span>
                      ) : null
                    )}

                    {isAdminUser && (
                      <>
                        <button
                          onClick={() => handleStartEditGuest(g)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-amber-600 hover:bg-amber-50 transition-colors"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleRemoveGuest(g)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-50 transition-colors"
                        >
                          삭제
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
