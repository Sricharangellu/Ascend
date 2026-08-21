import type http from "node:http";
import type { Express } from "express";
import { sendRequest } from "../shared/test-request.js";

/**
 * Tiny test client for identity. Deliberately signs NO token and does not
 * upgrade the path — identity mounts at /api/identity and these tests drive
 * auth itself, supplying their own headers and asserting on response headers.
 * Plumbing is shared — see src/shared/test-request.ts.
 */
export default function request(
  app: Express,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; json: any; headers: http.IncomingHttpHeaders }> {
  return sendRequest(app, method, path, { body, headers });
}
