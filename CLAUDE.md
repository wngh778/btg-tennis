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

## Critical Rules

### React Rules of Hooks

**Critical**: All `useEffect`/`useState` calls must appear before any conditional early returns (`if (loading) return ...`). This caused a production bug (React error #310 / white screen) in SessionDetailPage. Always place hooks at the top of the component body.

### Type Safety

Always run `npx tsc --noEmit` after making changes. The PostToolUse hook runs this automatically on every Write/Edit.

## Detailed Context (import as needed)

@.claude/contexts/auth.md
@.claude/contexts/db.md
@.claude/contexts/matchmaking.md
@.claude/contexts/ui.md
