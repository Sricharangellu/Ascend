import type { PosModule } from "../types.js";
import type { DB } from "../../shared/db.js";
import type { EventBus } from "../../shared/events.js";
import type { Router } from "express";
import { storeLocationsService } from "./service.js";
import { registerRoutes } from "./routes.js";

const CREATE_STORE_LOCATIONS = `
CREATE TABLE IF NOT EXISTS store_locations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  outlet_id TEXT,
  aisle TEXT NOT NULL,
  shelf TEXT NOT NULL DEFAULT '',
  bin TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL,
  description TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS store_locations_tenant_idx ON store_locations (tenant_id, aisle, shelf);
`;

const CREATE_PRODUCT_LOCATIONS = `
CREATE TABLE IF NOT EXISTS product_locations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  qty_at_location INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE (tenant_id, product_id, location_id)
);
CREATE INDEX IF NOT EXISTS product_locations_product_idx ON product_locations (tenant_id, product_id);
CREATE INDEX IF NOT EXISTS product_locations_location_idx ON product_locations (tenant_id, location_id);
`;

export const storeLocationsModule: PosModule = {
  name: "store_locations",
  // Routes are top-level resource names (/store-locations, /product-locations),
  // which the frontend + mocks call at /api/v1/<resource> — mount there so a
  // uniform /api/v1/store_locations prefix doesn't 404 those calls.
  mountPath: "/api/v1",
  migrations: [CREATE_STORE_LOCATIONS, CREATE_PRODUCT_LOCATIONS],
  register({ db, events, router }: { db: DB; events: EventBus; router: Router }) {
    const svc = storeLocationsService(db, events);
    registerRoutes(router, svc);
  },
};
