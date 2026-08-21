# AUDIT 2026-08-06T050023Z — Ascend Mobile app-store submission readiness

**Session:** Claude Code web — `claude/ascend-prompt-guide-6ol0p9` (PR #188)
**Scope:** Read-only inspection of `artifacts/ascend-mobile` configuration against what the Apple App
Store and Google Play require to accept a build. Written while adding the launch-readiness prompts in
`tools/AGENT_PROMPT.md` §5 — the prompts are the reusable artifact, this file is the point-in-time
finding that motivated them.

**Status label: `partial`** — configuration was read directly; runtime behaviour was NOT exercised.
Nothing here is a claim about the app working or not working, only about what the store tooling needs
and what is present.

**Method:** read `artifacts/ascend-mobile/app.json` and `package.json`; `find` across the repo
(excluding `node_modules`) for `eas.json`, `Info.plist`, `AndroidManifest.xml`,
`PrivacyInfo.xcprivacy`, `capacitor.config.*`, `app.json`. No files were modified in `artifacts/`.

---

## F-1 — The app cannot be built for submission to either store (blocker)

`artifacts/ascend-mobile/app.json` declares `"ios": { "supportsTablet": false }` and `"android": {}`.

| Required | Present |
|---|---|
| `ios.bundleIdentifier` | **missing** |
| `android.package` | **missing** |
| `ios.buildNumber` | **missing** |
| `android.versionCode` | **missing** |
| `eas.json` (build + submit profiles) | **missing** — no file of that name exists anywhere in the repo |

Without a bundle identifier and package name there is no submittable binary; without a build/submit
profile there is no pipeline that produces one. The missing per-upload increments
(`buildNumber`/`versionCode`) become blocking on the *second* upload rather than the first.

`"version": "1.0.0"` is set, which is the user-facing string only — it does not substitute for either
increment.

## F-2 — `expo-router` origin points at a third-party host (blocker)

```json
["expo-router", { "origin": "https://replit.com/" }]
```

Scaffolding left over from a Replit workspace. This must be an Ascend-owned origin before shipping.
Related context: the Replit workspace manifest has hijacked this repo's npm root more than once
(see `AUDIT_2026-08-03T110000Z-replit-pnpm-root-hijack-incident.md`), so treat other Replit defaults
in this tree as suspect rather than assuming this is the only one.

## F-3 — The app being audited is in a tree the repo says not to trust (decide first)

`artifacts/` is documented in `tools/README.md` as "a known ~1,000-file duplicate of the whole app
(audit finding H-1 / backlog F-3)", and active `WORK/LOCK.md` claims explicitly exclude it as
"another environment's tree — documented, not touched."

**This outranks F-1 and F-2.** Certifying a build in a directory the project treats as a
non-canonical duplicate certifies nothing. Determine whether `artifacts/ascend-mobile` is the
shipping app, a copy of one, or abandoned, and either promote it to a canonical location or stop
treating it as launch scope. Not resolved by this audit.

## F-4 — No secure storage or biometric dependency is declared

Neither `expo-secure-store` nor `expo-local-authentication` appears in
`artifacts/ascend-mobile/package.json`.

**Not verified:** where the app actually persists access/refresh tokens and tenant id — the mobile
source was not read. The finding is only that the standard encrypted-at-rest primitive is not a
declared dependency, so unless something custom is in place, auth material for a multi-tenant POS is
in unencrypted storage. This needs the "token storage at rest" prompt run against it before launch,
not an assumption either way.

## F-5 — No privacy manifest, and no camera permission configured

- No `PrivacyInfo.xcprivacy` exists in the repo. Apple requires a privacy manifest declaring Required
  Reason API usage.
- Declared plugins are `expo-router`, `expo-font`, `expo-web-browser`, `expo-notifications`. There is
  no camera plugin and no `ios.infoPlist` usage strings.

**Caveat, stated deliberately:** Expo generates the native manifests at prebuild and config plugins
can inject usage strings, so "absent from `app.json`" is not the same as "absent from the built app."
What is certain is that no camera capability is configured here — which matters only if barcode
scanning is in scope for mobile, and that was not determined.

`expo-notifications` is configured with `defaultChannel: "orders"`, so push will need permission
handling and the Apple push entitlement wired through the (missing) build profile.

## F-6 — `supportsTablet: false` (product question, not a defect)

For a retail POS, iPad is usually the primary form factor. Flagging it as a decision to confirm rather
than a bug — it may be deliberate if mobile is intended as a companion to the web terminal.

---

## Delivery standard

- **Architecture impact:** none — read-only audit, no code changed.
- **Database impact:** none.
- **Testing evidence:** configuration read directly from `app.json` / `package.json`; repo-wide `find`
  for the five store-config filenames listed under Method. No build, no runtime, no device testing was
  performed — none of these findings is a runtime claim.
- **Security impact:** F-4 is a potential one and is explicitly unresolved; it needs the token-storage
  prompt run before it can be labelled either way.
- **Rollback note:** none — nothing to roll back.
- **Monitoring/alerting needs:** none from this audit. Note separately that `GAPS.md` **C-4** (no
  alerting between deploys) is an existing critical that a mobile launch would make materially worse,
  since a store binary cannot be hotfixed.

## What this audit did not check

Runtime behaviour of any kind; where tokens are stored; whether a canonical mobile app exists outside
`artifacts/`; whether the app is currently intended to ship at all; every check in
`tools/AGENT_PROMPT.md` §5 other than the configuration ones above. The `GAPS.md` criticals C-1
(restore drill never run), C-2 (`setInterval` workers), C-3 (DB TLS not universally enforced) and C-4
(no alerting) were not re-verified here — they are already recorded as open and outrank this file.
