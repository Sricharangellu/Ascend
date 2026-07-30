"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { apiGet, apiPost } from "@/api-client/client";
import { useToast } from "@/components/Toast";
import { getUser } from "@/lib/auth";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Card } from "@/components/Card";
import { Badge, type BadgeVariant } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";

interface Conversation {
  id: string;
  question: string;
  answer: string | null;
  status: "pending" | "complete" | "failed";
  error: string | null;
  createdAt: number;
  completedAt: number | null;
}

interface Recommendation {
  id: string;
  conversationId: string;
  recommendation: string;
  reason: string;
  dataUsed: unknown;
  confidenceScore: number;
  requiredApprovalLevel: "none" | "manager" | "owner";
  sourceType: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  decidedAt: number | null;
}

interface DecideResponse {
  recommendation: Recommendation;
  poResult?: unknown;
  poError?: { message?: string } | string | null;
}

const SUGGESTED_QUESTIONS = [
  "Should I reorder coffee beans?",
  "What's expiring soon?",
  "What are my best sellers?",
  "What products are slow movers?",
];

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 30_000;

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const SOURCE_LABEL: Record<string, string> = {
  reorder: "Reorder alert",
  low_stock: "Low stock",
  expiry: "Expiring inventory",
  best_sellers: "Best sellers",
  slow_movers: "Slow movers",
};

function ConfidenceBadge({ score }: { score: number }) {
  const variant: BadgeVariant = score >= 85 ? "green" : score >= 60 ? "orange" : "gray";
  return (
    <Badge variant={variant} outlined size="sm">
      {score}% confidence
    </Badge>
  );
}

const STATUS_VARIANT: Record<Recommendation["status"], BadgeVariant> = {
  pending: "orange",
  approved: "green",
  rejected: "red",
};

function StatusBadge({ status }: { status: Recommendation["status"] }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} outlined size="sm">
      {status}
    </Badge>
  );
}

function RecommendationCard({
  rec,
  canDecide,
  deciding,
  onDecide,
}: {
  rec: Recommendation;
  canDecide: boolean;
  deciding: boolean;
  onDecide: (id: string, decision: "approve" | "reject") => void;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-erp-text-secondary">
            {SOURCE_LABEL[rec.sourceType] ?? rec.sourceType}
          </p>
          <p className="mt-1 text-sm font-medium text-erp-text-primary">{rec.recommendation}</p>
        </div>
        <StatusBadge status={rec.status} />
      </div>
      <p className="mt-2 text-xs text-erp-text-secondary">{rec.reason}</p>
      <div className="mt-3 flex items-center justify-between">
        <ConfidenceBadge score={rec.confidenceScore} />
        <span className="text-[11px] text-erp-text-secondary">{timeAgo(rec.createdAt)}</span>
      </div>
      {rec.status === "pending" && rec.requiredApprovalLevel !== "none" && (
        canDecide ? (
          <div className="mt-3 flex gap-2">
            <Button
              variant="primary"
              size="sm"
              fullWidth
              disabled={deciding}
              onClick={() => onDecide(rec.id, "approve")}
            >
              Approve
            </Button>
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              disabled={deciding}
              onClick={() => onDecide(rec.id, "reject")}
            >
              Reject
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-erp-text-secondary">Requires a manager to decide.</p>
        )
      )}
    </Card>
  );
}

export default function AiAssistantPage() {
  const user = getUser();
  const canDecide = user?.role === "owner" || user?.role === "manager";
  const { addToast } = useToast();

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<string | null>(null);
  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const loadConversations = useCallback(
    () =>
      apiGet<{ items: Conversation[] }>("/api/v1/ai-assistant/conversations")
        .then((r) => setConversations(r.items ?? []))
        .catch(() => {}),
    [],
  );

  const loadRecommendations = useCallback(
    () =>
      apiGet<{ items: Recommendation[] }>("/api/v1/ai-assistant/recommendations")
        .then((r) => setRecommendations(r.items ?? []))
        .catch(() => {}),
    [],
  );

  const pollConversation = useCallback(
    (id: string) => {
      if (pollTimers.current.has(id)) return;
      let elapsedMs = 0;
      const timer = setInterval(() => {
        elapsedMs += POLL_INTERVAL_MS;
        apiGet<Conversation>(`/api/v1/ai-assistant/conversations/${id}`)
          .then((conv) => {
            setConversations((prev) => prev.map((c) => (c.id === id ? conv : c)));
            if (conv.status !== "pending" || elapsedMs >= POLL_TIMEOUT_MS) {
              clearInterval(timer);
              pollTimers.current.delete(id);
              if (conv.status !== "pending") void loadRecommendations();
            }
          })
          .catch(() => {
            clearInterval(timer);
            pollTimers.current.delete(id);
          });
      }, POLL_INTERVAL_MS);
      pollTimers.current.set(id, timer);
    },
    [loadRecommendations],
  );

  useEffect(() => {
    setLoading(true);
    Promise.all([loadConversations(), loadRecommendations()]).finally(() => setLoading(false));
  }, [loadConversations, loadRecommendations]);

  // Resume polling anything still mid-flight from before the page loaded
  // (e.g. a refresh while a question was processing).
  useEffect(() => {
    for (const c of conversations) {
      if (c.status === "pending") pollConversation(c.id);
    }
  }, [conversations, pollConversation]);

  useEffect(() => {
    const timers = pollTimers.current;
    return () => {
      for (const t of timers.values()) clearInterval(t);
    };
  }, []);

  async function handleAsk(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setAsking(true);
    try {
      const { conversationId } = await apiPost<{ conversationId: string; status: string }>(
        "/api/v1/ai-assistant/ask",
        { question: trimmed },
      );
      setQuestion("");
      setConversations((prev) => [
        { id: conversationId, question: trimmed, answer: null, status: "pending", error: null, createdAt: Date.now(), completedAt: null },
        ...prev,
      ]);
      pollConversation(conversationId);
    } catch (err) {
      addToast({ title: err instanceof Error ? err.message : "Failed to ask", variant: "error" });
    } finally {
      setAsking(false);
    }
  }

  async function handleDecide(id: string, decision: "approve" | "reject") {
    setDeciding(id);
    try {
      const result = await apiPost<DecideResponse>(`/api/v1/ai-assistant/recommendations/${id}/${decision}`, {});
      setRecommendations((prev) => prev.map((r) => (r.id === id ? result.recommendation : r)));
      if (decision === "approve" && result.poError) {
        addToast({ title: "Approved, but purchase order creation failed", variant: "warning" });
      } else {
        addToast({ title: decision === "approve" ? "Recommendation approved" : "Recommendation rejected", variant: "success" });
      }
    } catch (err) {
      addToast({ title: err instanceof Error ? err.message : "Failed to decide", variant: "error" });
    } finally {
      setDeciding(null);
    }
  }

  const pending = recommendations.filter((r) => r.status === "pending");
  const decided = recommendations.filter((r) => r.status !== "pending");

  return (
    <EnterpriseShell
      active="ai-assistant"
      title="AI Assistant"
      subtitle="Ask about reorder, low stock, expiry, best & slow sellers — every answer is grounded in your real inventory and sales data"
    >
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Chat column */}
        <div className="flex w-1/2 min-w-0 flex-col border-r border-erp-table-border">
          <div className="border-b border-erp-table-border bg-white px-6 py-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleAsk(question);
              }}
              className="flex items-start gap-2"
            >
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about menu or inventory…"
                aria-label="Ask a question"
                className="h-9 min-h-0"
              />
              <Button type="submit" variant="primary" disabled={asking || !question.trim()}>
                Ask
              </Button>
            </form>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTED_QUESTIONS.map((q) => (
                <Button
                  key={q}
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={asking}
                  onClick={() => void handleAsk(q)}
                  className="!min-w-0 rounded-full"
                >
                  {q}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading && (
              <div className="flex flex-col gap-3" aria-label="Loading conversations">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            )}
            {!loading && conversations.length === 0 && (
              <EmptyState
                title="No conversations yet"
                description="Ask a question above to get started — try one of the suggestions."
              />
            )}
            <div className="flex flex-col gap-4">
              {conversations.map((c) => (
                <Card key={c.id}>
                  <p className="text-sm font-medium text-erp-text-primary">{c.question}</p>
                  <div className="mt-2">
                    {c.status === "pending" && (
                      <p className="flex items-center gap-2 text-sm text-erp-text-secondary">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" aria-hidden="true" />
                        Thinking…
                      </p>
                    )}
                    {c.status === "complete" && (
                      <p className="text-sm text-erp-text-primary">{c.answer}</p>
                    )}
                    {c.status === "failed" && (
                      <p className="rounded bg-warning-50 px-2 py-1.5 text-xs text-warning-700">
                        {c.error ?? "AI narration unavailable."} The underlying data is still available in the Recommendations panel and in Inventory as normal.
                      </p>
                    )}
                  </div>
                  <p className="mt-2 text-[11px] text-erp-text-secondary">{timeAgo(c.createdAt)}</p>
                </Card>
              ))}
            </div>
          </div>
        </div>

        {/* Recommendations column */}
        <div className="flex w-1/2 min-w-0 flex-col overflow-y-auto px-6 py-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-erp-text-secondary">
            Pending ({pending.length})
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            {pending.length === 0 && !loading && (
              <p className="text-sm text-erp-text-secondary">No pending recommendations.</p>
            )}
            {pending.map((rec) => (
              <RecommendationCard
                key={rec.id}
                rec={rec}
                canDecide={canDecide}
                deciding={deciding === rec.id}
                onDecide={(id, decision) => void handleDecide(id, decision)}
              />
            ))}
          </div>

          {decided.length > 0 && (
            <>
              <h2 className="mt-6 text-xs font-semibold uppercase tracking-wider text-erp-text-secondary">
                History
              </h2>
              <div className="mt-3 flex flex-col gap-3">
                {decided.map((rec) => (
                  <RecommendationCard
                    key={rec.id}
                    rec={rec}
                    canDecide={canDecide}
                    deciding={false}
                    onDecide={() => {}}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </EnterpriseShell>
  );
}
