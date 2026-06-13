---
name: Clerk Expo web shim
description: How to fix @clerk/expo crashing on Expo web due to TurboModuleRegistry missing in react-native-web.
---

## The rule

When `@clerk/expo` is used in an Expo SDK 54 project with web support, it crashes at bundle load time on web with `TypeError: Cannot read properties of undefined (reading 'get')` because `@clerk/expo/dist/specs/NativeClerkModule.js` calls `react_native.TurboModuleRegistry.get(...)` and `react-native-web` does not expose `TurboModuleRegistry`.

## Fix

Two files + metro config change:

**`artifacts/mobile/shims/NativeClerkModule.js`**
```js
module.exports = null;
```

**`artifacts/mobile/shims/clerk-token-cache-web.js`**
```js
module.exports = { tokenCache: undefined };
```

**`artifacts/mobile/metro.config.js`** — add a `resolveRequest` interceptor for web:
```js
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web") {
    if (moduleName === "@clerk/expo/token-cache") {
      return { filePath: path.resolve(__dirname, "shims/clerk-token-cache-web.js"), type: "sourceFile" };
    }
    if (moduleName.endsWith("NativeClerkModule") || moduleName.endsWith("NativeClerkModule.js")) {
      return { filePath: path.resolve(__dirname, "shims/NativeClerkModule.js"), type: "sourceFile" };
    }
  }
  if (originalResolver) return originalResolver(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};
```

**Why:** `native-module.js` requires `NativeClerkModule` at the top level (not inside the `if (isNativeSupported)` guard), so the crash happens even though the code skips native on web. The shim returns `null`, which is what `TurboModuleRegistry.get()` returns when a native module isn't installed — `@clerk/expo` already handles null gracefully.

**How to apply:** Any time `@clerk/expo` is added to an Expo project that targets web. Restart the Metro bundler after changing `metro.config.js`.

## Shim value shape

`module.exports = null;` — NOT `module.exports = { default: null }` and NOT setting `module.exports.default` after setting `module.exports = null` (that throws "Cannot set properties of null"). The original file does `module.exports = NativeClerkModule_default` where the value is the TurboModule instance or null.
