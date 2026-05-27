---
name: project_patterns
description: 코드베이스 핵심 패턴, 주의사항, 아키텍처 노트
type: project
---

## replace_all 사용 시 주의

`replace_all`로 함수명을 치환할 때, 새 함수 내부의 자기 자신 호출까지 치환되는 경우 있음.
예: `setTab(` → `changeTab(` replace_all 시 `changeTab` 함수 내부의 `setTab(t)` 도 치환되어 무한재귀 발생.
**항상 치환 후 해당 함수 정의부를 Read로 확인할 것.**

**Why:** 2026-04-27 작업 중 실제 발생한 버그.
**How to apply:** replace_all 후 영향 받는 함수 정의부 반드시 Read로 점검.

## 탭 상태 유지 패턴 (SessionDetailPage)

Layout.tsx의 visibilitychange → window.location.reload() 로 인해 탭 state가 초기화됨.
해결: `sessionStorage.getItem('sdp_tab_${id}')` lazy init + `changeTab()` wrapper로 저장.
`setTab`을 직접 호출하지 않고 `changeTab()`을 통해 탭 변경.

## 공개 대진표 권한 (RLS)

`/c/:clubId/:sessionId` 라우트는 AuthProvider 외부라 인증 불필요.
하지만 Supabase RLS에서 `anon` role SELECT 정책이 없으면 데이터 조회 실패.
해결: `sql_migration_public_rls.sql` - clubs/sessions/matches/attendance/guests/session_groups 에 anon SELECT 허용.
**적용 방법**: Supabase 대시보드 > SQL Editor에서 수동 실행 필요.

## 게스트 지각 처리

게스트는 `handleGuestLate(guest, isLate)` 함수로 지각 처리.
`trackLate && isAdminUser && rec?.attending` 조건 충족 시 지각 토글 버튼 표시.
멤버 지각(`handleMemberLate`)과 동일한 `setAttendance` 호출 패턴.

## 월요일 편성 모달

`mondayBasePlayer` state = 기준 선수(Y) ID. 디폴트: 염주호 ID (없으면 첫 번째 남성).
기준 선수 선택 시 `mondayR1Selection`, `mondayCompanion` 초기화 필요.
`handleMondayGenerate`에서 `Y = malePlayers.find(p => p.id === mondayBasePlayer)` 사용.

## TypeScript 타입 검사 — 올바른 tsconfig 사용

`npx tsc --noEmit`은 root tsconfig.json의 `"files": []` 때문에 0개 파일만 검사함 (항상 통과처럼 보임).
**반드시 `npx tsc --project tsconfig.app.json --noEmit` 사용** — 이것이 실제 src/ 파일 검사.

**Why:** root tsconfig.json은 project references 방식으로 구성되어 `files: []`가 설정됨.
**How to apply:** CI/수동 검사 모두 `--project tsconfig.app.json` 플래그 필수.

## 커스텀 훅 분리 패턴 (SessionDetailPage)

훅을 분리할 때 `load` 콜백은 훅 호출 **이전**에 정의해야 함 (const는 TDZ 적용).
잘못된 순서: 훅 호출(line 72) → load 정의(line 147) → TDZ ReferenceError.
올바른 순서: changeTab → load = useCallback → useEffect → 커스텀 훅 호출.

커스텀 훅에서 노출하지 않는 setter가 JSX에서 필요하면 별도 핸들러 함수를 훅 return에 추가.
예: `setSubstituteTarget` → useBracketEdit return에 추가하여 JSX 취소 버튼에서 사용.
