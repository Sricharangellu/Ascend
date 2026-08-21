import { apiPost } from "@/api-client/client";
import type { ReceivingSession } from "@/api-client/types";

/**
 * Start (or rejoin) the receiving session for a purchase order.
 *
 * Every route into receiving — the PO row, the PO detail page, the supplier
 * workspace, the command palette — goes through here, so "open the delivery I
 * am about to count" is one call from anywhere instead of a different sequence
 * of clicks per starting point.
 *
 * The backend allows only one open session per PO and returns the existing one
 * rather than erroring, so this is safe to call repeatedly: two people walking
 * up to the same pallet land in the same session instead of forking the count.
 */
export async function startReceivingSession(
  poId: string,
  opts?: { mode?: "standard" | "blind" | "asn"; dockCode?: string | null },
): Promise<ReceivingSession> {
  return apiPost<ReceivingSession>("/api/v1/purchasing/receiving/sessions", {
    poId,
    ...(opts?.mode ? { mode: opts.mode } : {}),
    ...(opts?.dockCode !== undefined ? { dockCode: opts.dockCode } : {}),
  });
}

/** Where a receiving session lives. */
export function receivingSessionHref(sessionId: string): string {
  return `/purchasing/receiving/${sessionId}`;
}
