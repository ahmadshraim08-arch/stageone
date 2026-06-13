---
name: Clerk Core v3 Expo API
description: Correct signals-based API for @clerk/expo@3.x (Core v3) — NOT the legacy isLoaded/setActive pattern
---

# Clerk Core v3 API (@clerk/expo@3.x)

**Why:** @clerk/expo@3.4.2 uses @clerk/react@6.9.1 which is Clerk Core v3 (signals API). The legacy `{ isLoaded, signIn, setActive }` pattern does NOT work. Adding `@clerk/react` as a direct dep causes "multiple React copies" / "Invalid hook call" — never do this.

## Hooks

```ts
const { signIn, errors, fetchStatus } = useSignIn();   // from @clerk/expo
const { signUp, errors, fetchStatus } = useSignUp();   // from @clerk/expo
// No isLoaded, no setActive on these hooks
```

## Sign-In Flow

```ts
// 1. Submit password
const { error } = await signIn.password({ identifier: email, password });

// 2. Check status and finalize
if (signIn.status === 'complete') {
  const { error: finalizeError } = await signIn.finalize(); // creates + sets active session
  router.replace('/(tabs)');
}
```

`signIn.password()` params: `{ password, identifier }` OR `{ password, emailAddress }` OR `{ password, phoneNumber }`

## Sign-Up Flow

```ts
// 1. Create account + auto-sends email verification code
const { error } = await signUp.password({ emailAddress, password });

// 2. User enters code; verify it
const { error } = await signUp.verifications.verifyEmailCode({ code });

// 3. Finalize (creates + sets active session)
const { error } = await signUp.finalize();
```

`signUp.verifications.sendEmailCode()` — call this to re-send the verification code (e.g., "Resend" button)

## SSO (Google OAuth)

Still uses the legacy `useSSO` hook with `setActive`:
```ts
const { startSSOFlow } = useSSO();  // from @clerk/expo
const { createdSessionId, setActive } = await startSSOFlow({ strategy: 'oauth_google', redirectUrl });
if (createdSessionId && setActive) await setActive({ session: createdSessionId });
```

## Type Source

`/home/runner/workspace/node_modules/.pnpm/@clerk+shared@4.17.1/node_modules/@clerk/shared/dist/types/signInFuture.d.mts`
`/home/runner/workspace/node_modules/.pnpm/@clerk+shared@4.17.1/node_modules/@clerk/shared/dist/types/signUpFuture.d.mts`

**How to apply:** Any time auth screens need changes, use this API — never the legacy `signIn.create()` / `signUp.create()` / `setActive()` pattern with `useSignIn`/`useSignUp`.
