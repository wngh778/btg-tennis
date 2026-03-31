import { useState } from 'react';
import type { Player, Member, SessionGroup } from '../../types';
import { addSessionGroup, updateSessionGroup, deleteSessionGroup } from '../../lib/database';

export function GroupsTab({
  groups, session, members, attendingPlayers, onGroupsChanged, isAdmin: _isAdmin
}: {
  groups: SessionGroup[];
  session: { id: string };
  members: Member[];
  attendingPlayers: Player[];
  onGroupsChanged: () => void;
  isAdmin: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const assignedIds = new Set(groups.flatMap(g => g.memberIds));
  // 참석 투표한 인원이 있으면 그 인원 기준, 없으면 전체 활성 멤버 기준
  const candidatePlayers: Player[] = attendingPlayers.length > 0
    ? attendingPlayers
    : members.filter(m => m.isActive).map(m => ({ id: m.id, name: m.name, gender: m.gender, ntrp: m.ntrp, type: 'member' as const }));
  const unassigned = candidatePlayers.filter(p => !assignedIds.has(p.id));

  const handleAddToGroup = async (groupId: string, playerId: string) => {
    // 다른 그룹에서 제거
    for (const g of groups) {
      if (g.id !== groupId && g.memberIds.includes(playerId)) {
        await updateSessionGroup(g.id, { memberIds: g.memberIds.filter(id => id !== playerId) });
      }
    }
    const group = groups.find(g => g.id === groupId)!;
    if (!group.memberIds.includes(playerId)) {
      await updateSessionGroup(groupId, { memberIds: [...group.memberIds, playerId] });
    }
    onGroupsChanged();
  };

  const handleRemoveFromGroup = async (groupId: string, playerId: string) => {
    const group = groups.find(g => g.id === groupId)!;
    await updateSessionGroup(groupId, { memberIds: group.memberIds.filter(id => id !== playerId) });
    onGroupsChanged();
  };

  const handleAddGroup = async () => {
    const name = String.fromCharCode(65 + groups.length) + '조';
    await addSessionGroup({ sessionId: session.id, name, orderNum: groups.length });
    onGroupsChanged();
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('이 조를 삭제하시겠습니까?')) return;
    await deleteSessionGroup(groupId);
    onGroupsChanged();
  };

  const handleRenameGroup = async (groupId: string) => {
    if (!editName.trim()) return;
    await updateSessionGroup(groupId, { name: editName.trim() });
    setEditingId(null);
    setEditName('');
    onGroupsChanged();
  };

  return (
    <div className="space-y-4">
      {/* 미배정 인원 */}
      {unassigned.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <h3 className="font-semibold text-amber-800 mb-2 text-sm">미배정 인원 ({unassigned.length}명)</h3>
          <div className="flex flex-wrap gap-2">
            {unassigned.map(p => (
              <div key={p.id} className="flex items-center gap-1 bg-white border border-amber-200 rounded-lg px-2 py-1">
                <span className={`w-2 h-2 rounded-full ${p.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                <span className="text-sm font-medium text-slate-700">{p.name}</span>
                <div className="flex gap-1 ml-1">
                  {groups.map(g => (
                    <button
                      key={g.id}
                      onClick={() => handleAddToGroup(g.id, p.id)}
                      className="text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 rounded px-1.5 py-0.5 transition-colors"
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 각 조 카드 */}
      {groups.map(group => {
        const groupPlayers = group.memberIds
          .map(id => candidatePlayers.find(p => p.id === id))
          .filter(Boolean) as Player[];
        return (
          <div key={group.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-purple-50 border-b border-purple-100 flex items-center justify-between">
              {editingId === group.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="border border-purple-300 rounded-lg px-2 py-1 text-sm flex-1 max-w-32 focus:outline-none focus:ring-2 focus:ring-purple-400"
                    autoFocus
                  />
                  <button onClick={() => handleRenameGroup(group.id)} className="text-xs bg-purple-600 text-white px-2 py-1 rounded-lg">확인</button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-slate-500 px-2 py-1">취소</button>
                </div>
              ) : (
                <>
                  <h3 className="font-bold text-purple-800">{group.name} <span className="font-normal text-purple-600 text-sm">({groupPlayers.length}명)</span></h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditingId(group.id); setEditName(group.name); }}
                      className="text-xs text-purple-600 hover:text-purple-800"
                    >
                      이름변경
                    </button>
                    <button
                      onClick={() => handleDeleteGroup(group.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      조삭제
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="p-3 flex flex-wrap gap-2 min-h-12">
              {groupPlayers.map(p => (
                <div key={p.id} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                  <span className={`w-2 h-2 rounded-full ${p.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                  <span className="text-sm font-medium text-slate-700">{p.name}</span>
                  <button
                    onClick={() => handleRemoveFromGroup(group.id, p.id)}
                    className="text-slate-300 hover:text-red-500 ml-0.5 transition-colors"
                  >
                    ×
                  </button>
                </div>
              ))}
              {groupPlayers.length === 0 && (
                <p className="text-sm text-slate-300 self-center">멤버를 배정하세요</p>
              )}
            </div>
          </div>
        );
      })}

      {/* 조 추가 버튼 */}
      <button
        onClick={handleAddGroup}
        className="w-full py-3 border-2 border-dashed border-purple-200 rounded-2xl text-purple-500 hover:border-purple-400 hover:text-purple-700 text-sm font-medium transition-colors"
      >
        + 조 추가
      </button>
    </div>
  );
}
