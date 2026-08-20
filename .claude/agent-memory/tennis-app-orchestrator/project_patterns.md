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

## 도착 순위 기능 (2026-07-29)

attendance 테이블에 `arrival_order` 컬럼 추가. `sql_migration_arrival_order.sql` 수동 실행 필요.
- `setArrivalOrder(sessionId, playerId, order | null)` 전용 함수로 단독 업데이트 (null = 초기화)
- VoteTab에서 관리자 전용 number input으로 입력 (attending=true인 선수만)
- GenerateSettingsModal에서 도착 1~4위 모두 설정 시 "1라운드 도착순 자동편성" 체크박스 표시
- matchmaking.ts `generateMatches`의 `firstRoundPlayers?: [P,P,P,P]` 옵션: 1,2팀 vs 3,4팀으로 round=1 수기배치, startRound=2부터 자동 생성
- `useArrivalFirstRound` 상태가 `useGenerateModal`에 있고 SessionDetailPage에서 구조분해

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

## tsx/esbuild __name() 이슈 — Playwright page.evaluate() (블로그 프로젝트)

tsx가 const 함수 선언을 `__name()` 래퍼로 변환 → 브라우저에서 `ReferenceError: __name is not defined`.
**해결**: page.evaluate() 내부에서 const 함수 선언 금지. page.fill(), locator().pressSequentially() 사용.
evaluate 불가피 시: 이름 없는 인라인 표현식만 사용.

**Why:** 2026-06-08 블로그 자동화 프로젝트에서 발견.
**How to apply:** Playwright + tsx 조합 시 evaluate() 내 함수 정의 패턴 주의.

## 커스텀 훅 분리 패턴 (SessionDetailPage)

훅을 분리할 때 `load` 콜백은 훅 호출 **이전**에 정의해야 함 (const는 TDZ 적용).
잘못된 순서: 훅 호출(line 72) → load 정의(line 147) → TDZ ReferenceError.
올바른 순서: changeTab → load = useCallback → useEffect → 커스텀 훅 호출.

커스텀 훅에서 노출하지 않는 setter가 JSX에서 필요하면 별도 핸들러 함수를 훅 return에 추가.
예: `setSubstituteTarget` → useBracketEdit return에 추가하여 JSX 취소 버튼에서 사용.

## 컴포넌트 분리 후 인터페이스 타입 주의

서브 컴포넌트(BracketTab 등)의 props 인터페이스는 실제 핸들러 시그니처와 **정확히** 일치해야 함.
특히 RoundCard 등 하위 컴포넌트로 바로 전달되는 함수들은 RoundCard 인터페이스를 기준으로 정의.

확인 목록:
- `onDragDrop: (targetMatchId: string) => void` — handleDragDrop은 내부 state(dragMatchId)로 소스 파악
- `onDragToEmptyRound: (targetRound: number) => void` — 단일 인자
- `onRoundDrop: (targetRound: number) => void` — 단일 인자
- `onAutoFillRound: (round: number) => void` — 단일 인자 (restingPlayers는 hook 내부 계산)
- `onAddMatch: (round: number) => void` — 단일 인자 (bench는 hook 내부 계산)
- `onMatchTypeChange: (matchId: string, newType: MatchType) => void` — 두 인자
- `onPlayerClick: (matchId: string, team, slot, player: Player) => void` — RoundCard 순서

**Why:** 2026-06-30 리팩토링 중 BracketTab props가 잘못 정의되어 tsc -b에서 타입 오류 발생.
**How to apply:** 컴포넌트 분리 시 RoundCard.tsx 등 하위 컴포넌트의 타입 정의를 직접 읽어서 검증.

## 월례대회 대진 생성 — 3단계 재시도 구조 (2026-07-13)

`generateMonthlyMatches`는 그리디 단독으로는 후반 라운드에서 중복 페어가 불가피해지는 막다른 길에 빠짐 (특히 8명 전원참여 c2 r6 케이스: 16/50 실패).
해결된 3단계 구조:
1. 코트 후보 상한 `candidateLimit = 12` (8이면 후보 내 조합만으로 중복 불가피)
2. 라운드 단위 재시도: `tryBuildRound()` 시뮬레이션(전역 상태 불변) × `ROUND_ATTEMPTS = 30`, 최소 repeatPenalty 커밋
3. 스케줄 전체 재시도: `buildMonthlySchedule()` × `SCHEDULE_ATTEMPTS = 20`, repeats(pairCount 초과분 합) 최소 스케줄 선택

검증: /tmp/mm_test2.ts invariant 테스트로 전 구성 0/50 중복 확인. 알고리즘 수정 시 반드시 이런 통계적 invariant 테스트(50회 반복)로 검증할 것 — 단발 실행은 랜덤성 때문에 신뢰 불가.

**Why:** 사용자가 "대진표 생성쪽에 이슈가 많았다"고 반복 지적. 단발 테스트로는 통과해 보여 커밋됐던 버그가 재발했음.
**How to apply:** matchmaking.ts 수정 시 npx tsx로 50회 반복 invariant 테스트 작성·실행.

## 날짜 처리 — toISOString() 금지

`getNextDay()` 등 날짜 문자열 생성 시 `toISOString().split('T')[0]`은 UTC 변환으로 KST 00:00~08:59에 하루 전 날짜가 나옴.
로컬 포맷 사용: `getFullYear/getMonth+1/getDate` + padStart.

## 조간(cross-group) 대진 — 동일 조 중복 사용 가드

한 조가 여러 대결 페어에 들어가면 같은 라운드에 같은 선수가 두 코트에 배정됨(이중출전).
`useGenerateModal.handleGenerateCrossGroupMatches`에 중복 조 검출 → alert 후 중단 가드 있음.

## 대진표 이미지 공유 (2026-07-13)

공유 로직은 `src/utils/shareImage.ts`의 `shareElementAsPng(el, title)` 하나로 통일:
navigator.share(모바일) → clipboard.write(데스크톱, 카톡PC 붙여넣기) → PNG 다운로드(최종 폴백).
AbortError(공유 시트 취소)는 정상 종료로 처리 — 실패 alert 금지.
캡처 대상 UI는 `src/components/session/SimpleBracketList.tsx` 공용 컴포넌트 —
SimpleViewModal(간단히 보기)과 PublicClubPage(공개 링크) 양쪽에서 사용. 스타일 수정 시 이 한 곳만 고치면 됨.

## tsconfig build vs noEmit 차이

`npm run build` = `tsc -b` (project references, noUnusedLocals/Parameters 검사)
`npx tsc --noEmit` = root tsconfig.json만 검사 → files:[] 이므로 항상 통과
→ 반드시 `npm run build` 로 최종 검증할 것.
