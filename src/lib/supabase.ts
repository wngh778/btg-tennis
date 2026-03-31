import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// 인메모리 락: 동일 탭 내 토큰 갱신 직렬화
// Navigator.locks(기본)는 이전 탭이 stale lock을 남기는 문제가 있어 사용 불가
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const inMemoryLock = (() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const locks = new Map<string, Promise<any>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
    const existing = locks.get(name);
    if (existing) {
      try { await existing; } catch { /* ignore */ }
    }
    const promise = fn();
    locks.set(name, promise);
    try {
      return await promise;
    } finally {
      if (locks.get(name) === promise) {
        locks.delete(name);
      }
    }
  };
})();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // 백그라운드 자동 토큰 갱신 비활성화
    // 브라우저가 백그라운드 탭의 타이머/네트워크를 제한하면
    // 자동 갱신이 실패 → Supabase 내부 상태 오염 → 복귀 후 모든 API 멈춤
    // 대신 탭 복귀 시 수동으로 getSession() 호출하여 토큰 갱신
    autoRefreshToken: false,
    lock: inMemoryLock,
  },
});
