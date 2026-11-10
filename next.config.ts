import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'playwright', 'playwright-core'],
  poweredByHeader: false,
  devIndicators: false,
};

export default nextConfig;
