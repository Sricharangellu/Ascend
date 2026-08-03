# Audit — auth route drift (/api/v1/auth/* → /api/identity/*)

Status label: **built_verified** (frontend alignment); backup-codes backend: **missing**

## What
Closed the wiring-matrix auth/* REAL DRIFT — two frontend calls to /api/v1/auth/*
that 404 on the real backend (auth lives under /api/identity/*):

1. PermissionsContext /api/v1/auth/me → **real /api/identity/me**. The 404 catch had
   been keeping role="owner" for EVERY user on the real backend (privilege bug) and
   failing open to all features. Now: owner/admin/manager → all features (matches
   backend allAccess); custom roles → their granted FeatureId list; no per-user
   feature list → fail open (real /me returns only role; capabilities module gate is
   the tenant-level nav authority). Mock /api/identity/me added for parity; dead
   /api/v1/auth/me mock removed.
2. SecuritySection POST /api/v1/auth/backup-codes → **removed** (no backend route
   exists — missing feature). Backup codes are client-generated/display-only and
   cannot be validated at login until a real endpoint is built. Documented in-place.

## Verified
- New web/tests/permissionsMePath.test.tsx 2/2: reads /api/identity/me; never calls
  the legacy path.
- web tsc 0, full Vitest 102/102, lint 4 pre-existing warnings, mock-off build green.

## Remaining route-alignment / gaps (not done here)
- **backup-codes backend** is genuinely missing (identity module has no route) — a
  real MFA backup-code persist/validate endpoint is future work.
- Field-level mock-vs-real shape drift across other endpoints not yet exhaustively
  swept (per the wiring matrix's own caveat).
- Promotions backend (Promotion Engine) still the real gap behind the now-hidden page.
