# Database Layer

## Database Layer (`src/lib/database.ts`)

Single file with all Supabase CRUD. Two clients:
- `supabase` (anon key, `lib/supabase.ts`) — used for all normal operations
- `supabaseAdmin` (service role key, `lib/supabaseAdmin.ts`) — used only for user creation in SuperAdminPage

Row-to-type mappers (`rowToSession`, `rowToMatch`, etc.) handle snake_case → camelCase conversion.

## Data Model (key relationships)

```
Club → Member (clubId)
Club → Session (clubId)
Session → AttendanceRecord (sessionId, playerId)
Session → SessionGroup (sessionId) — only when gameMode='group'
Session → Match (sessionId)
Match → SessionGroup (groupId, nullable)
```

`Player` is a runtime type (not stored) combining Member/Guest data for match generation.

## SQL Migrations

Migration files are in the repo root (`sql_migration_groups.sql`, `MIGRATION_MULTI_CLUB.sql`, `sql_migration_public_rls.sql`). Run manually against Supabase. No migration runner is configured.

### Public RLS (공개 대진표)

`/c/:clubId/:sessionId` 라우트는 AuthProvider 외부라 인증 불필요.
Supabase RLS에서 `anon` role SELECT 정책이 없으면 데이터 조회 실패.
`sql_migration_public_rls.sql` - clubs/sessions/matches/attendance/guests/session_groups에 anon SELECT 허용.
적용: Supabase 대시보드 > SQL Editor에서 수동 실행.
