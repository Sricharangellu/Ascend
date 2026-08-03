import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Sandbox workaround: the mounted node_modules has CJS .js files but the MSW
// package.json exports map only lists .mjs targets (stripped install).
// Alias every MSW entry point to its CJS build so Vite can resolve them.
const mswRoot = path.resolve(__dirname, "node_modules/msw/lib");

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: { plugins: [] },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "msw/node": path.join(mswRoot, "node/index.js"),
      "msw/browser": path.join(mswRoot, "browser/index.js"),
      // Root "msw" import (http, HttpResponse, delay live in core)
      "msw": path.join(mswRoot, "core/index.js"),
    },
    conditions: ["require", "default"],
  },
  test: {
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    environment: "node",
    environmentMatchGlobs: [
      ["tests/**/*.test.tsx", "jsdom"],
    ],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
