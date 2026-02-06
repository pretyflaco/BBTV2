/** @type {import('next').NextConfig} */

// Get git commit hash at build time
const { execSync } = require('child_process');
let gitCommit = 'dev';
try {
  gitCommit = execSync('git rev-parse --short HEAD').toString().trim();
} catch (e) {
  // Fallback if git is not available (e.g., in Docker without .git)
  gitCommit = process.env.GIT_COMMIT || 'unknown';
}

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'standalone',
  // Inject git commit hash as environment variable
  env: {
    NEXT_PUBLIC_GIT_COMMIT: gitCommit,
  },
  // Enable ESM external resolution for pure ESM packages
  experimental: {
    esmExternals: 'loose',
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate'
          },
          {
            key: 'Pragma',
            value: 'no-cache'
          },
          {
            key: 'Expires',
            value: '0'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          }
        ]
      },
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate'
          },
          {
            key: 'Pragma',
            value: 'no-cache'
          }
        ]
      }
    ]
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    
    // Handle WebSocket modules properly
    config.externals = config.externals || [];
    if (isServer) {
      config.externals.push('ws');
    }
    
    return config;
  },
}

module.exports = nextConfig
