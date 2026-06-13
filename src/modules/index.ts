import type { PosModule } from "./types.js";
import { catalogModule } from "./catalog/index.js";
import { inventoryModule } from "./inventory/index.js";
import { ordersModule } from "./orders/index.js";
import { paymentsModule } from "./payments/index.js";
import { syncModule } from "./sync/index.js";
import { customersModule } from "./customers/index.js";
import { giftcardsModule } from "./giftcards/index.js";
import { webhooksModule } from "./webhooks/index.js";
import { teamModule } from "./team/index.js";
import { reportsModule } from "./reports/index.js";

/**
 * Registration order = migration order. Keep dependencies earlier:
 * catalog -> inventory -> orders -> payments -> sync -> customers -> giftcards -> webhooks -> team -> reports.
 */
export const modules: PosModule[] = [
  catalogModule,
  inventoryModule,
  ordersModule,
  paymentsModule,
  syncModule,
  customersModule,
  giftcardsModule,
  webhooksModule,
  teamModule,
  reportsModule,
];
