/**
 * Remote backup storage — S3-compatible object storage for database dumps.
 *
 * Supports AWS S3, Cloudflare R2, Backblaze B2, MinIO, and any other
 * S3-compatible service. Activated by setting BACKUP_S3_BUCKET; without it
 * the backup job keeps writing local dumps only.
 *
 * Environment:
 *   BACKUP_S3_BUCKET             — bucket name (required to enable uploads)
 *   BACKUP_S3_KEY                — key prefix inside the bucket (default "backups/")
 *   BACKUP_S3_ENDPOINT           — custom endpoint URL for R2/B2/MinIO (optional;
 *                                  omit for AWS S3). Path-style addressing is
 *                                  used automatically when set.
 *   BACKUP_S3_REGION             — region (default "us-east-1"; R2 uses "auto")
 *   BACKUP_S3_ACCESS_KEY_ID      — access key (falls back to AWS_ACCESS_KEY_ID)
 *   BACKUP_S3_SECRET_ACCESS_KEY  — secret key (falls back to AWS_SECRET_ACCESS_KEY)
 */

import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { moduleLogger } from "./logger.js";

const log = moduleLogger("backup-storage");

export interface RemoteBackupConfig {
  bucket: string;
  /** Key prefix, always "" or ending in "/". */
  prefix: string;
  region: string;
  endpoint?: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
}

export interface RemoteBackupEntry {
  /** Full object key, e.g. "backups/ascend-backup-2026-08-02T00-00-00Z.sql". */
  key: string;
  /** Filename portion of the key. */
  filename: string;
  size: number;
  lastModified?: Date;
}

/** Minimal S3 surface used by this module — injectable for tests. */
export interface S3Like {
  send(command: unknown): Promise<unknown>;
}

/**
 * Read remote-backup configuration from the environment.
 * Returns null when BACKUP_S3_BUCKET is not set (remote uploads disabled).
 */
export function remoteBackupConfig(
  env: NodeJS.ProcessEnv = process.env,
): RemoteBackupConfig | null {
  const bucket = env["BACKUP_S3_BUCKET"]?.trim();
  if (!bucket) return null;

  let prefix = (env["BACKUP_S3_KEY"] ?? "backups/").trim();
  if (prefix === "/") prefix = "";
  if (prefix && !prefix.endsWith("/")) prefix += "/";
  // A leading slash produces keys like "//file" on S3 — strip it.
  prefix = prefix.replace(/^\/+/, "");

  const accessKeyId =
    env["BACKUP_S3_ACCESS_KEY_ID"] ?? env["AWS_ACCESS_KEY_ID"];
  const secretAccessKey =
    env["BACKUP_S3_SECRET_ACCESS_KEY"] ?? env["AWS_SECRET_ACCESS_KEY"];

  const config: RemoteBackupConfig = {
    bucket,
    prefix,
    region: env["BACKUP_S3_REGION"]?.trim() || "us-east-1",
  };
  const endpoint = env["BACKUP_S3_ENDPOINT"]?.trim();
  if (endpoint) config.endpoint = endpoint;
  if (accessKeyId && secretAccessKey) {
    config.credentials = { accessKeyId, secretAccessKey };
  }
  return config;
}

/** Build a real S3 client from config. Separated so tests can inject a fake. */
export function createS3Client(config: RemoteBackupConfig): S3Like {
  return new S3Client({
    region: config.region,
    ...(config.endpoint
      ? { endpoint: config.endpoint, forcePathStyle: true }
      : {}),
    ...(config.credentials ? { credentials: config.credentials } : {}),
  });
}

/**
 * Upload a local dump file to the configured bucket.
 * Throws on failure — callers decide whether that fails the backup job.
 */
export async function uploadBackup(
  localPath: string,
  filename: string,
  config: RemoteBackupConfig,
  client: S3Like = createS3Client(config),
): Promise<{ key: string }> {
  const key = `${config.prefix}${filename}`;
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: createReadStream(localPath),
      ContentType: "application/sql",
    }),
  );
  log.info({ bucket: config.bucket, key }, "backup uploaded to remote storage");
  return { key };
}

/** List backup dumps in the configured bucket/prefix, newest first. */
export async function listRemoteBackups(
  config: RemoteBackupConfig,
  client: S3Like = createS3Client(config),
): Promise<RemoteBackupEntry[]> {
  const entries: RemoteBackupEntry[] = [];
  let continuationToken: string | undefined;

  do {
    const response = (await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: config.prefix,
        ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
      }),
    )) as {
      Contents?: { Key?: string; Size?: number; LastModified?: Date }[];
      IsTruncated?: boolean;
      NextContinuationToken?: string;
    };

    for (const obj of response.Contents ?? []) {
      if (!obj.Key) continue;
      const filename = obj.Key.slice(config.prefix.length);
      // Only surface dump files this system created.
      if (!filename.startsWith("ascend-backup-") || !filename.endsWith(".sql")) {
        continue;
      }
      const entry: RemoteBackupEntry = {
        key: obj.Key,
        filename,
        size: obj.Size ?? 0,
      };
      if (obj.LastModified) entry.lastModified = obj.LastModified;
      entries.push(entry);
    }
    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  entries.sort((a, b) => b.filename.localeCompare(a.filename));
  return entries;
}

/** Download a remote dump (by filename) to a local destination path. */
export async function downloadRemoteBackup(
  filename: string,
  destPath: string,
  config: RemoteBackupConfig,
  client: S3Like = createS3Client(config),
): Promise<void> {
  const key = `${config.prefix}${filename}`;
  const response = (await client.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
  )) as { Body?: unknown };

  const body = response.Body;
  if (!body) {
    throw new Error(`Remote backup ${key} returned an empty body`);
  }

  // In Node, GetObject Body is a Readable stream.
  const stream =
    body instanceof Readable ? body : Readable.from(body as AsyncIterable<Uint8Array>);
  await pipeline(stream, createWriteStream(destPath));
  log.info({ bucket: config.bucket, key, destPath }, "remote backup downloaded");
}
