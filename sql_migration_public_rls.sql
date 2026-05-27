-- ============================================================
-- 공개 대진표 접근 권한: anon 사용자 SELECT 허용
-- 목적: /c/:clubId/:sessionId 공개 링크에서 로그인 없이 대진표 열람 가능
-- 적용 대상 테이블: clubs, sessions, matches, attendance, guests, session_groups
-- 실행 방법: Supabase 대시보드 > SQL Editor 에서 실행
-- ============================================================

-- 기존에 동일 이름의 정책이 있으면 먼저 삭제 후 재생성
DROP POLICY IF EXISTS "Public anon read clubs" ON clubs;
DROP POLICY IF EXISTS "Public anon read sessions" ON sessions;
DROP POLICY IF EXISTS "Public anon read matches" ON matches;
DROP POLICY IF EXISTS "Public anon read attendance" ON attendance;
DROP POLICY IF EXISTS "Public anon read guests" ON guests;
DROP POLICY IF EXISTS "Public anon read session_groups" ON session_groups;

-- anon 사용자에게 SELECT 허용 (공개 읽기 전용)
CREATE POLICY "Public anon read clubs"
  ON clubs FOR SELECT TO anon USING (true);

CREATE POLICY "Public anon read sessions"
  ON sessions FOR SELECT TO anon USING (true);

CREATE POLICY "Public anon read matches"
  ON matches FOR SELECT TO anon USING (true);

CREATE POLICY "Public anon read attendance"
  ON attendance FOR SELECT TO anon USING (true);

CREATE POLICY "Public anon read guests"
  ON guests FOR SELECT TO anon USING (true);

CREATE POLICY "Public anon read session_groups"
  ON session_groups FOR SELECT TO anon USING (true);
