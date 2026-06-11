"use client";

/**
 * /terminal — protected POS terminal placeholder (Wave 0).
 *
 * Wave 1 will replace the placeholder body with the product grid + cart.
 * The nav bar, role display, and offline indicator are live now.
 */

import { useAuth } from "@/lib/useAuth";
import { useFlag } from "@/flags/useFlag";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useToast } from "@/components/Toast";

export default function TerminalPage() {
  const { user, logout } = useAuth();
  const { addToast } = useToast();

  // Wave 1 flag — product grid is off until the backend ships catalog routes
  const showProductGrid = useFlag("product_grid");

  function handleTestToast() {
    addToast({
      title: "Terminal ready",
      description: "MSW mocks are active — backend not required.",
      variant: "success",
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-100">
      {/* ── Top nav bar ──────────────────────────────────────────────── */}
      <header className="flex items-center justify-between bg-white border-b border-gray-200 px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white"
          >
            F
          </div>
          <span className="text-lg font-semibold text-gray-900">
            Finder POS
          </span>
        </div>

        <div className="flex items-center gap-4">
          {user && (
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-800">{user.name}</p>
              <p className="text-xs text-gray-500 capitalize">{user.role}</p>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            Sign out
          </Button>
        </div>
      </header>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <main
        id="terminal-content"
        className="flex flex-1 flex-col items-center justify-center gap-6 p-8"
      >
        {showProductGrid ? (
          // Wave 1 placeholder — flag is off in Wave 0
          <p className="text-gray-500">Product grid loading…</p>
        ) : (
          <Card
            className="w-full max-w-lg text-center"
            title="Terminal — Wave 0"
            description="App shell, auth, MSW mocks, and feature flags are all wired up."
          >
            <div className="flex flex-col gap-4 py-2">
              <p className="text-sm text-gray-600">
                Logged in as{" "}
                <span className="font-semibold text-gray-900">
                  {user?.email ?? "—"}
                </span>{" "}
                (role:{" "}
                <span className="font-semibold capitalize text-brand-700">
                  {user?.role ?? "—"}
                </span>
                )
              </p>

              <p className="text-sm text-gray-500">
                The{" "}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
                  product_grid
                </code>{" "}
                feature flag is <strong>off</strong> — Wave 1 UI will appear
                here once the flag is enabled.
              </p>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleTestToast}
                >
                  Test toast notification
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => void logout()}
                >
                  Sign out
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Auth token info (dev only) */}
        {process.env.NODE_ENV === "development" && user && (
          <details className="w-full max-w-lg text-xs text-gray-400">
            <summary className="cursor-pointer select-none">
              Dev info (not shown in production)
            </summary>
            <pre className="mt-2 rounded bg-gray-800 p-3 text-green-400 overflow-auto">
              {JSON.stringify(
                { tenantId: user.tenantId, role: user.role, id: user.id },
                null,
                2
              )}
            </pre>
          </details>
        )}
      </main>
    </div>
  );
}
