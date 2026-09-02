import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  async redirects() {
    // Short URLs for the newspaper side tools.
    return [
      { source: '/export', destination: '/newspaper/export', permanent: false },
      { source: '/people', destination: '/newspaper/people', permanent: false },
    ]
  },
  cacheLife: {
    // Custom profile for OpenClaw - 24 hour revalidation
    daily: {
      stale: 60 * 60, // 1 hour - serve stale while revalidating
      revalidate: 60 * 60 * 24, // 24 hours
      expire: 60 * 60 * 24 * 7, // 1 week max
    },
    // 12 hour profile for more frequent updates
    halfDaily: {
      stale: 60 * 30, // 30 minutes
      revalidate: 60 * 60 * 12, // 12 hours  
      expire: 60 * 60 * 24 * 3, // 3 days max
    },
  },
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
