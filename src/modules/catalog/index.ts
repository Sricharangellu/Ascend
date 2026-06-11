import type { PosModule } from "../types.js";
import { CatalogService } from "./service.js";
import { registerRoutes } from "./routes.js";

const CREATE_PRODUCTS_TABLE = `
CREATE TABLE IF NOT EXISTS products (
  id           TEXT PRIMARY KEY,
  sku          TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  price_cents  BIGINT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'general',
  tax_class    TEXT NOT NULL DEFAULT 'standard',
  barcode      TEXT,
  status       TEXT NOT NULL DEFAULT 'active',
  created_at   BIGINT NOT NULL,
  updated_at   BIGINT NOT NULL
);
`;

export const catalogModule: PosModule = {
  name: "catalog",
  migrations: [CREATE_PRODUCTS_TABLE],
  async register({ db, events, router }) {
    const service = new CatalogService(db, events);
    // Idempotent demo seed (only runs when the table is empty).
    await service.seed();
    registerRoutes(router, service);
  },
};

export { CatalogService } from "./service.js";
export type {
  Product,
  CreateProductInput,
  UpdateProductInput,
  ListProductsQuery,
  TaxClass,
  ProductStatus,
} from "./service.js";
