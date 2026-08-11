import type { Request, Response, NextFunction } from "express";
import { logger } from "../shared/logger.js";
import type { AuthPayload } from "./auth.js";

/**
 * One structured log line per completed request.
 *
 * WHY: this app had no per-request logging at all. That is not a theoretical
 * gap — `docs/architecture/PIPELINE.md` records an incident investigation that
 * ran `LOG_LEVEL=debug` against a failing CI run and got **three boot lines and
 * nothing else** for a ten-minute run, because nothing logs individual
 * requests. The root cause (a tripped rate limiter returning 429s) was
 * eventually found from a Playwright DOM snapshot instead of from the server.
 * An access log would have shown a wall of 429s immediately.
 *
 * It is also what makes the error envelope's `requestId` worth having: the
 * envelope hands a caller an id, and this is the line that id resolves to.
 *
 * Deliberately NOT `pino-http`: `metricsMiddleware` already establishes the
 * `res.on("finish")` + `process.hrtime.bigint()` idiom in this gateway, and
 * matching it costs ~40 lines and no new dependency. A dependency here would
 * also have to be justified against this repo's supply-chain posture, which
 * pins even actionlint by release tag.
 *
 * What is deliberately NOT logged: request/response bodies, headers, and query
 * strings. Bodies carry passwords and card data; query strings carry tokens in
 * some OAuth flows. `logger` redacts known credential paths as defence in
 * depth, but the cheaper guarantee is never passing them in the first place.
 */

/** Probe endpoints, logged at debug so a 15-minute heartbeat cannot flood info. */
const PROBE_PATHS = new Set(["/healthz", "/readyz", "/health", "/metrics"]);

export type AccessLogLevel = "debug" | "info" | "warn" | "error";

export interface AccessLogLine {
  requestId?: string;
  traceId?: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  tenantId?: string;
  userId?: string;
  /**
   * Present only when the response never finished writing — the client gave up
   * or the connection dropped. Omitted entirely on the normal path so it reads
   * as an exception rather than a field every line carries.
   */
  aborted?: true;
}

/**
 * The whole decision — which fields are logged and at what severity — as a pure
 * function, so it is testable without capturing a log sink. (pino runs behind a
 * worker-thread transport in development, which writes to fd 1 directly and is
 * therefore not observable by patching `process.stdout.write`; asserting on a
 * mock logger instead would pass even if the real sink were misconfigured.
 * Keeping the logic pure sidesteps both problems.)
 */
export function buildAccessLogLine(
  req: Pick<Request, "method" | "path">,
  res: Pick<Response, "statusCode" | "locals" | "writableFinished">,
  durationMs: number,
): { line: AccessLogLine; level: AccessLogLevel } {
  // req.path excludes the query string by construction — keep it that way.
  const path = req.path;
  const auth = res.locals["auth"] as AuthPayload | undefined;

  // The hook fires on `close`, which covers both a completed response and a
  // connection that died first. `writableFinished` is what separates them, and
  // the distinction matters: on an abort the status code is whatever was set
  // before the client left (often the default 200), so logging it unqualified
  // would report a success that never reached anyone.
  const aborted = res.writableFinished === false;

  const line: AccessLogLine = {
    requestId: res.locals["requestId"] as string | undefined,
    traceId: res.locals["traceId"] as string | undefined,
    method: req.method,
    path,
    status: res.statusCode,
    durationMs: Math.round(durationMs * 10) / 10,
    // Populated by the time the hook fires even though auth runs later than
    // this middleware — that ordering is why the work happens in the hook.
    tenantId: auth?.tenantId,
    userId: auth?.userId,
    ...(aborted ? { aborted: true as const } : {}),
  };

  // Severity tracks the response, so `level>=warn` is a usable filter for
  // "something the caller was told was wrong". An abort is warn regardless of
  // the recorded status — a client that gave up waiting is the signal an
  // operator is looking for, and it is invisible in the status alone.
  let level: AccessLogLevel;
  if (PROBE_PATHS.has(path)) level = "debug";
  else if (res.statusCode >= 500) level = "error";
  else if (aborted || res.statusCode >= 400) level = "warn";
  else level = "info";

  return { line, level };
}

export function accessLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  // `close`, not `finish`. `finish` fires only once a response has been fully
  // written, so a client that gives up and disconnects mid-request produces NO
  // line at all — and a request that hung long enough for the caller to abandon
  // it is precisely what an operator goes looking for. `close` fires on both
  // outcomes and `writableFinished` tells them apart. (`metricsMiddleware` uses
  // `finish`; that is right for RED metrics, which count served responses, and
  // wrong here, where the unserved ones are the interesting ones.)
  //
  // `close` fires exactly once per response, so this cannot double-log.
  res.on("close", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const { line, level } = buildAccessLogLine(req, res, durationMs);
    logger[level](line, "request");
  });

  next();
}
