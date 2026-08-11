/**
 * sso-token-claims.test.ts — an SSO session must carry the same authorization
 * claims as a password session for the same user.
 *
 * SSO used to mint its own tokens with a local `jwt.sign` that built claims by
 * hand, and it omitted `customRoleId` and `permissions`. Nothing caught it:
 * every existing SSO test stops at config CRUD, `initiate`, or a rejected
 * callback, so no test had ever driven a *successful* callback and looked at
 * what came out. These tests do, against a real loopback OIDC provider.
 *
 * The observable symptom was GET /capabilities reporting `permissions: []` and
 * `customRoleId: null` for an SSO user who has a custom role, so the client
 * rendered them as having no fine-grained entitlements. It self-corrected on
 * the first token refresh, because `refresh()` re-reads the user row — which is
 * exactly why it survived: the window is short and the recovery is silent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { generateKeyPairSync, createPublicKey } from "node:crypto";
import jwt from "jsonwebtoken";
import { buildApp, type App } from "../../app.js";
import { sendRequest } from "../../shared/test-request.js";
import { issueTokenPair } from "../../identity/tokens.js";

let __seq = 0;
const __schema = () => `sso_claims_${process.pid}_${Date.now().toString(36)}_${__seq++}`;

async function freshApp(): Promise<App> {
  process.env["JWT_SECRET"] ??= "test-secret-finder-pos";
  return buildApp({ schema: __schema() });
}

async function call(app: App, method: string, path: string, body?: unknown, role = "owner") {
  const { default: request } = await import("./test-request.js");
  return request(app.express, method, path, body, role);
}

const REDIRECT_URI = "https://app.example.com/sso/callback";
const CLIENT_ID = "client_123";

/**
 * Minimal OIDC provider on loopback: discovery document, JWKS, and a token
 * endpoint that returns an RS256 id_token asserting `email`. The service's
 * SSRF guard permits http against loopback outside production precisely so a
 * local IdP like this one can be used in tests.
 */
async function startFakeIdp(email: string): Promise<{ discoveryUrl: string; close: () => Promise<void> }> {
  // Export explicit PEM: jsonwebtoken mis-detects the KeyObject pair that
  // generateKeyPairSync returns by default and rejects the private key.
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const kid = "test-signing-key";
  const jwk = { ...createPublicKey(publicKey).export({ format: "jwk" }), kid, alg: "RS256", use: "sig" };

  let base = "";
  const server = http.createServer((req, res) => {
    const send = (obj: unknown): void => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    const url = req.url ?? "";
    if (url.startsWith("/.well-known/openid-configuration")) {
      send({ issuer: base, token_endpoint: `${base}/token`, jwks_uri: `${base}/jwks` });
      return;
    }
    if (url.startsWith("/jwks")) {
      send({ keys: [jwk] });
      return;
    }
    if (url.startsWith("/token")) {
      req.on("data", () => {});
      req.on("end", () => {
        const idToken = jwt.sign({ email }, privateKey, {
          algorithm: "RS256",
          keyid: kid,
          expiresIn: "5m",
          audience: CLIENT_ID,
          issuer: base,
          subject: email,
        });
        send({ id_token: idToken, access_token: "provider-access-token" });
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("fake IdP failed to bind");
  base = `http://127.0.0.1:${address.port}`;

  return {
    discoveryUrl: `${base}/.well-known/openid-configuration`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Give the demo cashier a custom role and return their row plus the role. */
async function seedCashierWithCustomRole(app: App, permissions: string[]) {
  const { json: role } = await call(app, "POST", "/api/custom-roles/", {
    name: "PO Manager",
    permissions,
  });
  const { json: team } = await call(app, "GET", "/api/team/");
  const cashier = team.items.find((u: { role: string }) => u.role === "cashier");
  assert.ok(cashier, "demo cashier user not found in team listing");
  const { status } = await call(app, "PATCH", `/api/custom-roles/assign/${cashier.id}`, {
    customRoleId: role.id,
  });
  assert.equal(status, 204, "failed to assign the custom role");
  return { role, cashier };
}

/** Run a full initiate → callback exchange and return the Ascend token pair. */
async function ssoLogin(app: App, discoveryUrl: string) {
  const { status: cfgStatus, json: cfgJson } = await call(app, "PUT", "/api/sso/config", {
    enabled: true,
    providerName: "Okta",
    clientId: CLIENT_ID,
    clientSecret: "super_secret_456",
    discoveryUrl,
    scopes: "openid profile email",
    defaultRole: "cashier",
  });
  assert.equal(cfgStatus, 200, JSON.stringify(cfgJson));

  const { default: request } = await import("./test-request.js");
  const { json: init } = await request(app.express, "POST", "/api/v1/sso/initiate", {
    tenantId: "tnt_demo",
    redirectUri: REDIRECT_URI,
  }, "owner");
  assert.ok(typeof init.state === "string" && init.state.length > 0, "initiate returned no state");

  const { status, json } = await request(app.express, "POST", "/api/v1/sso/callback", {
    state: init.state,
    code: "authorization_code_from_idp",
    redirectUri: REDIRECT_URI,
  }, "owner");
  assert.equal(status, 200, `callback failed: ${JSON.stringify(json)}`);
  return json as { accessToken: string; refreshToken: string; expiresIn: number };
}

// ── 1. The claims themselves ─────────────────────────────────────────────────
test("SSO access token carries the user's customRoleId and permissions", async () => {
  const app = await freshApp();
  const PERMS = ["purchasing:read", "purchasing:write"];
  const { role, cashier } = await seedCashierWithCustomRole(app, PERMS);

  const idp = await startFakeIdp(cashier.email);
  try {
    const tokens = await ssoLogin(app, idp.discoveryUrl);
    const claims = jwt.decode(tokens.accessToken) as Record<string, unknown>;

    // The regression: both of these were absent from an SSO-issued token.
    assert.deepEqual(claims["permissions"], PERMS, "SSO token dropped the custom-role permissions");
    assert.equal(claims["customRoleId"], role.id, "SSO token dropped customRoleId");

    // And the claims SSO already got right must survive the consolidation.
    assert.equal(claims["sub"], cashier.id);
    assert.equal(claims["tenantId"], "tnt_demo");
    assert.equal(claims["role"], "cashier");
    assert.equal(claims["ssoProvider"], "Okta", "descriptive ssoProvider claim was lost");
    assert.equal(tokens.expiresIn, 900);
  } finally {
    await idp.close();
  }
});

// ── 2. The user-visible symptom ──────────────────────────────────────────────
test("GET /capabilities reports an SSO user's permissions, not an empty list", async () => {
  const app = await freshApp();
  const PERMS = ["purchasing:read", "purchasing:write"];
  const { role, cashier } = await seedCashierWithCustomRole(app, PERMS);

  const idp = await startFakeIdp(cashier.email);
  try {
    const tokens = await ssoLogin(app, idp.discoveryUrl);

    // Drive the real endpoint with the real SSO-issued token — this is what the
    // client does, and what reported an empty permission set before the fix.
    const { status, json } = await sendRequest(app.express, "GET", "/api/v1/settings/capabilities", {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    assert.equal(status, 200, JSON.stringify(json));
    assert.deepEqual(json.user.permissions, PERMS);
    assert.equal(json.user.customRoleId, role.id);
    assert.equal(json.user.id, cashier.id);
  } finally {
    await idp.close();
  }
});

// ── 3. Both minters agree ────────────────────────────────────────────────────
test("SSO and password logins produce the same authorization claims", async () => {
  const app = await freshApp();
  const PERMS = ["purchasing:read", "purchasing:write"];
  const { role, cashier } = await seedCashierWithCustomRole(app, PERMS);

  const idp = await startFakeIdp(cashier.email);
  try {
    const ssoClaims = jwt.decode((await ssoLogin(app, idp.discoveryUrl)).accessToken) as Record<string, unknown>;

    // The reference: what the shared minter produces for this same user, which
    // is byte-for-byte the path password login takes.
    const reference = jwt.decode(
      issueTokenPair(process.env["JWT_SECRET"] ?? "test-secret-finder-pos", {
        userId: cashier.id,
        tenantId: "tnt_demo",
        role: "cashier",
        customRoleId: role.id,
        permissions: PERMS,
      }).accessToken,
    ) as Record<string, unknown>;

    for (const claim of ["sub", "tenantId", "role", "customRoleId", "permissions"]) {
      assert.deepEqual(
        ssoClaims[claim],
        reference[claim],
        `SSO and password tokens disagree on "${claim}"`,
      );
    }
  } finally {
    await idp.close();
  }
});

// ── 4. extraClaims cannot grant privilege ────────────────────────────────────
test("extraClaims cannot overwrite the authorization claims", () => {
  const claims = jwt.decode(
    issueTokenPair("unit-test-secret", {
      userId: "usr_1",
      tenantId: "tnt_real",
      role: "cashier",
      permissions: ["orders:read"],
      // A caller trying to escalate through the descriptive-claims escape hatch.
      extraClaims: {
        role: "owner",
        tenantId: "tnt_someone_else",
        permissions: ["*"],
        customRoleId: "crl_forged",
        ssoProvider: "Okta",
      },
    }).accessToken,
  ) as Record<string, unknown>;

  assert.equal(claims["role"], "cashier", "extraClaims escalated the role");
  assert.equal(claims["tenantId"], "tnt_real", "extraClaims crossed a tenant boundary");
  assert.deepEqual(claims["permissions"], ["orders:read"], "extraClaims widened permissions");
  assert.equal(claims["customRoleId"], undefined, "extraClaims forged a custom role");
  assert.equal(claims["ssoProvider"], "Okta", "a genuinely descriptive claim should still pass through");
});
