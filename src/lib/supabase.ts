import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // 크로스탭 토큰 갱신 락 비활성화
    // 기본값: localStorage 기반 락을 사용하여 여러 탭이 동시에 토큰 갱신하는 것을 막음
    // 문제: 이전 탭이 락을 남기고 닫히면 새 탭이 락을 무한정 기다리며 먹통이 됨
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lock: (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => fn(),
  },
});
