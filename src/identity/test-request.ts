import http from "node:http";
import type { Express } from "express";

/**
 * Tiny test client: spins up the express app on an ephemeral port, issues one
 * request, and tears the server down. Supports custom headers for auth testing.
 */
export default function request(
  app: Express,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("failed to bind test server"));
        return;
      }
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const baseHeaders: Record<string, string | number> = {};
      if (payload) {
        baseHeaders["content-type"] = "application/json";
        baseHeaders["content-length"] = Buffer.byteLength(payload);
      }
      const req = http.request(
        {
          host: "127.0.0.1",
          port: address.port,
          method,
          path,
          headers: { ...baseHeaders, ...(headers ?? {}) },
        },
        (res) => {
          let data = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            server.close();
            let json: any = undefined;
            try {
              json = data ? JSON.parse(data) : undefined;
            } catch {
              json = data;
            }
            resolve({ status: res.statusCode ?? 0, json });
          });
        },
      );
      req.on("error", (err) => {
        server.close();
        reject(err);
      });
      if (payload) req.write(payload);
      req.end();
    });
  });
}
