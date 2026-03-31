import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useClub } from '../contexts/ClubContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { updateAppUser } from '../lib/database';

export default function AccountPage() {
  const { user, appUser, loading } = useAuth();
  const { currentClub, availableClubs, setCurrentClub } = useClub();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && (!user || !appUser)) {
      navigate('/login');
    }
  }, [loading, user, appUser, navigate]);

  if (loading) return <div className="text-center py-16 text-slate-500">불러오는 중...</div>;
  if (!user || !appUser) return <div className="text-center py-16 text-slate-500">불러오는 중...</div>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');

    if (newPassword.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setSuccess('비밀번호가 변경되었습니다.');
      setNewPassword(''); setConfirmPassword('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      <h1 className="text-xl font-bold text-slate-800">내 계정</h1>

      {/* 계정 정보 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-700 mb-3">계정 정보</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">아이디</span>
            <span className="font-medium text-slate-800">{appUser.username}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">권한</span>
            <span className={`font-medium ${appUser.role === 'superadmin' ? 'text-red-600' : appUser.role === 'admin' ? 'text-purple-600' : 'text-green-600'}`}>
              {appUser.role === 'superadmin' ? '슈퍼관리자' : appUser.role === 'admin' ? '관리자' : '회원'}
            </span>
          </div>
          {availableClubs.length > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-slate-500">소속 클럽</span>
              <span className="font-medium text-slate-800">{availableClubs.map(c => c.name).join(', ')}</span>
            </div>
          )}
        </div>
      </div>

      {/* 기본 클럽 설정 (클럽이 여러 개일 때) */}
      {availableClubs.length > 1 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-700 mb-3">기본 클럽 설정</h2>
          <p className="text-xs text-slate-500 mb-3">로그인 시 처음 보여줄 클럽을 선택합니다.</p>
          <div className="space-y-2">
            {availableClubs.map(club => (
              <label key={club.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="defaultClub"
                  checked={currentClub?.id === club.id}
                  onChange={async () => {
                    setCurrentClub(club);
                    if (appUser) await updateAppUser(appUser.id, { defaultClubId: club.id });
                  }}
                  className="text-green-600"
                />
                <span className="text-sm font-medium text-slate-800">{club.name}</span>
                <span className="text-xs text-slate-400">{club.defaultCourts}개 코트</span>
                {currentClub?.id === club.id && <span className="ml-auto text-xs text-green-600 font-medium">현재 선택</span>}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* 비밀번호 변경 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-700 mb-4">비밀번호 변경</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">새 비밀번호</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={6}
              placeholder="6자 이상"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">새 비밀번호 확인</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              placeholder="비밀번호 재입력"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          {success && <p className="text-sm text-green-600 font-medium">{success}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '변경 중...' : '비밀번호 변경'}
          </button>
        </form>
      </div>
    </div>
  );
}
