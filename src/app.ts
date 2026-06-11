import express, { Router, type Express } from "express";
import { openDb, type DB } from "./shared/db.js";
import { EventBus } from "./shared/events.js";
import { errorMiddleware } from "./shared/http.js";
import { modules } from "./modules/index.js";

export interface App {
  express: Express;
  db: DB;
  events: EventBus;
}

export interface BuildAppOptions {
  connectionString?: string;
  schema?: string;
}

/**
 * Assemble the modular monolith: open the (Postgres) DB, ensure the schema and
 * run every module's migrations, then register each module's routes under
 * /api/<name> and its event handlers. Async because all DB access is async.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<App> {
  const schema = options.schema ?? "public";
  const db = openDb({ connectionString: options.connectionString, schema });
  const events = new EventBus();
  const app = express();
  app.use(express.json());

  await db.exec(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

  for (const mod of modules) {
    for (const sql of mod.migrations) await db.exec(sql);
  }

  for (const mod of modules) {
    const router = Router();
    await mod.register({ db, events, router });
    app.use(`/api/${mod.name}`, router);
  }

  app.get("/", (_req, res) => {
    res.json({
      service: "finder-pos",
      status: "ok",
      storage: "postgres",
      modules: modules.map((m) => m.name),
      endpoints: ["/health", "/api/catalog", "/api/inventory", "/api/orders", "/api/payments", "/api/sync"],
    });
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", modules: modules.map((m) => m.name) });
  });

  app.use(errorMiddleware);
  return { express: app, db, events };
}
