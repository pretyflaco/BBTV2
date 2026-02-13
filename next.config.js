/** @type {import('next').NextConfig} */

// Get git commit hash at build time
const { execSync } = require("child_process")
let gitCommit = "dev"
try {
  gitCommit = execSync("git rev-parse --short HEAD").toString().trim()
} catch (e) {
  // Fallback if git is not available (e.g., in Docker without .git)
  gitCommit = process.env.GIT_COMMIT || "unknown"
}

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Inject git commit hash as environment variable
  env: {
    NEXT_PUBLIC_GIT_COMMIT: gitCommit,
  },
  async headers() {
    // Security headers applied to all routes
    const securityHeaders = [
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "X-Frame-Options",
        value: "DENY",
      },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(self), payment=()",
      },
      {
        // Start with Report-Only to identify violations without breaking functionality.
        // After validating in production, change to 'Content-Security-Policy' to enforce.
        key: "Content-Security-Policy-Report-Only",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          "img-src 'self' data: blob: https:",
          "connect-src 'self' https://api.blink.sv https://api.staging.blink.sv https://pay.blink.sv https://pay.staging.blink.sv wss://ws.blink.sv wss://ws.staging.blink.sv wss:",
          "frame-ancestors 'none'",
        ].join("; "),
      },
    ]

    // CORS headers for public LNURL/paycode endpoints (required by LNURL spec)
    const publicCorsHeaders = [
      {
        key: "Access-Control-Allow-Origin",
        value: "*",
      },
      {
        key: "Access-Control-Allow-Methods",
        value: "GET, OPTIONS",
      },
      {
        key: "Access-Control-Allow-Headers",
        value: "Content-Type",
      },
    ]

    return [
      // 1. Security headers on all routes
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // 2. Next.js static assets (content-hashed, safe to cache indefinitely)
      {
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // 3. Public static assets (images, icons, fonts, manifests)
      {
        source:
          "/:path(favicon\\.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.webp|.*\\.woff2?|.*\\.ttf|manifest\\.json|sw\\.js)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      // 4. API routes — never cache
      {
        source: "/api/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
        ],
      },
      // 5. Public LNURL endpoints — CORS required by LNURL spec (any wallet must be able to call)
      {
        source: "/api/lnurlp/:path*",
        headers: publicCorsHeaders,
      },
      {
        source: "/api/paycode/lnurlp/:path*",
        headers: publicCorsHeaders,
      },
      {
        source: "/api/.well-known/lnurlp/:path*",
        headers: publicCorsHeaders,
      },
      // 6. HTML pages — short cache with revalidation
      {
        source: "/:path((?!api|_next).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache",
          },
        ],
      },
    ]
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      }
    }

    // Handle WebSocket modules properly
    config.externals = config.externals || []
    if (isServer) {
      config.externals.push("ws")
    }

    return config
  },
}

module.exports = nextConfig
