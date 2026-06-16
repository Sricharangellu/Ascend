"use client";

/**
 * Protected route layout — wraps all routes under app/(protected)/.
 *
 * Enforces authentication: if the user is not logged in (and no valid
 * refresh token exists), redirects to /login.
 *
 * This is a Client Component because it reads the in-memory auth state.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { OfflineBanner } from "@/components/OfflineBanner";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  // Loading: attempting silent refresh — show nothing to avoid flash
  if (status === "loading") {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-gray-50"
        aria-label="Loading…"
        aria-busy="true"
      >
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  // Unauthenticated: redirect is in flight; render nothing
  if (status === "unauthenticated") {
    return null;
  }

  return (
    <>
      <OfflineBanner />
      {children}
    </>
  );
}
