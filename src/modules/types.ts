import type { Router } from "express";
import type { DB } from "../shared/db.js";
import type { EventBus } from "../shared/events.js";

/**
 * Context handed to every module at registration time. A module receives the
 * shared database, the event bus, and its own Express sub-router (mounted at
 * /api/<module.name>). Modules MUST NOT import each other's code directly —
 * they integrate via (a) the shared DB tables documented in CONTRACTS.md and
 * (b) domain events on the bus.
 */
export interface ModuleContext {
  db: DB;
  events: EventBus;
  router: Router;
}

/**
 * A bounded context packaged as a module. `migrations` are idempotent SQL
 * statements (use CREATE TABLE IF NOT EXISTS) run once at startup, in module
 * order. `register` wires routes and event subscriptions.
 */
export interface PosModule {
  /** lowercase, url-safe, e.g. "catalog". Used as the route prefix. */
  name: string;
  /** SQL statements creating/owning this module's tables. */
  migrations: string[];
  /** Wire routes and event handlers onto the provided context. May be async (e.g. seeding). */
  register(ctx: ModuleContext): void | Promise<void>;
}
