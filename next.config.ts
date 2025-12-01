import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    localPatterns: [
      {
        pathname: '/api/image-proxy',
        search: '?url=*',
      },
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 's3.tradingview.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.tradingview.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
