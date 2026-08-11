import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";
import { GlobalErrorBoundary } from "@/components/ErrorBoundary";
import { FlagProvider } from "@/flags/FlagProvider";
import MockWorkerInit from "@/mocks/MockWorkerInit";
import { ErrorMonitor } from "@/components/ErrorMonitor";
import { ServiceWorkerInit } from "@/components/ServiceWorkerInit";

export const metadata: Metadata = {
  title: {
    default: "Ascend",
    template: "%s | Ascend",
  },
  description: "Ascend — commerce operating platform",
  manifest: "/manifest.webmanifest",
  // Prevent indexing in non-prod environments
  robots: process.env.NODE_ENV === "production" ? "index,follow" : "noindex",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Ascend",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom stays available. `maximumScale: 1` + `userScalable: false` used to sit
  // here to stop iOS auto-zooming when a <16px input takes focus — but that is
  // a WCAG 2.1 AA failure (SC 1.4.4 Resize Text), and it blocks the pinch a
  // warehouse user needs to read a lot code or an expiry date in bad light.
  // The auto-zoom is fixed at its actual cause instead: globals.css sizes
  // form controls at 16px on coarse-pointer devices, which is the threshold
  // iOS checks. Suppressing the symptom cost every user their zoom.
  //
  // `viewportFit: cover` lets the layout paint under the notch/home indicator;
  // the chrome that must clear them reads env(safe-area-inset-*).
  viewportFit: "cover",
  // Was #2563eb — a blue from the brand retired on 2026-07-14, so the phone
  // status bar and PWA splash were a different identity from the app. These
  // match --color-topbar-bg, which is what actually sits under the status bar.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#14181F" },
    { media: "(prefers-color-scheme: dark)", color: "#0C0F14" },
  ],
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

        {/* Register production service worker for offline shell */}
        <ServiceWorkerInit />
        {/* Install global JS error handlers for monitoring */}
        <ErrorMonitor />

        <MockWorkerInit>
          <GlobalErrorBoundary>
            <FlagProvider>
              <ToastProvider>
                <main id="main-content" tabIndex={-1} className="outline-none">
                  {children}
                </main>
              </ToastProvider>
            </FlagProvider>
          </GlobalErrorBoundary>
        </MockWorkerInit>
      </body>
    </html>
  );
}
