import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";
import { GlobalErrorBoundary } from "@/components/ErrorBoundary";
import { FlagProvider } from "@/flags/FlagProvider";
import MockWorkerInit from "@/mocks/MockWorkerInit";

export const metadata: Metadata = {
  title: {
    default: "Finder POS",
    template: "%s | Finder POS",
  },
  description: "Point-of-sale terminal for Finder",
  // Prevent indexing in non-prod environments
  robots: process.env.NODE_ENV === "production" ? "index,follow" : "noindex",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Prevent auto-zoom on iOS when focusing inputs (UX)
  maximumScale: 1,
  userScalable: false,
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* Skip to main content for keyboard/screen-reader users */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>

        {/* Initialise MSW browser worker in development */}
        <MockWorkerInit />

        <GlobalErrorBoundary>
          <FlagProvider>
            <ToastProvider>
              <main id="main-content" tabIndex={-1} className="outline-none">
                {children}
              </main>
            </ToastProvider>
          </FlagProvider>
        </GlobalErrorBoundary>
      </body>
    </html>
  );
}
