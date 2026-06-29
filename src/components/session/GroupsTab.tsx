import { useState } from 'react';
import type { Player, Member, SessionGroup } from '../../types';
import { addSessionGroup, updateSessionGroup, deleteSessionGroup } from '../../lib/database';

// 드래그 중인 선수 정보
type DraggingInfo = {
  playerId: string;
  sourceGroupId: string | null; // null = 미배정 영역
};

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
  const [dragging, setDragging] = useState<DraggingInfo | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null); // group.id | 'unassigned'

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

  // ── 드래그앤드랍 핸들러 ──────────────────────────────────────────────────

  const onDragStart = (playerId: string, sourceGroupId: string | null) => {
    setDragging({ playerId, sourceGroupId });
  };

  const onDragEnd = () => {
    setDragging(null);
    setDragOverId(null);
  };

  /** 드롭: 특정 조 카드 위에 */
  const onDropToGroup = async (targetGroupId: string) => {
    setDragOverId(null);
    if (!dragging) return;
    if (dragging.sourceGroupId === targetGroupId) return; // 같은 조면 무시
    await handleAddToGroup(targetGroupId, dragging.playerId);
    setDragging(null);
  };

  /** 드롭: 미배정 영역 위에 → 조에서 제거 */
  const onDropToUnassigned = async () => {
    setDragOverId(null);
    if (!dragging || !dragging.sourceGroupId) return; // 이미 미배정이면 무시
    await handleRemoveFromGroup(dragging.sourceGroupId, dragging.playerId);
    setDragging(null);
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* 미배정 인원 */}
      <div
        className={`rounded-2xl p-4 border-2 transition-colors ${
          dragging && dragging.sourceGroupId !== null && dragOverId === 'unassigned'
            ? 'bg-amber-100 border-amber-400 border-dashed'
            : unassigned.length > 0
              ? 'bg-amber-50 border-amber-200'
              : 'bg-slate-50 border-dashed border-slate-200'
        }`}
        onDragOver={e => {
          // 조에 배정된 선수를 드래그할 때만 미배정 영역을 드롭 존으로 활성화
          if (dragging && dragging.sourceGroupId !== null) {
            e.preventDefault();
            setDragOverId('unassigned');
          }
        }}
        onDragLeave={() => {
          if (dragOverId === 'unassigned') setDragOverId(null);
        }}
        onDrop={e => { e.preventDefault(); onDropToUnassigned(); }}
      >
        <h3 className={`font-semibold mb-2 text-sm ${
          dragOverId === 'unassigned' ? 'text-amber-700' : 'text-amber-800'
        }`}>
          {dragOverId === 'unassigned'
            ? '여기에 놓으면 미배정으로 이동합니다'
            : `미배정 인원 (${unassigned.length}명)`}
        </h3>
        {unassigned.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {unassigned.map(p => (
              <div
                key={p.id}
                draggable
                onDragStart={() => onDragStart(p.id, null)}
                onDragEnd={onDragEnd}
                className={`flex items-center gap-1 bg-white border border-amber-200 rounded-lg px-2 py-1 cursor-grab active:cursor-grabbing select-none transition-opacity ${
                  dragging?.playerId === p.id ? 'opacity-40' : 'opacity-100'
                }`}
              >
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
        ) : (
          <p className="text-sm text-amber-400">
            {dragOverId === 'unassigned' ? '' : '모든 선수가 배정됐습니다'}
          </p>
        )}
      </div>

      {/* 각 조 카드 */}
      {groups.map(group => {
        const groupPlayers = group.memberIds
          .map(id => candidatePlayers.find(p => p.id === id))
          .filter(Boolean) as Player[];

        const isDropTarget = dragOverId === group.id;

        return (
          <div
            key={group.id}
            className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden transition-colors ${
              isDropTarget
                ? 'border-purple-400 shadow-purple-100'
                : 'border-slate-200'
            }`}
            onDragOver={e => {
              if (dragging && dragging.sourceGroupId !== group.id) {
                e.preventDefault();
                setDragOverId(group.id);
              }
            }}
            onDragLeave={e => {
              // 자식 요소로 이동 시 leave 이벤트 방지
              const related = e.relatedTarget as Node | null;
              if (!e.currentTarget.contains(related)) {
                if (dragOverId === group.id) setDragOverId(null);
              }
            }}
            onDrop={e => { e.preventDefault(); onDropToGroup(group.id); }}
          >
            <div className={`px-5 py-3 border-b flex items-center justify-between transition-colors ${
              isDropTarget ? 'bg-purple-100 border-purple-200' : 'bg-purple-50 border-purple-100'
            }`}>
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
                  <h3 className="font-bold text-purple-800">
                    {group.name}{' '}
                    <span className="font-normal text-purple-600 text-sm">({groupPlayers.length}명)</span>
                    {isDropTarget && <span className="ml-2 text-xs text-purple-500 font-normal">여기에 놓기</span>}
                  </h3>
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
            <div className={`p-3 flex flex-wrap gap-2 min-h-12 transition-colors ${
              isDropTarget ? 'bg-purple-50' : ''
            }`}>
              {groupPlayers.map(p => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={() => onDragStart(p.id, group.id)}
                  onDragEnd={onDragEnd}
                  className={`flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 cursor-grab active:cursor-grabbing select-none transition-opacity ${
                    dragging?.playerId === p.id ? 'opacity-40' : 'opacity-100'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${p.gender === 'male' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                  <span className="text-sm font-medium text-slate-700">{p.name}</span>
                  <button
                    onClick={() => handleRemoveFromGroup(group.id, p.id)}
                    className="text-slate-300 hover:text-red-500 ml-0.5 transition-colors"
                    onMouseDown={e => e.stopPropagation()} // 클릭 시 드래그 시작 방지
                  >
                    ×
                  </button>
                </div>
              ))}
              {groupPlayers.length === 0 && (
                <p className="text-sm text-slate-300 self-center">
                  {isDropTarget ? '' : '멤버를 배정하세요'}
                </p>
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
