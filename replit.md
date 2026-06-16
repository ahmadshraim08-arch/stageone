# StageOne

_A TikTok-style social app for emerging singers to share Music Minutes, receive Golden Mics, and rise toward StageOne Live performances._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 at `artifacts/api-server`
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Mobile: Expo / React Native at `artifacts/mobile`
- Auth: Clerk (mobile uses `@clerk/expo`)

## Where things live

- `artifacts/mobile/lib/api.ts` — typed fetch wrapper for all API endpoints
- `artifacts/mobile/context/AppContext.tsx` — global state; uses Clerk token internally for all API calls
- `artifacts/mobile/data/seedData.ts` — seed/demo content (used for guest users)
- `artifacts/api-server/src/routes/` — Express route handlers
- `lib/db/src/schema.ts` — source of truth for the DB schema

## Architecture decisions

- **API-first social state**: When signed in, all likes/saves/follows/comments/posts come from the backend. No AsyncStorage for social data. Guest users see seed data only.
- **AppProvider uses Clerk hooks directly**: `AppProvider` calls `useAuth()` internally (it renders inside `<ClerkProvider>`), so no separate ClerkBridge component is needed.
- **Integer DB IDs as strings**: API post/user integer IDs are converted to strings (`String(id)`) for compatibility with the existing `MusicMinute` UI type. `currentUser.dbId` holds the raw integer for API calls.
- **Optimistic updates with silent rollback**: Like/save/follow/comment actions update UI immediately and call the API asynchronously. On API failure, the UI rolls back.
- **Diagnostic screen**: Accessible at `/diagnostic` (linked from profile tab long-press or settings). Shows backend health, current user session, API base URL, and last API error.

## Product

- Singers post 1-minute vocal performances ("Music Minutes") with Musixmatch lyric overlays.
- Fans discover talent, give Golden Mics (tipping currency), and follow creators.
- Creators rise via a score system toward StageOne Live — a virtual concert for the top performers.
- Direct messaging via conversations API; share Music Minutes inside the inbox.

## Environment Variables

- `DATABASE_URL` — Postgres connection string (required for API server)
- `CLERK_SECRET_KEY` — Clerk backend secret (required for API auth middleware)
- `MUSIXMATCH_API_KEY` — optional; falls back to demo data if absent
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk public key for the mobile app
- `EXPO_PUBLIC_CLERK_PROXY_URL` — optional Clerk proxy URL
- `EXPO_PUBLIC_API_URL` — override API base URL (e.g. `https://my-domain.com/api`). If not set, falls back to `https://$EXPO_PUBLIC_DOMAIN/api`, then `/api`.

## Gotchas

- `pnpm run typecheck` runs `tsc --build` for libs first, then leaf packages. Trust CLI over editor LSP when they disagree.
- After any schema change, run `pnpm --filter @workspace/db run push` in dev and `pnpm --filter @workspace/db run push --env production` for prod.
- Never call service ports directly (e.g. port 5000); always use the shared proxy at `localhost:80/api/...`.
- `AppProvider` must remain inside `<ClerkProvider>` in `_layout.tsx` since it calls `useAuth()` internally.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
