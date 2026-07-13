---
name: technical_debt
description: 추적 중인 기술 부채, 리팩토링 후보, 아키텍처 개선 사항
type: project
---

## SessionDetailPage.tsx — 리팩토링 완료 (2026-05-27)

**완료**: 2,718줄 → 2,104줄. 3개 커스텀 훅으로 분리.
- `src/hooks/useBracketEdit.ts` (347줄) — editMode, pendingMatches, drag 13개 상태 + 핸들러
- `src/hooks/useGenerateModal.ts` (402줄) — 대진표 생성 모달 상태 27개 + 핸들러
- `src/hooks/useGuestForm.ts` (135줄) — 게스트 추가/편집 상태 + 핸들러

**주요 버그 수정**:
- `load` useCallback이 훅 호출 이전에 위치해야 함 (TDZ 이슈) → 훅 호출 전으로 이동
- `npx tsc --noEmit`은 root tsconfig.json 참조 모드로 파일 0개를 검사함 → **반드시 `npx tsc --project tsconfig.app.json --noEmit` 사용**
- `latePlayerIds` useGenerateModal에서 계산 후 unused set 대신 실제 값 전달

**남은 부채**: page 내 vote 핸들러(handleMemberVote, handleMemberLate, handleGuestLate)는 여전히 인라인이지만 규모 작아 분리 불필요.

---

## matchmaking.ts — ensurePlayer 로직 중복

**현황**: `buildHistory()`의 `ensurePlayer` 헬퍼와 `updateHistory()` 내의 초기화 로직이 거의 동일.

**Why:** 두 함수가 독립적으로 개발되면서 중복 발생. 동작에는 문제없음.

**How to apply:** 작은 개선이므로 matchmaking.ts 수정 시 함께 처리 가능.

---

## AuthContext.tsx — user 타입 any → 해결 (2026-07-13)

`user: any` 4곳을 `@supabase/supabase-js`의 `User` 타입으로 교체 완료. tsc/lint 통과.

---

## ESLint 상태 (2026-07-13 기준)

**오류 0건.** 남은 exhaustive-deps 경고 6건은 의도적 패턴(재로드 방지, stale closure 회피)이라 고치면 무한루프/재요청 회귀 위험 → 유지.
- eslint.config.js에 `argsIgnorePattern: '^_'` 등 unused-vars 관례 규칙 추가됨
- context 파일의 hook export, Layout/ClubContext의 setState-in-effect는 사유 주석 + disable 처리

---

## public/sw.js — 해시 에셋 regex 불일치 (미해결)

**현황**: 규칙 3의 regex `\/assets\/.*\.[0-9a-zA-Z]{8,}\.(js|css...)`는 `name.HASH.js` 형태를 기대하지만 Vite 실제 산출물은 `name-HASH.js` (하이픈 구분). 따라서 캐시 우선 분기가 절대 매칭 안 되고 모든 에셋이 규칙 4(네트워크 우선)로 처리됨.

**Why:** 동작 자체는 안전(네트워크 우선 + 캐시 폴백)하지만 캐시 우선의 성능 이점을 못 받음.

**How to apply:** sw.js 수정 시 regex의 `\.`를 `[-.]`로 바꾸고 CACHE_VERSION 올리기. SW 수정은 배포 후 검증 필수.

---

## App.tsx — 라우트 코드 스플리팅 적용 (2026-07-13)

홈/로그인 제외 전 페이지 `React.lazy` + Suspense. 번들 668KB 단일 → 초기 ~436KB + 페이지별 청크. 배포 직후 stale index.html이 옛 청크를 참조하면 lazy 로드 실패 가능 → ErrorBoundary의 새로고침 버튼이 폴백 (SW가 HTML 네트워크 우선이라 위험 낮음).
