import type { NextConfig } from "next";

// BACKEND_URL_INTERNAL: server-side URL used by Next.js rewrites (not exposed to browser).
// - Development (lokal): tidak perlu di-set, fallback ke http://localhost:5001.
// - Docker: di-set ke http://backend:5001 (nama service di docker-compose).
const BACKEND_INTERNAL =
  process.env.BACKEND_URL_INTERNAL ?? "http://localhost:5001";

const nextConfig: NextConfig = {
  // standalone output diperlukan untuk Docker multi-stage build.
  // Output berupa server.js + minimal deps, bukan full node_modules.
  output: "standalone",

  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "5001",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "5001",
        pathname: "/**",
      },
    ],
  },

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_INTERNAL}/api/:path*`,
      },
      {
        source: "/video_feed",
        destination: `${BACKEND_INTERNAL}/video_feed`,
      },
    ];
  },
};

export default nextConfig;
