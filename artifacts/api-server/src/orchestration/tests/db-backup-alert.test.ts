/**
 * DB backup failure alert — unit tests
 * Runner: node --test (project standard)
 *
 * Covers Task: backup alert emails must reach owners in every sendEmail
 * configuration (SendGrid, generic webhook, dev-mode console fallback) when a
 * pg_dump failure exhausts all retries — and the alert path must never mask
 * the original backup error.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { JobRow } from "../types.js";
import { runDbBackupWithAlert, sendBackupFailureAlert } from "../jobs/db-backup.job.js";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: "job_1",
    type: "db_backup",
    tenant_id: "system",
    payload: "{}",
    status: "running",
    attempts: 3,
    max_attempts: 3,
    run_at: Date.now() - 1000,
    created_at: Date.now() - 1000,
    updated_at: Date.now(),
    last_error: null,
    ...overrides,
  } as JobRow;
}

const ENV_KEYS = ["BACKUP_ALERT_EMAIL", "SENDGRID_API_KEY", "EMAIL_WEBHOOK_URL", "EMAIL_FROM"] as const;
const savedEnv: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
const realFetch = globalThis.fetch;

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k]!;
  }
  globalThis.fetch = realFetch;
});

function clearEmailEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

/** Replace global fetch with a recorder that returns the given response. */
function mockFetch(response: { ok: boolean; status?: number; body?: string } = { ok: true }): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 202 : 500),
      text: async () => response.body ?? "",
    } as Response;
  }) as typeof fetch;
  return calls;
}

// ── runDbBackupWithAlert: alert wiring + error propagation ──────────────────

test("db-backup: simulated pg_dump failure on final attempt calls the alert and re-throws", async () => {
  const bkpError = new Error("pg_dump exited 1: connection refused");
  const alerted: Error[] = [];
  await assert.rejects(
    () =>
      runDbBackupWithAlert(makeJob({ attempts: 3, max_attempts: 3 }), {
        backup: async () => { throw bkpError; },
        alert: async (e) => { alerted.push(e); },
      }),
    (err: unknown) => err === bkpError, // the ORIGINAL error must propagate
  );
  assert.equal(alerted.length, 1);
  assert.equal(alerted[0], bkpError);
});

test("db-backup: non-final attempt re-throws without alerting", async () => {
  const bkpError = new Error("pg_dump exited 1: transient");
  const alerted: Error[] = [];
  await assert.rejects(
    () =>
      runDbBackupWithAlert(makeJob({ attempts: 1, max_attempts: 3 }), {
        backup: async () => { throw bkpError; },
        alert: async (e) => { alerted.push(e); },
      }),
    (err: unknown) => err === bkpError,
  );
  assert.equal(alerted.length, 0);
});

test("db-backup: an alert that itself throws does not mask the original backup error", async () => {
  const bkpError = new Error("pg_dump exited 2: disk full");
  const alertError = new Error("SMTP relay unreachable");
  await assert.rejects(
    () =>
      runDbBackupWithAlert(makeJob({ attempts: 3, max_attempts: 3 }), {
        backup: async () => { throw bkpError; },
        alert: async () => { throw alertError; },
      }),
    (err: unknown) => err === bkpError, // backup error, NOT the alert error
  );
});

test("db-backup: real alert path with no email env does not mask the backup error", async () => {
  clearEmailEnv();
  const bkpError = new Error("pg_dump exited 2: disk full");
  await assert.rejects(
    () =>
      runDbBackupWithAlert(makeJob({ attempts: 3, max_attempts: 3 }), {
        backup: async () => { throw bkpError; },
        alert: (e) => sendBackupFailureAlert(e),
      }),
    (err: unknown) => err === bkpError,
  );
});

test("db-backup: successful backup neither alerts nor throws", async () => {
  const alerted: Error[] = [];
  await runDbBackupWithAlert(makeJob(), {
    backup: async () => ({ file: "f.sql", bytes: 10, pruned: 0 }),
    alert: async (e) => { alerted.push(e); },
  });
  assert.equal(alerted.length, 0);
});

// ── sendBackupFailureAlert: the three sendEmail configurations ──────────────

test("alert: SENDGRID_API_KEY set → email sent via SendGrid", async () => {
  clearEmailEnv();
  process.env["BACKUP_ALERT_EMAIL"] = "owner@example.com";
  process.env["SENDGRID_API_KEY"] = "SG.test-key";
  const calls = mockFetch({ ok: true });

  await sendBackupFailureAlert(new Error("pg_dump exited 1: boom"));

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://api.sendgrid.com/v3/mail/send");
  const body = JSON.parse(String(calls[0]!.init?.body));
  assert.equal(body.personalizations[0].to[0].email, "owner@example.com");
  assert.match(body.subject, /backup FAILED/i);
  assert.match(body.content[0].value, /pg_dump exited 1: boom/);
});

test("alert: EMAIL_WEBHOOK_URL set (no SendGrid) → webhook posted", async () => {
  clearEmailEnv();
  process.env["BACKUP_ALERT_EMAIL"] = "owner@example.com";
  process.env["EMAIL_WEBHOOK_URL"] = "https://hooks.example.com/email";
  const calls = mockFetch({ ok: true });

  await sendBackupFailureAlert(new Error("pg_dump exited 1: boom"));

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://hooks.example.com/email");
  const body = JSON.parse(String(calls[0]!.init?.body));
  assert.equal(body.to, "owner@example.com");
  assert.match(body.subject, /backup FAILED/i);
  assert.match(body.text, /pg_dump exited 1: boom/);
});

test("alert: neither SendGrid nor webhook configured → console fallback, no fetch, no throw", async () => {
  clearEmailEnv();
  process.env["BACKUP_ALERT_EMAIL"] = "owner@example.com";
  const calls = mockFetch({ ok: true });

  await sendBackupFailureAlert(new Error("pg_dump exited 1: boom")); // must not throw
  assert.equal(calls.length, 0); // dev fallback logs to console only
});

test("alert: BACKUP_ALERT_EMAIL not set → logs, sends nothing, does not throw", async () => {
  clearEmailEnv();
  process.env["SENDGRID_API_KEY"] = "SG.test-key";
  const calls = mockFetch({ ok: true });

  await sendBackupFailureAlert(new Error("pg_dump exited 1: boom"));
  assert.equal(calls.length, 0);
});

test("alert: SendGrid API failure is swallowed (alert never throws)", async () => {
  clearEmailEnv();
  process.env["BACKUP_ALERT_EMAIL"] = "owner@example.com";
  process.env["SENDGRID_API_KEY"] = "SG.test-key";
  mockFetch({ ok: false, status: 401, body: "unauthorized" });

  await sendBackupFailureAlert(new Error("pg_dump exited 1: boom")); // must not throw
});

test("alert: webhook failure is swallowed (alert never throws)", async () => {
  clearEmailEnv();
  process.env["BACKUP_ALERT_EMAIL"] = "owner@example.com";
  process.env["EMAIL_WEBHOOK_URL"] = "https://hooks.example.com/email";
  mockFetch({ ok: false, status: 500, body: "oops" });

  await sendBackupFailureAlert(new Error("pg_dump exited 1: boom")); // must not throw
});
