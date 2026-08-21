import { makeRequest } from "../../shared/test-request.js";

/**
 * Tiny test client for this module: one request against the app on an
 * ephemeral port, signing a demo-tenant (tnt_demo) bearer token and upgrading
 * brevity paths (/api/<module>) to the real /api/v1 mount.
 *
 * Default role: `manager` — load-bearing. This module's tests rely on it, so
 * do not "normalise" it to `owner`; several would then pass for the wrong
 * reason. Pass a 5th argument to sign a different role, which is how this
 * module exercises its route guards.
 *
 * Implementation is shared — see `makeRequest` in src/shared/test-request.ts.
 */
export default makeRequest("manager");
