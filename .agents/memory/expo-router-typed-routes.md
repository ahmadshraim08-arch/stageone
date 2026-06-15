---
name: Expo Router typed routes
description: How to handle TS errors after adding new dynamic route files before the dev server regenerates types.
---

When a new dynamic route file is added (e.g. `app/lyric-challenge/[id].tsx`), the Expo
CLI generates typed route definitions in `.expo/types/router.d.ts` only when the dev
server starts. Until then, `router.push('/lyric-challenge/...')` fails typecheck.

**Fix:** Manually add the route to `.expo/types/router.d.ts` in three places:
1. `hrefInputParams` union — add `{ pathname: '/lyric-challenge/[id]', params: UnknownInputParams & { id: string | number } }`
2. `hrefOutputParams` union — add `{ pathname: '/lyric-challenge/[id]', params: UnknownOutputParams & { id: string } }`
3. `href` union — add both the interpolated form `/lyric-challenge/${Router.SingleRoutePart<T>}${...}` and the object form.

**Why:** The Expo dev server runs `expo export --platform web` (or equivalent) during
startup which regenerates this file. Until then, the file reflects only previously
known routes.

**How to apply:** Any time a new `[param]` route file is created, check if typecheck
fails with "not assignable to … RelativePathString" and patch `.expo/types/router.d.ts`
following the pattern of the existing `/creator/[username]` entry.
