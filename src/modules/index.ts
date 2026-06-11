import type { PosModule } from "./types.js";
import { catalogModule } from "./catalog/index.js";
import { inventoryModule } from "./inventory/index.js";
import { ordersModule } from "./orders/index.js";
import { paymentsModule } from "./payments/index.js";
import { syncModule } from "./sync/index.js";

/**
 * Registration order = migration order. Keep dependencies earlier:
 * catalog -> inventory -> orders -> payments -> sync.
 */
export const modules: PosModule[] = [
  catalogModule,
  inventoryModule,
  ordersModule,
  paymentsModule,
  syncModule,
];
