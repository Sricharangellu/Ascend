import type { Response } from "express";
import { v7 as uuidv7 } from "uuid";

export interface SseEvent {
  type: string;
  data: Record<string, unknown>;
}

/**
 * SseBroker — per-tenant Server-Sent Events fan-out.
 *
 * Each browser tab that calls GET /api/v1/stream gets its own Response slot.
 * Events published for a tenantId are written to all connected clients for
 * that tenant. Slots are cleaned up on client disconnect.
 */
export class SseBroker {
  private clients = new Map<string, Response>(); // `${tenantId}:${clientId}` → Response

  connect(tenantId: string, res: Response): () => void {
    const clientId = uuidv7();
    const key = `${tenantId}:${clientId}`;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // nginx: disable proxy buffering
    res.flushHeaders();
    res.write(": connected\n\n");

    this.clients.set(key, res);

    // Heartbeat every 25s to keep the connection alive through proxies
    const heartbeat = setInterval(() => {
      if (res.writable) res.write(": heartbeat\n\n");
    }, 25_000);

    const cleanup = () => {
      clearInterval(heartbeat);
      this.clients.delete(key);
    };

    res.on("close", cleanup);
    res.on("error", cleanup);

    return cleanup;
  }

  broadcast(tenantId: string, event: SseEvent): void {
    const prefix = `${tenantId}:`;
    const payload = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
    for (const [key, res] of this.clients) {
      if (key.startsWith(prefix) && res.writable) {
        res.write(payload);
      }
    }
  }

  get connectionCount(): number {
    return this.clients.size;
  }
}
