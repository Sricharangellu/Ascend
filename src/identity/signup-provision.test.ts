/**
 * signup-provision.test.ts — what a fresh signup actually delivers.
 *
 * Nothing else covers the tenant-provisioning path: `POST /api/identity/register`
 * creates a bare tenant + owner and publishes `tenant.registered` (which has no
 * listener), so a new tenant's business type is resolved lazily by the
 * capabilities endpoint (default → retail) rather than provisioned up front.
 *
 * These tests pin that contract and, more importantly, prove tenant isolation
 * from the signup path: two independently-registered tenants cannot see each
 * other's data. Each call carries its own tenant's Bearer token, so no test
 * relies on the harness's default-tenant fallback.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../app.js";

let __seq = 0;
const __schema = () => `signup_test_${process.pid}_${Date.now().toString(36)}_${__seq++}`;

async function freshApp(): Promise<App> {
  process.env["JWT_SECRET"] = "test-jwt-secret-signup";
  return buildApp({ schema: __schema() });
}

const request = (await import("./test-request.js")).default;

interface Registered {
  token: string;
  tenantId: string;
  userId: string;
}

async function registerTenant(app: App, storeName: string, email: string): Promise<Registered> {
  const r = await request(app.express, "POST", "/api/identity/register", {
    storeName,
    email,
    password: "sup3r-secret-pw",
  });
  assert.equal(r.status, 201, `register ${email}: ${JSON.stringify(r.json)}`);
  const token = r.json.accessToken as string;
  assert.ok(token && typeof token === "string", "register returns an access token");
  return { token, tenantId: r.json.user.tenantId, userId: r.json.user.id };
}

function authed(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

test("a fresh signup provisions an owner and defaults the tenant to the retail pack", async () => {
  const app = await freshApp();
  const a = await registerTenant(app, "Aurora Retail", "owner@aurora.test");

  // The signup creates an OWNER of a brand-new tenant.
  assert.match(a.tenantId, /^tnt_/, "a new tenant id was minted");
  assert.match(a.userId, /^usr_/, "an owner user was created");

  // Capabilities resolves the fresh tenant to retail by default (no explicit
  // business profile is written at signup — this is lazy read-time defaulting).
  const caps = await request(app.express, "GET", "/api/v1/capabilities", undefined, authed(a.token));
  assert.equal(caps.status, 200, `capabilities: ${JSON.stringify(caps.json)}`);
  assert.equal(caps.json.business.type, "retail", "fresh tenant → retail");
  assert.equal(caps.json.business.source, "default", "business type is a default, not stored");
  assert.equal(caps.json.user.role, "owner", "signup user is the owner");

  // Core retail modules are enabled for the fresh tenant.
  const catalog = caps.json.modules.find((m: { key: string }) => m.key === "catalog");
  const pos = caps.json.modules.find((m: { key: string }) => m.key === "pos_terminal");
  assert.equal(catalog.enabled, true, "catalog enabled (core)");
  assert.equal(pos.enabled, true, "pos terminal enabled (retail pack)");
});

test("a freshly-registered owner can operate their own tenant end-to-end", async () => {
  const app = await freshApp();
  const a = await registerTenant(app, "Borealis Goods", "owner@borealis.test");

  // The new owner can create an outlet and a product in their own tenant.
  const outlet = await request(app.express, "POST", "/api/v1/outlets/", { name: "Borealis Main" }, authed(a.token));
  assert.equal(outlet.status, 201, `create outlet: ${JSON.stringify(outlet.json)}`);

  const product = await request(
    app.express,
    "POST",
    "/api/v1/catalog/",
    { sku: "BOR-001", name: "Borealis Widget", price_cents: 1500, category: "general" },
    authed(a.token),
  );
  assert.equal(product.status, 201, `create product: ${JSON.stringify(product.json)}`);

  // And read them back.
  const outlets = await request(app.express, "GET", "/api/v1/outlets/", undefined, authed(a.token));
  assert.equal(outlets.status, 200);
  const names = (outlets.json.items ?? outlets.json).map((o: { name: string }) => o.name);
  assert.ok(names.includes("Borealis Main"), "owner sees their own outlet");
});

test("tenants registered independently are isolated — no cross-tenant data leak", async () => {
  const app = await freshApp();
  const a = await registerTenant(app, "Cascade Store", "owner@cascade.test");
  const b = await registerTenant(app, "Delta Store", "owner@delta.test");
  assert.notEqual(a.tenantId, b.tenantId, "two distinct tenants");

  // Tenant A creates an outlet and a product.
  const aOutlet = await request(app.express, "POST", "/api/v1/outlets/", { name: "Cascade Downtown" }, authed(a.token));
  assert.equal(aOutlet.status, 201);
  const aOutletId = aOutlet.json.id;
  const aProduct = await request(
    app.express,
    "POST",
    "/api/v1/catalog/",
    { sku: "CAS-001", name: "Cascade Secret", price_cents: 999, category: "general" },
    authed(a.token),
  );
  assert.equal(aProduct.status, 201);

  // Tenant B must NOT see tenant A's outlet or product.
  const bOutlets = await request(app.express, "GET", "/api/v1/outlets/", undefined, authed(b.token));
  assert.equal(bOutlets.status, 200);
  const bOutletList = bOutlets.json.items ?? bOutlets.json;
  assert.ok(
    !bOutletList.some((o: { id: string }) => o.id === aOutletId),
    "tenant B cannot see tenant A's outlet",
  );

  const bCatalog = await request(app.express, "GET", "/api/v1/catalog/", undefined, authed(b.token));
  assert.equal(bCatalog.status, 200);
  const bProducts = bCatalog.json.items ?? bCatalog.json;
  assert.ok(
    !bProducts.some((p: { sku: string }) => p.sku === "CAS-001"),
    "tenant B cannot see tenant A's product",
  );

  // And B fetching A's outlet by id is a not-found, never a cross-tenant read.
  const direct = await request(app.express, "GET", `/api/v1/outlets/${aOutletId}`, undefined, authed(b.token));
  assert.ok(direct.status === 404 || direct.status === 403, `cross-tenant fetch blocked (got ${direct.status})`);
});
