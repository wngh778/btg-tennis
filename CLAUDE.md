# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Dev server (Vite HMR)
npm run build     # Type-check + production build (tsc -b && vite build)
npm run lint      # ESLint
npx tsc --noEmit  # Type-check only (faster than full build)
vercel --prod     # Deploy to production (auto-deploy is not set up)
```

There are no tests. Always run `npx tsc --noEmit` before deploying.

## Architecture Overview

Tennis club bracket management web app. Multi-club, multi-role SPA.

### Tech Stack
- React 19 + TypeScript, Vite 8, Tailwind CSS v4 (PostCSS)
- React Router v7, Supabase (PostgreSQL + Auth)
- Deployed on Vercel (`vercel.json` has SPA rewrite rule)

### Auth & Role System

Two-layer auth: Supabase Auth (email/password) + custom `app_users` table.

Usernames are converted to synthetic emails via `usernameToEmail()` in `lib/database.ts` (base64 encoding → `u{b64}@btg-app.com`). Users never see email addresses.

Three roles: `superadmin` > `admin` > `member`
- `superadmin`: manages all clubs, creates users
- `admin`: manages one or more clubs (sessions, members, brackets)
- `member`: votes attendance, enters scores

Exposed via `useAuth()` hook: `{ user, appUser, isAdminUser, isSuperAdmin }`.

### Context Providers (wrap entire app)

```
AuthProvider → ClubProvider → Layout → Routes
```

- **AuthContext**: Supabase session + AppUser. Has 8s safety timeout to prevent auth hang from stale localStorage locks.
- **ClubContext**: Resolves available clubs from `appUser.clubIds`. Persists selected club in `localStorage('currentClubId')`. SuperAdmins see all clubs.

### Database Layer (`src/lib/database.ts`)

Single file with all Supabase CRUD. Two clients:
- `supabase` (anon key, `lib/supabase.ts`) — used for all normal operations
- `supabaseAdmin` (service role key, `lib/supabaseAdmin.ts`) — used only for user creation in SuperAdminPage

Row-to-type mappers (`rowToSession`, `rowToMatch`, etc.) handle snake_case → camelCase conversion.

### Data Model (key relationships)

```
Club → Member (clubId)
Club → Session (clubId)
Session → AttendanceRecord (sessionId, playerId)
Session → SessionGroup (sessionId) — only when gameMode='group'
Session → Match (sessionId)
Match → SessionGroup (groupId, nullable)
```

`Player` is a runtime type (not stored) combining Member/Guest data for match generation.

### Matchmaking (`src/utils/matchmaking.ts`)

Two generation paths:
- `generateMatches()` — weekly/quarterly sessions; NTRP-aware pairing, mixed/male/female rounds, late player handling
- `generateGroupMatches()` — group tournament mode; equal game count per player via `calcOptimalGroupRounds()` (GCD-based), strong repeat-pair penalty (10000) with 500 attempts

### Session Types & Game Modes

Sessions have two orthogonal axes:
- `type`: `'weekly'` | `'quarterly'` — affects matchmaking algorithm (quarterly alternates male/female rounds)
- `gameMode`: `'normal'` | `'group'` — group mode activates SessionGroups, separate bracket per group

### Page Structure

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

### SessionDetailPage

The most complex page (~1,650 lines after refactor). Has 5 tabs:
- `vote` — attendance voting with late tracking
- `groups` — group assignment (group mode + admin only)
- `bracket` — match display, score entry, drag-to-reorder editing
- `detail` — per-player game count breakdown
- `result` — win/loss results (group mode: per-group standings with score differential)

Inner tab components live in `src/components/session/`:
- `RoundCard.tsx` — contains `RoundCard`, `MatchCard`, `PlayerBadge`, `SubstituteTarget` type
- `GroupsTab.tsx`, `GroupResultTab.tsx`, `PlayerDetailTab.tsx`, `SessionResultTab.tsx`

### Shared UI Components

```
src/components/ui/
  Card.tsx       — white rounded card container
  Badge.tsx      — colored badge (green/blue/pink/purple/yellow/orange/slate/amber/red)
  PageState.tsx  — LoadingState, ErrorState
src/utils/
  formatting.ts  — formatDate() (Korean locale, includes weekday)
```

### React Rules of Hooks

**Critical**: All `useEffect`/`useState` calls must appear before any conditional early returns (`if (loading) return ...`). This caused a production bug (React error #310 / white screen) in SessionDetailPage. Always place hooks at the top of the component body.

### SQL Migrations

Migration files are in the repo root (`sql_migration_groups.sql`, `MIGRATION_MULTI_CLUB.sql`). Run manually against Supabase. No migration runner is configured.
