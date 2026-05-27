# Matchmaking & Session System

## Matchmaking (`src/utils/matchmaking.ts`)

Two generation paths:
- `generateMatches()` — weekly/quarterly sessions; NTRP-aware pairing, mixed/male/female rounds, late player handling
- `generateGroupMatches()` — group tournament mode; equal game count per player via `calcOptimalGroupRounds()` (GCD-based), strong repeat-pair penalty (10000) with 500 attempts

## Session Types & Game Modes

Sessions have two orthogonal axes:
- `type`: `'weekly'` | `'quarterly'` — affects matchmaking algorithm (quarterly alternates male/female rounds)
- `gameMode`: `'normal'` | `'group'` — group mode activates SessionGroups, separate bracket per group

## Key Constraints

- 동일 페어 반복 방지: penalty 10000점, 500회 시도
- 그룹 모드: GCD 기반으로 라운드 수 계산 → 모든 선수 게임 수 균등화
- 지각 선수(late): 별도 처리 — 첫 라운드 제외 후 중간 투입
- Weekly: 혼복/남복/여복 자유 혼합
- Quarterly: 남복 라운드 / 여복 라운드 교대 편성
