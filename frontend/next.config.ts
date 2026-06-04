import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: 'http://localhost:8000/:path*',
      },
      {
        source: '/api/yf/:path*',
        destination: 'https://query1.finance.yahoo.com/:path*',
      },
    ];
  },
};

export default nextConfig;
