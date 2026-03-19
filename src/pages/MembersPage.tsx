import { useEffect, useState } from 'react';
import { getMembers, addMember, updateMember, deleteMember } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { NTRP_OPTIONS } from '../utils/matchmaking';
import type { Member, Gender } from '../types';

const ntrpLabel = (n: number) => n.toFixed(1);

function MemberForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Member>;
  onSave: (data: Omit<Member, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [gender, setGender] = useState<Gender>(initial?.gender || 'male');
  const [ntrp, setNtrp] = useState(initial?.ntrp || 3.0);
  const [isActive, setIsActive] = useState(initial?.isActive !== false);

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        onSave({ name: name.trim(), gender, ntrp, isActive });
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">이름</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">성별</label>
          <select
            value={gender}
            onChange={e => setGender(e.target.value as Gender)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="male">남성</option>
            <option value="female">여성</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">NTRP</label>
          <select
            value={ntrp}
            onChange={e => setNtrp(parseFloat(e.target.value))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {NTRP_OPTIONS.map(n => (
              <option key={n} value={n}>{ntrpLabel(n)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">활동 여부</label>
          <select
            value={isActive ? 'true' : 'false'}
            onChange={e => setIsActive(e.target.value === 'true')}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="true">활동</option>
            <option value="false">비활동</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
          취소
        </button>
        <button type="submit" className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors">
          저장
        </button>
      </div>
    </form>
  );
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const { isAdminUser, loading: authLoading } = useAuth();

  const load = async () => {
    try {
      const data = await getMembers();
      setMembers(data);
    } catch (e) {
      console.error('members load error:', e);
    } finally {
      setLoading(false);
    }
  };

  // useEffect는 조건부 early return 전에 항상 호출되어야 함 (React hooks 규칙)
  useEffect(() => {
    if (!authLoading && isAdminUser) load();
    else if (!authLoading) setLoading(false);
  }, [authLoading, isAdminUser]);

  if (!isAdminUser && !authLoading) {
    return <div className="text-center py-16 text-slate-500">접근 권한이 없습니다.</div>;
  }

  const handleAdd = async (data: Omit<Member, 'id' | 'createdAt'>) => {
    await addMember(data);
    setShowAdd(false);
    load();
  };

  const handleUpdate = async (id: string, data: Omit<Member, 'id' | 'createdAt'>) => {
    await updateMember(id, data);
    setEditId(null);
    load();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`${name} 회원을 삭제하시겠습니까?`)) return;
    await deleteMember(id);
    load();
  };

  const displayed = members.filter(m => showInactive || m.isActive);
  const males = displayed.filter(m => m.gender === 'male');
  const females = displayed.filter(m => m.gender === 'female');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">회원 목록</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
              className="rounded"
            />
            비활동 포함
          </label>
          {isAdminUser && (
            <button
              onClick={() => setShowAdd(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              + 회원 추가
            </button>
          )}
        </div>
      </div>

      {showAdd && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-4">새 회원 추가</h2>
          <MemberForm onSave={handleAdd} onCancel={() => setShowAdd(false)} />
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-500">불러오는 중...</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {[{ label: '남성', list: males }, { label: '여성', list: females }].map(({ label, list }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 rounded-t-2xl flex items-center justify-between">
                <h2 className="font-semibold text-slate-700">{label} ({list.length}명)</h2>
              </div>
              <div className="scrollable-box" style={{ maxHeight: '384px' }}>
                <div className="divide-y divide-slate-100">
                {list.length === 0 ? (
                  <p className="px-5 py-6 text-slate-400 text-sm text-center">회원이 없습니다.</p>
                ) : (
                  list.map(m => (
                    <div key={m.id} className="px-5 py-3">
                      {editId === m.id ? (
                        <MemberForm
                          initial={m}
                          onSave={data => handleUpdate(m.id, data)}
                          onCancel={() => setEditId(null)}
                        />
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-slate-800">{m.name}</span>
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-mono">
                              {ntrpLabel(m.ntrp)}
                            </span>
                            {!m.isActive && (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-xs">비활동</span>
                            )}
                          </div>
                          {isAdminUser && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => setEditId(m.id)}
                                className="text-slate-400 hover:text-slate-600 text-sm"
                              >
                                수정
                              </button>
                              <button
                                onClick={() => handleDelete(m.id, m.name)}
                                className="text-red-400 hover:text-red-600 text-sm"
                              >
                                삭제
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
