---
name: Ascend web typecheck pitfalls
description: Why the web app's tsc can break — hoisted @types/react duplicates and Next.js-shim API drift
---

# Ascend web typecheck pitfalls

**Rule:** The web app must resolve React types from its own `node_modules/@types/react`; its tsconfig pins `react`/`react-dom` via `paths`.

**Why:** The Expo mobile app keeps `@types/react@19.1.x` hoisted into pnpm's virtual store (`node_modules/.pnpm/node_modules`). Libraries without an `@types/react` peer (wouter, lucide-react, react-day-picker) resolve that hoisted copy, clashing with the web app's 19.2.x and producing cross-version Ref/props errors. `pnpm dedupe` cannot unify them because Expo genuinely needs 19.1.

**How to apply:** Keep the `paths` pins in the web app tsconfig when upgrading React types; if similar "two @types/react versions" errors appear in another web package, apply the same pin rather than fighting the lockfile.

Also: the codebase uses Next.js compatibility shims (`@/lib/router`, `@/lib/link`) over wouter. Next-style calls like `router.replace(href, { scroll: false })` and `redirect()` must be supported by the shim's signatures — code copied from Next patterns will otherwise fail typecheck.
