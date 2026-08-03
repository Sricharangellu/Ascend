/**
 * MSW Node.js server — used in Vitest tests.
 *
 * Import `server` in test setup and call server.listen() / server.close().
 *
 * Example vitest.setup.ts:
 *   import { server } from "@/mocks/server";
 *   beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
 *   afterEach(() => server.resetHandlers());
 *   afterAll(() => server.close());
 */

import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
