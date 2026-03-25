-- ================================================================
-- 멀티클럽 마이그레이션 스크립트
-- Supabase SQL Editor에서 순서대로 실행하세요.
-- ================================================================

-- 1. clubs 테이블 생성
CREATE TABLE IF NOT EXISTS clubs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  default_courts INT NOT NULL DEFAULT 4,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 기존 일요일 클럽 추가 (기존 데이터용)
INSERT INTO clubs (name, default_courts) VALUES ('일요일 클럽', 4);

-- 3. 기존 테이블에 club_id 컬럼 추가 (nullable로 먼저 추가)
ALTER TABLE members      ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id);
ALTER TABLE sessions     ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id);
ALTER TABLE guests       ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id);
ALTER TABLE matches      ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id);
ALTER TABLE attendance   ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id);

-- 4. 기존 데이터를 일요일 클럽으로 일괄 업데이트
UPDATE members    SET club_id = (SELECT id FROM clubs WHERE name = '일요일 클럽' LIMIT 1) WHERE club_id IS NULL;
UPDATE sessions   SET club_id = (SELECT id FROM clubs WHERE name = '일요일 클럽' LIMIT 1) WHERE club_id IS NULL;
UPDATE guests     SET club_id = (SELECT id FROM clubs WHERE name = '일요일 클럽' LIMIT 1) WHERE club_id IS NULL;
UPDATE matches    SET club_id = (SELECT id FROM clubs WHERE name = '일요일 클럽' LIMIT 1) WHERE club_id IS NULL;
UPDATE attendance SET club_id = (SELECT id FROM clubs WHERE name = '일요일 클럽' LIMIT 1) WHERE club_id IS NULL;

-- 5. app_users에 클럽 컬럼 추가
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS club_ids    UUID[] DEFAULT '{}';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS default_club_id UUID REFERENCES clubs(id);

-- 6. 기존 사용자 전체를 일요일 클럽으로 업데이트
UPDATE app_users SET
  club_ids       = ARRAY[(SELECT id FROM clubs WHERE name = '일요일 클럽' LIMIT 1)],
  default_club_id = (SELECT id FROM clubs WHERE name = '일요일 클럽' LIMIT 1);

-- ================================================================
-- [선택] 슈퍼관리자 계정 role 업데이트 (예: username = '관리자')
-- UPDATE app_users SET role = 'superadmin' WHERE username = '여기에_슈퍼관리자_아이디';
-- ================================================================

-- 7. RLS 정책 업데이트 (필요 시)
-- clubs 테이블은 기본적으로 authenticated 사용자 읽기 허용
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clubs_select" ON clubs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "clubs_insert" ON clubs FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "clubs_update" ON clubs FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "clubs_delete" ON clubs FOR DELETE USING (auth.role() = 'authenticated');

-- ================================================================
-- 완료! 위 스크립트 실행 후 앱을 재시작하세요.
-- ================================================================
