/** @type {import('next').NextConfig} */
const nextConfig = {
  // ESLint is run separately in CI — skip during build to avoid plugin resolution
  // issues with Node 24 + eslint-plugin-react's es-abstract peer dep.
  eslint: { ignoreDuringBuilds: true },

  // Standalone output for container/CDN deployments
  output: "standalone",

  // Node 24 can leave Next's separate webpack build worker idle forever on this
  // project. Build in-process so `next build` exits deterministically.
  experimental: { webpackBuildWorker: false },

  // Strict mode for React
  reactStrictMode: true,

  // Same-origin by default: the client calls absolute backend paths
  // (/api/identity/*, /api/v1/*, /healthz) on this origin, and the rewrites
  // below proxy them to the backend server-side — so there is no browser CORS.
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
    // MSW mock mode. Defaults ON (current deployments have no real backend);
    // set NEXT_PUBLIC_MOCK=false at build time to run against the real API
    // (required for e2e and any real-backend deployment).
    NEXT_PUBLIC_MOCK: process.env.NEXT_PUBLIC_MOCK ?? "true",
  },

  // Proxy all backend routes to BACKEND_URL (set per-env). Covers identity
  // (/api/identity/*), versioned business routes (/api/v1/*) and health probes.
  async rewrites() {
    const backendUrl =
      process.env.BACKEND_URL ??
      (process.env.VERCEL_ENV
        ? "https://ascendhq-api.vercel.app"
        : "http://localhost:3001");
    return [
      { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },
      { source: "/healthz", destination: `${backendUrl}/healthz` },
      { source: "/readyz", destination: `${backendUrl}/readyz` },
    ];
  },

  // Ponytail Wave 1 — permanent redirects for legacy / alias IA.
  // Keep thin page.tsx redirects too where Next needs them for typed routes.
  async redirects() {
    return [
      // Reports: /reporting was a full re-export twin of /reports
      { source: "/reporting", destination: "/reports", permanent: true },
      { source: "/reporting/closing", destination: "/reports/end-of-day", permanent: true },
      { source: "/reporting/:path*", destination: "/reports/:path*", permanent: true },
      // Sell aliases
      { source: "/sell", destination: "/terminal", permanent: true },
      { source: "/sales", destination: "/orders", permanent: true },
      // Finance aliases
      { source: "/finance/bills", destination: "/bills", permanent: true },
      { source: "/finance/settings", destination: "/settings", permanent: true },
      { source: "/finance/payment-made", destination: "/bills", permanent: true },
      // Setup duplicates of capabilities-driven Business Modes
      { source: "/setup/business-profile", destination: "/settings/modes", permanent: true },
      { source: "/setup/modules", destination: "/settings/modes", permanent: true },
      // Purchasing hub — standalone reorder page folds into Purchasing Reorder tab
      { source: "/inventory/reorder", destination: "/purchasing?tab=reorder", permanent: true },
      // Ecommerce: customers child was a misleading re-export of /customers
      { source: "/ecommerce/customers", destination: "/customers", permanent: true },
    ];
  },
};

export default nextConfig;
