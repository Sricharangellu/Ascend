import { v7 as uuidv7 } from "uuid";
import type { DB } from "../../shared/db.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface PushToken {
  id: string;
  tenant_id: string;
  user_id: string;
  token: string;
  platform: string;
  created_at: number;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface QuietHoursConfig {
  enabled: boolean;
  /** Local wall-clock start, "HH:MM" (24h). */
  start: string;
  /** Local wall-clock end, "HH:MM" (24h). */
  end: string;
  /** IANA timezone, e.g. "America/New_York". */
  timezone: string;
}

export const DEFAULT_QUIET_HOURS: QuietHoursConfig = {
  enabled: false,
  start: "22:00",
  end: "07:00",
  timezone: "UTC",
};

/** "HH:MM" → minutes since midnight. Returns null when malformed. */
export function parseHHMM(value: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** True when the given IANA timezone name is usable in this runtime. */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Current minutes-since-midnight in the given timezone. */
function minutesNowIn(timezone: string, now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/**
 * Pure quiet-window check. Handles overnight windows (start > end, e.g.
 * 22:00–07:00). A window where start === end is treated as inactive.
 */
export function isWithinQuietWindow(config: QuietHoursConfig, now: Date = new Date()): boolean {
  if (!config.enabled) return false;
  const start = parseHHMM(config.start);
  const end = parseHHMM(config.end);
  if (start === null || end === null || start === end) return false;
  if (!isValidTimezone(config.timezone)) return false;
  const m = minutesNowIn(config.timezone, now);
  return start < end ? m >= start && m < end : m >= start || m < end;
}

export class PushTokensService {
  constructor(private readonly db: DB) {}

  async register(
    tenantId: string,
    userId: string,
    token: string,
    platform: string,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO push_tokens (id, tenant_id, user_id, token, platform, created_at)
       VALUES (@id, @tenant_id, @user_id, @token, @platform, @created_at)
       ON CONFLICT (tenant_id, token)
       DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform`,
      {
        id: `ptk_${uuidv7()}`,
        tenant_id: tenantId,
        user_id: userId,
        token,
        platform,
        created_at: Date.now(),
      },
    );
  }

  async unregister(tenantId: string, token: string): Promise<void> {
    await this.db.query(
      `DELETE FROM push_tokens WHERE tenant_id = @tenantId AND token = @token`,
      { tenantId, token },
    );
  }

  async getQuietHours(tenantId: string): Promise<QuietHoursConfig> {
    const row = await this.db.one<{
      enabled: boolean;
      start_time: string;
      end_time: string;
      timezone: string;
    }>(
      `SELECT enabled, start_time, end_time, timezone
         FROM push_quiet_hours WHERE tenant_id = @tenantId`,
      { tenantId },
    );
    if (!row) return { ...DEFAULT_QUIET_HOURS };
    return {
      enabled: row.enabled,
      start: row.start_time,
      end: row.end_time,
      timezone: row.timezone,
    };
  }

  async setQuietHours(tenantId: string, config: QuietHoursConfig): Promise<QuietHoursConfig> {
    await this.db.query(
      `INSERT INTO push_quiet_hours (tenant_id, enabled, start_time, end_time, timezone, updated_at)
       VALUES (@tenant_id, @enabled, @start_time, @end_time, @timezone, @updated_at)
       ON CONFLICT (tenant_id)
       DO UPDATE SET enabled = EXCLUDED.enabled,
                     start_time = EXCLUDED.start_time,
                     end_time = EXCLUDED.end_time,
                     timezone = EXCLUDED.timezone,
                     updated_at = EXCLUDED.updated_at`,
      {
        tenant_id: tenantId,
        enabled: config.enabled,
        start_time: config.start,
        end_time: config.end,
        timezone: config.timezone,
        updated_at: Date.now(),
      },
    );
    return config;
  }

  /** True when the tenant's quiet-hours window is active right now. */
  async isQuietNow(tenantId: string, now: Date = new Date()): Promise<boolean> {
    const config = await this.getQuietHours(tenantId);
    return isWithinQuietWindow(config, now);
  }

  async sendToTenant(
    tenantId: string,
    notification: PushNotificationPayload,
  ): Promise<void> {
    const rows = await this.db.query<{ token: string }>(
      `SELECT token FROM push_tokens WHERE tenant_id = @tenantId`,
      { tenantId },
    );
    if (rows.length === 0) return;

    // Only send to valid Expo push tokens
    const validTokens = rows
      .map((r) => r.token)
      .filter((t) => t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken["));
    if (validTokens.length === 0) return;

    const messages = validTokens.map((to) => ({
      to,
      title: notification.title,
      body: notification.body,
      data: notification.data ?? {},
      sound: "default",
      priority: "high",
    }));

    // Fire-and-forget — don't block the order creation path
    fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    }).catch(() => {
      // Silently ignore network errors — push is best-effort
    });
  }
}
