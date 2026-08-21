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
        {/* Register production service worker for offline shell */}
        <ServiceWorkerInit />
        {/* Install global JS error handlers for monitoring */}
        <ErrorMonitor />

        {/*
          No <main> or skip link here.

          This used to render `<main id="main-content">` around everything, and
          EnterpriseShell renders its own `<main id="main-content">` inside it.
          That produced a duplicate id and a nested <main> on every protected
          page — and because `#main-content` resolves to the FIRST match, the
          skip link jumped to a wrapper that starts ABOVE the top bar and the
          navigation rail. "Skip to content" therefore skipped nothing, on
          every signed-in page, which is the one keyboard affordance whose
          entire job is bypassing that navigation.

          Each shell now owns its own landmark and skip link, positioned so the
          target is genuinely past the chrome: EnterpriseShell, MarketingShell
          and AuthShell.
        */}
        <MockWorkerInit>
          <GlobalErrorBoundary>
            <FlagProvider>
              <ToastProvider>{children}</ToastProvider>
            </FlagProvider>
          </GlobalErrorBoundary>
        </MockWorkerInit>
      </body>
    </html>
  );
}
