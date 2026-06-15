---
name: jest-expo vs ts-jest for Node tests
description: Why pure data/logic tests in the mobile package must use ts-jest, not jest-expo preset.
---

`jest-expo` preset injects `react-native/jest/setup.js` as a setup file. That file
uses top-level `import` statements, which crash under the `node` testEnvironment
(CommonJS) with:

```
SyntaxError: Cannot use import statement outside a module
  at react-native/jest/setup.js:16
```

**Fix:** For pure TypeScript/data tests with no React Native component deps, configure
Jest directly with `ts-jest` instead of the `jest-expo` preset:

```json
"jest": {
  "testEnvironment": "node",
  "transform": { "^.+\\.tsx?$": ["ts-jest", { "tsconfig": { "module": "commonjs" } }] },
  "moduleNameMapper": { "^@/(.*)$": "<rootDir>/$1" }
}
```

**Why:** `jest-expo` is designed for component tests that need the full React Native
environment. Node-only tests (cache logic, seed-data shape validation) don't need it
and break with it.

**How to apply:** Any new `__tests__/*.test.ts` file that only imports from `lib/` or
`data/` can use this config. If a test imports React Native components, use the full
`jest-expo` preset in a separate jest project config.
