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
