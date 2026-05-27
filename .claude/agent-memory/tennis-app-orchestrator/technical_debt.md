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

## AuthContext.tsx — user 타입 any

**현황**: `user: any | null` — Supabase User 타입 명시 없음.

**Why:** Supabase 타입이 복잡하고 자주 바뀌어 의도적으로 any 사용.

**How to apply:** 현재 동작에 문제없으므로 낮은 우선순위. Supabase v2 타입 안정화 후 개선 고려.
