# UI & Page Architecture

## Page Structure

| Route | Page | Notes |
|---|---|---|
| `/` | HomePage | Dashboard, upcoming session |
| `/sessions` | SessionsPage | List + create/edit sessions |
| `/sessions/:id` | SessionDetailPage | Main feature page (see below) |
| `/members` | MembersPage | Club member management |
| `/admin` | AdminPage | Club settings (admin only) |
| `/superadmin` | SuperAdminPage | All clubs + user creation |
| `/stats` | StatsPage | Cross-session statistics |
| `/account` | AccountPage | Password change |

## SessionDetailPage

The most complex page (~1,650 lines after refactor). Has 5 tabs:
- `vote` — attendance voting with late tracking
- `groups` — group assignment (group mode + admin only)
- `bracket` — match display, score entry, drag-to-reorder editing
- `detail` — per-player game count breakdown
- `result` — win/loss results (group mode: per-group standings with score differential)

Inner tab components live in `src/components/session/`:
- `RoundCard.tsx` — contains `RoundCard`, `MatchCard`, `PlayerBadge`, `SubstituteTarget` type
- `GroupsTab.tsx`, `GroupResultTab.tsx`, `PlayerDetailTab.tsx`, `SessionResultTab.tsx`

### 탭 상태 유지 패턴

`sessionStorage.getItem('sdp_tab_${id}')` lazy init + `changeTab()` wrapper로 저장.
`setTab`을 직접 호출하지 않고 항상 `changeTab()`을 통해 탭 변경.

## Shared UI Components

```
src/components/ui/
  Card.tsx       — white rounded card container
  Badge.tsx      — colored badge (green/blue/pink/purple/yellow/orange/slate/amber/red)
  PageState.tsx  — LoadingState, ErrorState
src/utils/
  formatting.ts  — formatDate() (Korean locale, includes weekday)
```
