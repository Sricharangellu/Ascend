---
name: Ascend demo mode & mock activation
description: How ?demo=1 / MSW activation really works in the Ascend web app; URL is not a reliable demo signal.
---

- Dev runs with `VITE_MOCK="false"` (set in `.replit`), so the web app takes the *runtime* demo path, not the env-mocks path, even in development.
- `?demo=1` is consumed at startup: the mock-worker initializer persists `localStorage["ascend_demo"]="1"`, strips the query param via replaceState, then starts MSW. **Any UI gated on the URL param alone silently breaks** — gate on the URL *or* the persisted flag (shared `isDemoMode()` helper in the mocks module).
- MSW intercepts requests whenever env mocks OR the runtime demo flag activate it — `VITE_MOCK` alone does not tell you mock vs real backend. Use `isMockActive()` (true only after the worker actually registers; conservative on blocked localStorage / start failure / 4s fallback).
- **Why:** a banner keyed on `VITE_MOCK` claimed "no backend required" while wrong, and keyed on the URL it vanished entirely; code review rejected both.
- **How to apply:** any copy/behavior that depends on mock-vs-live or demo mode must use these helpers, not env vars or the URL.
