import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/:path*`,
      },
      {
        source: "/api/yf/:path*",
        destination: "https://query1.finance.yahoo.com/:path*",
      },
    ];
  },
};

export default nextConfig;
