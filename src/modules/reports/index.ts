import type { PosModule } from "../types.js";
import { ReportsService } from "./service.js";
import { registerRoutes } from "./routes.js";

/**
 * Reports — a read-only analytics bounded context. It owns no tables; it reads
 * the orders + payments tables (shared schema) as a CQRS-lite read model and is
 * always tenant-scoped. Registered last so its (no-op) migrations run after the
 * tables it reads exist.
 */
export const reportsModule: PosModule = {
  name: "reports",
  migrations: [],
  async register({ db, router }) {
    const service = new ReportsService(db);
    registerRoutes(router, service);
  },
};

export { ReportsService } from "./service.js";
export type { SalesSummary } from "./service.js";
