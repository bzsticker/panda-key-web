import type { NextConfig } from "next";
import { setupDevPlatform } from '@cloudflare/next-on-pages/next-dev';

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    proxyClientMaxBodySize: '150mb',
  },
};

if (process.env.NODE_ENV === 'development') {
  (async () => {
    await setupDevPlatform();
  })().catch(err => {
    console.error('Error setting up Cloudflare dev platform:', err);
  });
}


export default nextConfig;

