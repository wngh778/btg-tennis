# Auth & Context Architecture

## Auth & Role System

Two-layer auth: Supabase Auth (email/password) + custom `app_users` table.

Usernames are converted to synthetic emails via `usernameToEmail()` in `lib/database.ts` (base64 encoding → `u{b64}@btg-app.com`). Users never see email addresses.

Three roles: `superadmin` > `admin` > `member`
- `superadmin`: manages all clubs, creates users
- `admin`: manages one or more clubs (sessions, members, brackets)
- `member`: votes attendance, enters scores

Exposed via `useAuth()` hook: `{ user, appUser, isAdminUser, isSuperAdmin }`.

## Context Providers (wrap entire app)

```
AuthProvider → ClubProvider → Layout → Routes
```

- **AuthContext**: Supabase session + AppUser. Has 8s safety timeout to prevent auth hang from stale localStorage locks.
- **ClubContext**: Resolves available clubs from `appUser.clubIds`. Persists selected club in `localStorage('currentClubId')`. SuperAdmins see all clubs.
