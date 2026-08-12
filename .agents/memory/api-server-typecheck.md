---
name: API server typecheck & strict mode
description: Why the API server tsconfig must keep strict:true, and the dual build paths to validate
---

- Rule: keep `strict: true` in the API server tsconfig. **Why:** with `strict: false` (no strictNullChecks), zod's inferred output types make all required fields optional, producing ~90 bogus TS2345 errors at every `parseBody` call site. Enabling strict fixed them wholesale.
- **How to apply:** if a flood of "property X is optional but required" errors appears around zod-parsed bodies, check strictNullChecks before touching call sites.
- The API server has two build paths: `pnpm run build` (tsc → dist/*.js) and `node build.mjs` (esbuild bundle → dist/server.mjs). Both must target the real entrypoint `src/server.ts`; validate both after entrypoint or dependency changes. The bundler needs devDeps esbuild, esbuild-plugin-pino, pino-pretty, thread-stream.
