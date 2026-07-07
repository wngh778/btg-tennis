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
}: VoteTabProps) {
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
          {session.trackLate && myAttendance === true && (
            <div className="mt-3 pt-3 border-t border-slate-200 flex items-center gap-2">
              <span className="text-xs text-slate-500 mr-1">지각여부</span>
              <button
                onClick={() => canVote && handleMemberLate(myMember, false)}
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
                onClick={() => canVote && handleMemberLate(myMember, true)}
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
              return (
                <div key={m.id} className={`px-5 py-3 flex items-center justify-between transition-colors ${
                  attending === true
                    ? isMe ? 'bg-green-100' : 'bg-green-50'
                    : isMe ? 'bg-green-50' : ''
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${m.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                    <span className={`font-medium ${attending === true ? 'text-green-700' : isMe ? 'text-green-700' : 'text-slate-800'}`}>{m.name}</span>
                    {isMe && <span className="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full">나</span>}
                    {isAdminUser && <span className="text-xs font-mono text-slate-400">{m.ntrp.toFixed(1)}</span>}
                  </div>
                  <div className="flex gap-2 items-center">
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
                    {session.trackLate ? (
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
            guests.map(g => (
              editingGuestId === g.id ? (
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
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded text-xs font-medium">게스트</span>
                    <span className={`w-2 h-2 rounded-full ${g.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                    <span className="font-medium text-slate-800">{g.name}</span>
                    {isAdminUser && <span className="text-xs font-mono text-slate-400">{g.ntrp.toFixed(1)}</span>}
                    <span className="text-xs text-slate-400">{g.gender === 'male' ? '남' : '여'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* 게스트 지각 토글 */}
                    {session.trackLate && isAdminUser && (() => {
                      const rec = attendance.find(a => a.playerId === g.id);
                      const attending = rec?.attending ?? false;
                      return attending ? (
                        <button
                          onClick={() => handleGuestLate(g, !(rec?.isLate ?? false))}
                          className={`w-10 py-1 rounded text-xs font-medium text-center transition-colors ${
                            rec?.isLate
                              ? 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                              : 'bg-green-50 text-green-600 hover:bg-green-100'
                          }`}
                        >
                          {rec?.isLate ? '지각' : '정시'}
                        </button>
                      ) : null;
                    })()}
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
              )
            ))
          )}
        </div>
      </div>
    </div>
  );
}

