import http from "node:http";
import jwt from "jsonwebtoken";

/**
 * Shared plumbing for the per-module `test-request.ts` helpers.
 *
 * Every module test drives the real Express app over a real socket rather than
 * calling handlers directly, which keeps middleware (auth, validation, error
 * mapping) in the path. That plumbing — bind an ephemeral port, issue one
 * request, parse the body, tear the server down — was copy-pasted into 48
 * module helpers; it lives here once instead.
 *
 * What is deliberately NOT centralised: the call signatures. Modules differ in
 * ways their tests depend on (workflows defaults to `manager`, identity signs
 * no token at all, progress takes a tenant), so each module keeps a small
 * helper that composes these primitives with its own defaults. Collapsing
 * those into one signature would silently re-role existing tests.
 *
 * `makeRequest()` below closes the rest of that gap (backlog F-5). Sharing the
 * plumbing still left 41 of the 46 module helpers byte-identical in three
 * groups (31 + 5 + 5) — the same composition, differing only in which role they
 * pin — and `dupe:scan` reported them on every PR. Those now call the factory.
 * Each module keeps its own one-line file rather than importing the factory
 * directly from its tests, so the module's default role stays visible and
 * greppable next to the tests that depend on it.
 *
 * Five helpers deliberately stay hand-written, because they differ in ways the
 * factory would have to grow options to express — and an options bag with five
 * one-off flags is the duplication back again, wearing a hat:
 *   identity      — signs no token and does not rewrite the path
 *   progress      — takes the `App` wrapper, requires a role, allows a tenant
 *   business      — signs an arbitrary {sub, tenantId, role} for isolation tests
 *   custom_roles  — attaches customRoleId / permissions claims
 *   reports       — types its role parameter as `Role`, not `string`
 */

export interface TestResponse {
  status: number;
  json: any;
  headers: http.IncomingHttpHeaders;
}

/**
 * Commerce routes mount at /api/v1/<module>, but tests address them as
 * /api/<module> for brevity. Identity is exempt: it mounts at /api/identity.
 */
export function resolveApiPath(path: string): string {
  if (
    path.startsWith("/api/") &&
    !path.startsWith("/api/v1/") &&
    !path.startsWith("/api/identity/")
  ) {
    return path.replace("/api/", "/api/v1/");
  }
  return path;
}

/** Sign a test JWT. The harness (scripts/test.ts) sets JWT_SECRET. */
export function signTestToken(claims: Record<string, unknown>): string {
  const secret = process.env.JWT_SECRET ?? "test-secret-finder-pos";
  return jwt.sign(claims, secret, { expiresIn: "1h" });
}

/** Authorization header carrying a signed test token for `claims`. */
export function bearer(claims: Record<string, unknown>): Record<string, string> {
  return { authorization: `Bearer ${signTestToken(claims)}` };
}

/**
 * Issue one request against `handler` on an ephemeral port and resolve the
 * parsed response. A `body` of `undefined` is sent with no payload; callers
 * that want other falsy values treated as absent should normalise first.
 */
export function sendRequest(
  handler: http.RequestListener,
  method: string,
  path: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("failed to bind test server"));
        return;
      }
      const payload =
        options.body === undefined ? undefined : JSON.stringify(options.body);
      const headers: Record<string, string> = { ...(options.headers ?? {}) };
      if (payload) {
        headers["content-type"] = "application/json";
        headers["content-length"] = String(Buffer.byteLength(payload));
      }
      const req = http.request(
        { host: "127.0.0.1", port: address.port, method, path, headers },
        (res) => {
          let data = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            server.close();
            let json: any = undefined;
            try {
              json = data ? JSON.parse(data) : undefined;
            } catch {
              json = data;
            }
            resolve({ status: res.statusCode ?? 0, json, headers: res.headers });
          });
        },
      );
      req.on("error", (err) => {
        server.close();
        reject(err);
      });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

/**
 * Build a module's test client, pinning the role its tests assume by default.
 *
 * The returned function is the signature 41 module helpers had already
 * converged on independently:
 *
 *   request(app, method, path, body?, role?)
 *
 * `role` is a superset of what the 31 fixed-`owner` helpers accepted — they
 * declared four parameters and every one of their call sites passes at most
 * four, verified before this change, so gaining a defaulted fifth cannot alter
 * an existing call. The subject is derived as `usr_demo_<role>`, which for
 * `owner` is the exact `usr_demo_owner` those helpers hard-coded.
 *
 * The default is per-module and load-bearing: `workflows` and the other four
 * `manager` modules have tests that would start passing for the wrong reason if
 * they were silently promoted to `owner`. That is why this is a factory rather
 * than one shared function with a single global default.
 *
 * @param defaultRole role signed when a caller does not pass one.
 */
export function makeRequest(defaultRole: string) {
  return function request(
    app: http.RequestListener,
    method: string,
    path: string,
    body?: unknown,
    role: string = defaultRole,
  ): Promise<TestResponse> {
    return sendRequest(app, method, resolveApiPath(path), {
      body,
      headers: bearer({ sub: `usr_demo_${role}`, tenantId: "tnt_demo", role }),
    });
  };
}
