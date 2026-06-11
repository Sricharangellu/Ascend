import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for container/CDN deployments
  output: "standalone",

  // Strict mode for React
  reactStrictMode: true,

  // Allow the API base URL to be configured via env
  env: {
    NEXT_PUBLIC_API_BASE_URL:
      process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1",
  },

  // Forward /api/v1/* to the backend during local dev
  async rewrites() {
    const backendUrl =
      process.env.BACKEND_URL ?? "http://localhost:3001";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
