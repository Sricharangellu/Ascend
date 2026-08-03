"use client";

/**
 * GlobalErrorBoundary — catches unhandled React render errors.
 *
 * Renders a user-friendly fallback and logs the error + requestId from the
 * standard API error envelope when available.
 *
 * In Next.js App Router, this is a Client Component that wraps the entire
 * app tree in layout.tsx.
 */

import React from "react";
import { ApiResponseError } from "@/api-client/client";

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GlobalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Structured log — never log PAN or secrets
    console.error("[ErrorBoundary]", {
      message: error.message,
      requestId:
        error instanceof ApiResponseError ? error.requestId : undefined,
      componentStack: info.componentStack,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    // Navigate home on reset
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const err = this.state.error;
    const isApiError = err instanceof ApiResponseError;

    return (
      <div
        role="alert"
        className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-50 p-6 text-center"
      >
        <div className="max-w-md">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-100"
            aria-hidden="true"
          >
            <span className="text-3xl text-danger-600">!</span>
          </div>

          <h1 className="text-2xl font-bold text-gray-900">
            Something went wrong
          </h1>

          <p className="mt-2 text-gray-600">
            {isApiError
              ? err.message
              : "An unexpected error occurred. Please reload the page."}
          </p>

          {isApiError && err.requestId && (
            <p className="mt-2 font-mono text-xs text-gray-400">
              Request ID: {err.requestId}
            </p>
          )}

          {isApiError && (
            <p className="mt-1 font-mono text-xs text-gray-400">
              Code: {err.code}
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={this.handleReset}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white
                       hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600
                       focus-visible:ring-offset-2 min-h-[44px]"
          >
            Back to home
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm
                       font-medium text-gray-700 hover:bg-gray-50
                       focus-visible:ring-2 focus-visible:ring-brand-600
                       focus-visible:ring-offset-2 min-h-[44px]"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
