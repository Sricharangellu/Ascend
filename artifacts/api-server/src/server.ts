import { buildApp } from "./app.js";
import { logger } from "./shared/logger.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const { express: app, db, cleanup } = await buildApp({
  connectionString: process.env["DATABASE_URL"],
});

const server = app.listen(port, () => {
  logger.info({ port }, "Ascend API started");
});

function shutdown(signal: string): void {
  logger.info({ signal }, "shutdown signal received — draining");
  server.close(async () => {
    try {
      await cleanup();
      await db.close();
    } catch {
      // ignore cleanup errors
    }
    logger.info("graceful shutdown complete");
    process.exit(0);
  });

  setTimeout(() => {
    logger.error("shutdown timeout — forcing exit");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
