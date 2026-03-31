import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// 모든 Supabase HTTP 요청에 15초 타임아웃 적용
// 탭 방치 후 복귀 시 네트워크 요청이 무한 대기하는 것을 방지
const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  if (init?.signal) {
    init.signal.addEventListener('abort', () => controller.abort());
  }
  return fetch(input, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timeout));
};

// 인메모리 락: 동일 탭 내 토큰 갱신 직렬화
// - Navigator.locks API(기본값)는 크로스탭 락인데, 이전 탭이 락을 남기고 닫히면
//   새 탭이 무한정 대기하는 문제가 있었음
// - lock을 완전히 비활성화(fn => fn())하면 탭 복귀 시 동시 토큰 갱신이 충돌하여
//   refresh token이 교체되면서 후속 갱신이 모두 실패 → API 호출 멈춤
// - 해결: 인메모리 Promise 기반 락으로 같은 탭 내 직렬화만 보장
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
    lock: inMemoryLock,
  },
  global: {
    fetch: fetchWithTimeout,
  },
});
