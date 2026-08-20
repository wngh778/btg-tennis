-- 도착 순위 기능: attendance 테이블에 arrival_order 컬럼 추가
-- 실행: Supabase 대시보드 > SQL Editor에서 실행

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS arrival_order INTEGER DEFAULT NULL;

-- 코멘트 추가
COMMENT ON COLUMN attendance.arrival_order IS '도착 순서 (1=첫 번째 도착, 2=두 번째 도착, ...). NULL=미설정';
