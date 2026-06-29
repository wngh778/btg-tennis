-- ============================================================
-- attendance.player_name을 현재 members.name으로 일괄 동기화
-- 목적: 멤버 이름이 변경되었으나 attendance 스냅샷이 구버전으로 남아 있는 경우 수정
-- 실행 방법: Supabase 대시보드 > SQL Editor 에서 실행
-- ============================================================

-- 1. 실제 이름과 불일치 현황 확인 (실행 전 선택 실행 권장)
SELECT
  a.player_id,
  m.name AS current_name,
  a.player_name AS stored_name,
  COUNT(*) AS record_count
FROM attendance a
JOIN members m ON m.id = a.player_id
WHERE a.player_type = 'member'
  AND a.player_name <> m.name
GROUP BY a.player_id, m.name, a.player_name
ORDER BY m.name;

-- 2. attendance.player_name을 members.name으로 업데이트
UPDATE attendance a
SET player_name = m.name
FROM members m
WHERE a.player_id = m.id
  AND a.player_type = 'member'
  AND a.player_name <> m.name;

-- ※ matches 테이블의 team1/team2 JSON 내 이름은 대진표 재생성 시 자동 반영됩니다.
--   기존 경기 JSON의 이름을 수정하려면 아래 쿼리 사용 (주의: 신중하게 실행하세요)
-- UPDATE matches
-- SET
--   team1 = jsonb_set(jsonb_set(team1, '{player1,name}',
--             (SELECT to_jsonb(name) FROM members WHERE id = (team1->'player1'->>'id')::uuid), false),
--             '{player2,name}',
--             (SELECT to_jsonb(name) FROM members WHERE id = (team1->'player2'->>'id')::uuid), false),
--   team2 = jsonb_set(jsonb_set(team2, '{player1,name}',
--             (SELECT to_jsonb(name) FROM members WHERE id = (team2->'player1'->>'id')::uuid), false),
--             '{player2,name}',
--             (SELECT to_jsonb(name) FROM members WHERE id = (team2->'player2'->>'id')::uuid), false)
-- WHERE EXISTS (SELECT 1 FROM members WHERE id = (team1->'player1'->>'id')::uuid);
