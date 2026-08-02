/**
 * Vitest global test setup.
 *
 * - Starts the MSW Node server before all tests (works in node + jsdom envs)
 * - Resets handlers after each test to prevent state leakage
 * - Stops the server after all tests
 *
 * @testing-library/jest-dom is only imported for jsdom-environment tests
 * (component tests).  Pure unit tests (node env) don't need it.
 */

import * as matchers from "@testing-library/jest-dom/matchers";
import { beforeAll, afterEach, afterAll, expect } from "vitest";
import { server } from "@/mocks/server";

expect.extend(matchers);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
