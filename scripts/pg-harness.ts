import EmbeddedPostgres from "embedded-postgres";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export interface PgHandle {
  url: string;
  stop: () => Promise<void>;
}

/**
 * Ensure a usable Postgres. If DATABASE_URL is set, use it as-is. Otherwise boot
 * a throwaway embedded Postgres cluster (data dir in the OS temp dir, since the
 * synced project mount disallows the dir operations initdb needs) and return its
 * URL plus a stop() that tears it down.
 */
export async function ensurePg(dbName = "finderpos"): Promise<PgHandle> {
  if (process.env.DATABASE_URL) {
    return { url: process.env.DATABASE_URL, stop: async () => {} };
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "finderpg-"));
  const port = 50000 + Math.floor(Math.random() * 10000);
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: false,
    postgresFlags: ["-c", "max_connections=200"],
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(dbName);
  const url = `postgresql://postgres:postgres@127.0.0.1:${port}/${dbName}`;
  return {
    url,
    stop: async () => {
      try {
        await pg.stop();
      } catch {
        /* ignore */
      }
    },
  };
}
