/**
 * backup-storage.test.ts — remote backup config parsing and S3 operations.
 *
 * Pure unit tests: the S3 client is faked, no network or credentials needed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  remoteBackupConfig,
  uploadBackup,
  listRemoteBackups,
  downloadRemoteBackup,
  type S3Like,
} from "./backup-storage.js";

const env = (vars: Record<string, string>): NodeJS.ProcessEnv =>
  vars as NodeJS.ProcessEnv;

// ── remoteBackupConfig ───────────────────────────────────────────────────────

test("config is null when BACKUP_S3_BUCKET is unset or blank", () => {
  assert.equal(remoteBackupConfig(env({})), null);
  assert.equal(remoteBackupConfig(env({ BACKUP_S3_BUCKET: "  " })), null);
});

test("defaults: prefix backups/, region us-east-1, no endpoint/credentials", () => {
  const cfg = remoteBackupConfig(env({ BACKUP_S3_BUCKET: "my-bucket" }));
  assert.ok(cfg);
  assert.equal(cfg.bucket, "my-bucket");
  assert.equal(cfg.prefix, "backups/");
  assert.equal(cfg.region, "us-east-1");
  assert.equal(cfg.endpoint, undefined);
  assert.equal(cfg.credentials, undefined);
});

test("BACKUP_S3_KEY normalizes to a clean trailing-slash prefix", () => {
  const at = (key: string) =>
    remoteBackupConfig(env({ BACKUP_S3_BUCKET: "b", BACKUP_S3_KEY: key }))!.prefix;
  assert.equal(at("dumps"), "dumps/");
  assert.equal(at("dumps/"), "dumps/");
  assert.equal(at("/dumps/"), "dumps/");
  assert.equal(at("/"), "");
  assert.equal(at(""), "");
});

test("endpoint, region, and dedicated credentials are honored", () => {
  const cfg = remoteBackupConfig(
    env({
      BACKUP_S3_BUCKET: "b",
      BACKUP_S3_ENDPOINT: "https://accountid.r2.cloudflarestorage.com",
      BACKUP_S3_REGION: "auto",
      BACKUP_S3_ACCESS_KEY_ID: "id",
      BACKUP_S3_SECRET_ACCESS_KEY: "secret",
    }),
  );
  assert.ok(cfg);
  assert.equal(cfg.endpoint, "https://accountid.r2.cloudflarestorage.com");
  assert.equal(cfg.region, "auto");
  assert.deepEqual(cfg.credentials, { accessKeyId: "id", secretAccessKey: "secret" });
});

test("falls back to standard AWS credentials env vars", () => {
  const cfg = remoteBackupConfig(
    env({
      BACKUP_S3_BUCKET: "b",
      AWS_ACCESS_KEY_ID: "aws-id",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
    }),
  );
  assert.ok(cfg);
  assert.deepEqual(cfg.credentials, {
    accessKeyId: "aws-id",
    secretAccessKey: "aws-secret",
  });
});

// ── S3 operations with a fake client ────────────────────────────────────────

const baseConfig = {
  bucket: "test-bucket",
  prefix: "backups/",
  region: "us-east-1",
};

test("uploadBackup puts the file under prefix and returns the key", async () => {
  const dir = await mkdtemp(join(tmpdir(), "backup-test-"));
  const local = join(dir, "ascend-backup-x.sql");
  await writeFile(local, "-- sql dump\n");

  const sent: any[] = [];
  const fake: S3Like = {
    send: async (cmd) => {
      sent.push(cmd);
      return {};
    },
  };

  const { key } = await uploadBackup(local, "ascend-backup-x.sql", baseConfig, fake);
  assert.equal(key, "backups/ascend-backup-x.sql");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].input.Bucket, "test-bucket");
  assert.equal(sent[0].input.Key, "backups/ascend-backup-x.sql");
});

test("uploadBackup propagates client failure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "backup-test-"));
  const local = join(dir, "ascend-backup-y.sql");
  await writeFile(local, "-- sql dump\n");

  const fake: S3Like = {
    send: async () => {
      throw new Error("AccessDenied");
    },
  };
  await assert.rejects(
    uploadBackup(local, "ascend-backup-y.sql", baseConfig, fake),
    /AccessDenied/,
  );
});

test("listRemoteBackups filters to dump files, paginates, sorts newest first", async () => {
  const pages = [
    {
      Contents: [
        { Key: "backups/ascend-backup-2026-01-01T00-00-00Z.sql", Size: 10 },
        { Key: "backups/unrelated.txt", Size: 5 },
      ],
      IsTruncated: true,
      NextContinuationToken: "tok",
    },
    {
      Contents: [
        {
          Key: "backups/ascend-backup-2026-02-01T00-00-00Z.sql",
          Size: 20,
          LastModified: new Date("2026-02-01T01:00:00Z"),
        },
      ],
      IsTruncated: false,
    },
  ];
  let call = 0;
  const fake: S3Like = { send: async () => pages[call++] };

  const entries = await listRemoteBackups(baseConfig, fake);
  assert.equal(call, 2);
  assert.deepEqual(
    entries.map((e) => e.filename),
    [
      "ascend-backup-2026-02-01T00-00-00Z.sql",
      "ascend-backup-2026-01-01T00-00-00Z.sql",
    ],
  );
  assert.equal(entries[0].size, 20);
  assert.equal(entries[0].lastModified?.toISOString(), "2026-02-01T01:00:00.000Z");
});

test("downloadRemoteBackup writes the object body to the destination", async () => {
  const dir = await mkdtemp(join(tmpdir(), "backup-test-"));
  const dest = join(dir, "restored.sql");

  const { Readable } = await import("node:stream");
  const fake: S3Like = {
    send: async (cmd: any) => {
      assert.equal(cmd.input.Key, "backups/ascend-backup-z.sql");
      return { Body: Readable.from([Buffer.from("-- restored dump\n")]) };
    },
  };

  await downloadRemoteBackup("ascend-backup-z.sql", dest, baseConfig, fake);
  assert.equal(await readFile(dest, "utf8"), "-- restored dump\n");
});

test("downloadRemoteBackup rejects on empty body", async () => {
  const fake: S3Like = { send: async () => ({}) };
  await assert.rejects(
    downloadRemoteBackup("ascend-backup-z.sql", "/tmp/never-written.sql", baseConfig, fake),
    /empty body/,
  );
});
