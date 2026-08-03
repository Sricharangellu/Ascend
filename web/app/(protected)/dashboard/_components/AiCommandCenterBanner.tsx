"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "@/api-client/client";

interface BriefingConversation {
  id: string;
  answer: string | null;
  status: "pending" | "complete" | "failed";
}

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 30_000;

/**
 * Optional AI-narrated framing over the dashboard's existing, deterministic
 * recommendations list (ADR-007) — purely additive. Renders nothing if the
 * ai_assistant module isn't enabled for this tenant (403), if narration is
 * unavailable (no ANTHROPIC_API_KEY, circuit open — the request completes
 * with status "failed"), or on poll timeout. The plain rule-based
 * recommendations list below this banner is the reliable source of truth
 * regardless of whether this ever appears.
 */
export function AiCommandCenterBanner() {
  const [answer, setAnswer] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiPost<{ conversationId: string }>("/api/v1/ai-assistant/briefing", {})
      .then(({ conversationId }) => {
        if (cancelled) return;
        let elapsedMs = 0;
        pollTimer.current = setInterval(() => {
          elapsedMs += POLL_INTERVAL_MS;
          apiGet<BriefingConversation>(`/api/v1/ai-assistant/conversations/${conversationId}`)
            .then((conv) => {
              if (cancelled) return;
              if (conv.status === "complete" && conv.answer) {
                setAnswer(conv.answer);
              }
              if (conv.status !== "pending" || elapsedMs >= POLL_TIMEOUT_MS) {
                if (pollTimer.current) clearInterval(pollTimer.current);
              }
            })
            .catch(() => {
              if (pollTimer.current) clearInterval(pollTimer.current);
            });
        }, POLL_INTERVAL_MS);
      })
      // Module not enabled (403) or any other failure — degrade silently.
      .catch(() => {});

    return () => {
      cancelled = true;
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  if (!answer) return null;

  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-700">AI briefing</p>
      <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-primary)]">{answer}</p>
    </div>
  );
}
