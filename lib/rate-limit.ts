/**
 * In-memory rate limiting for API endpoints.
 *
 * Provides a `withRateLimit` higher-order function that wraps any Next.js API
 * handler with per-IP sliding-window rate limiting.
 *
 * Tier presets:
 *   - AUTH        10 req/min  (login, challenge, verify)
 *   - PUBLIC      30 req/min  (public-invoice, lnurlp, lnurl-proxy)
 *   - WRITE       30 req/min  (create-invoice, pay-invoice, forward-*)
 *   - READ       120 req/min  (balance, wallets, transactions, exchange-rate)
 *
 * @module lib/rate-limit
 */

import type { NextApiRequest, NextApiResponse, NextApiHandler } from "next"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RateLimitRecord {
  count: number
  resetAt: number
}

interface RateLimitOptions {
  /** Maximum requests allowed in the window. */
  max: number
  /** Window duration in milliseconds (default: 60 000 — 1 minute). */
  windowMs?: number
}

// ---------------------------------------------------------------------------
// Tier presets
// ---------------------------------------------------------------------------

/** Auth endpoints — strict to prevent brute force. */
export const RATE_LIMIT_AUTH: RateLimitOptions = { max: 10 }

/** Public / unauthenticated endpoints. */
export const RATE_LIMIT_PUBLIC: RateLimitOptions = { max: 30 }

/** Authenticated write endpoints (create, pay, forward). */
export const RATE_LIMIT_WRITE: RateLimitOptions = { max: 30 }

/** Authenticated read endpoints (balance, wallets, transactions). */
export const RATE_LIMIT_READ: RateLimitOptions = { max: 120 }

// ---------------------------------------------------------------------------
// Internal store (per-IP, per-limiter instance)
// ---------------------------------------------------------------------------

const DEFAULT_WINDOW_MS = 60_000 // 1 minute

/**
 * Create a rate limiter bound to its own in-memory store.
 *
 * Each call returns a `check` function that tracks a separate counter
 * per client IP.  Using separate instances per route (or route group)
 * keeps limits isolated.
 */
function createRateLimiter(opts: RateLimitOptions) {
  const { max, windowMs = DEFAULT_WINDOW_MS } = opts
  const store = new Map<string, RateLimitRecord>()

  // Periodic cleanup — prevent unbounded memory growth.
  const cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [ip, record] of store.entries()) {
      if (now > record.resetAt) {
        store.delete(ip)
      }
    }
  }, windowMs)

  // Allow the process to exit even if the timer is still active.
  if (cleanupTimer.unref) {
    cleanupTimer.unref()
  }

  return {
    /**
     * Check whether `ip` is within the rate limit.
     * Returns `true` if allowed, `false` if the limit has been exceeded.
     */
    check(ip: string): boolean {
      const now = Date.now()
      const record = store.get(ip)

      if (!record || now > record.resetAt) {
        store.set(ip, { count: 1, resetAt: now + windowMs })
        return true
      }

      if (record.count >= max) {
        return false
      }

      record.count++
      return true
    },
  }
}

// ---------------------------------------------------------------------------
// Client IP extraction
// ---------------------------------------------------------------------------

function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers["x-forwarded-for"]
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim()
  }
  const realIp = req.headers["x-real-ip"]
  if (typeof realIp === "string") {
    return realIp.trim()
  }
  return req.socket?.remoteAddress || "unknown"
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Wrap a Next.js API handler with rate limiting.
 *
 * ```ts
 * import { withRateLimit, RATE_LIMIT_AUTH } from "../../../lib/rate-limit"
 *
 * function handler(req, res) { ... }
 * export default withRateLimit(handler, RATE_LIMIT_AUTH)
 * ```
 */
export function withRateLimit(
  handler: NextApiHandler,
  opts: RateLimitOptions,
): NextApiHandler {
  const limiter = createRateLimiter(opts)

  return async (req: NextApiRequest, res: NextApiResponse) => {
    const ip = getClientIp(req)

    if (!limiter.check(ip)) {
      return res.status(429).json({
        error: "Too many requests. Please wait a moment and try again.",
      })
    }

    return handler(req, res)
  }
}
