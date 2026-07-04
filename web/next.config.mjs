/** @type {import('next').NextConfig} */
const nextConfig = {
  // ESLint is run separately in CI — skip during build to avoid plugin resolution
  // issues with Node 24 + eslint-plugin-react's es-abstract peer dep.
  eslint: { ignoreDuringBuilds: true },

  // Standalone output for container/CDN deployments
  output: "standalone",

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
        ? "https://finder-pos-backend.vercel.app"
        : "http://localhost:3001");
    return [
      { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },
      { source: "/healthz", destination: `${backendUrl}/healthz` },
      { source: "/readyz", destination: `${backendUrl}/readyz` },
    ];
  },
};

export default nextConfig;
