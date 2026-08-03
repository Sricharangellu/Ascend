# AUDIT — MFA is not enforced at login (security theater)

- **When:** 2026-07-06T06:57:51Z
- **Session:** Claude (autonomous hardening run)
- **Scope:** `src/identity/` login + MFA flow, `web/app/login/page.tsx`
- **Status label:** `Not production-ready` (existing MFA feature) — **verified defect**
- **Severity:** High (authentication control that silently does nothing)

## Finding

Multi-factor authentication can be **set up and marked enabled**, and the UI presents the
account as MFA-protected, but **login never challenges for a TOTP code**. Password alone
logs the user in. The second factor is not enforced anywhere on the server.

## Evidence (verified this session)

1. `src/identity/service.ts` `login()` (≈lines 121–230): after `verifyPassword` succeeds it
   resets the failure counter, logs the attempt, and issues the token pair. There is **no
   reference to MFA** anywhere in the method — no `mfa_enabled` check, no code challenge.
   ```
   grep 'mfa|Mfa|MFA' over login() body  →  0 matches
   ```
2. `verifyMfaCode(userId, tenantId, code)` (≈line 594) — the function that would validate a
   **login-time** TOTP code — is **called from nowhere**. It is dead code.
   ```
   grep -rn 'verifyMfaCode' src/  (excluding its own definition)  →  0 callers
   ```
   Note its pass-through: `if (!row || !row.enabled) return true;` — so even if it were
   wired, an unenabled user passes; that part is fine. The problem is nobody calls it.
3. The `/mfa/verify` route (`src/identity/routes.ts:191`) calls `verifyAndEnableMfa` — the
   **setup**-confirmation path (turns MFA on) — not a login-time challenge.
4. `web/app/login/page.tsx` has **no** MFA/TOTP second step (`grep mfa|totp` → 0 matches).
   The login UI is single-step password only.

## Impact

- A user who enables MFA gets **no additional protection**. If their password leaks, the
  account is fully accessible — the TOTP secret is decorative.
- This is worse than not offering MFA, because the UI communicates a security guarantee
  (account is protected) that the backend does not honor.

## Reproduction

1. Log in, `POST /api/v1/auth/mfa/setup` then `/mfa/verify` with a valid code → MFA now
   `enabled = true` for the user.
2. Log out. `POST /login` with **only** email + password (no code) → succeeds, returns a
   full token pair.

## Remediation (coordinated backend + frontend — NOT a drop-in fix)

This deliberately was **not** patched in this session: it touches the e2e-critical login
path and needs a product decision on the challenge UX, and the working tree was mid-
consolidation by another session. Recommended shape:

1. **Backend** — in `login()`, after password verification, if `user.mfa_enabled`: do **not**
   issue the final token pair. Instead return a challenge (e.g. `401 mfa_required` + a
   short-lived, single-purpose "mfa pending" token bound to the user).
2. **New endpoint** `POST /login/mfa` — accepts the pending token + TOTP code, calls the
   (currently dead) `verifyMfaCode`, and on success issues the real token pair. Rate-limit
   and count failures the same way `login()` does.
3. **Frontend** — `login/page.tsx` handles `mfa_required`: reveal a 6-digit code field and
   post to `/login/mfa`.
4. **Backup codes** — only meaningful once (1)–(3) exist: generate hashed one-time codes at
   MFA setup, let `/login/mfa` accept-and-consume one when the authenticator is unavailable.
   (This is the `web/.../SecuritySection.tsx` "backup-codes" button that currently POSTs to a
   non-existent backend — track it as part of this same item, not separately.)

**Regression safety:** the demo owner and all seed/e2e users have `mfa_enabled = false`, so
they hit the existing pass-through path — smoke and e2e are unaffected by enforcement. Only
users who explicitly enable MFA get the new challenge, which is the intended behavior.

## Queue note

Belongs in `WORK/FORWARD_PLAN.md` as a **required security fix** (retail hardening, not a
new vertical). Higher priority than the deferred Promotion Engine build, which is a
speculative feature expansion. Do not mark the identity/MFA module `Built and verified`
until enforcement lands.
