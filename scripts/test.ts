import { spawn } from "node:child_process";
import { ensurePg } from "./pg-harness.js";

const { url, stop } = await ensurePg();

const child = spawn(
  process.execPath,
  ["--import", "tsx", "--test", "src/**/*.test.ts"],
  {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, PG_POOL_MAX: "1" },
  },
);

child.on("exit", async (code, signal) => {
  await stop();
  process.exit(code ?? (signal ? 1 : 0));
});
