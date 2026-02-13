/**
 * Standardized API response envelope helpers
 *
 * Provides consistent response shapes across all API routes:
 *   { success: true, data: ... }
 *   { success: false, error: "...", code?: "...", details?: ... }
 *
 * Usage:
 *   import { apiSuccess, apiError } from "../../../lib/api-response"
 *   return apiSuccess(res, { invoice })
 *   return apiError(res, 400, "Invalid amount", "INVALID_AMOUNT")
 *
 * @module lib/api-response
 */

import type { NextApiResponse } from "next"

// ---------------------------------------------------------------------------
// Success
// ---------------------------------------------------------------------------

/**
 * Send a successful JSON response.
 *
 * @param res  Next.js response object
 * @param data Payload to include under `data`
 * @param statusCode HTTP status (default 200)
 */
export function apiSuccess<T>(res: NextApiResponse, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, data })
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

interface ApiErrorOptions {
  /** Machine-readable error code (e.g. "RATE_LIMIT_EXCEEDED"). */
  code?: string
  /** Additional context (shown only in development). */
  details?: unknown
}

/**
 * Send a JSON error response.
 *
 * @param res        Next.js response object
 * @param statusCode HTTP status code
 * @param message    Human-readable error message
 * @param opts       Optional code & details
 */
export function apiError(
  res: NextApiResponse,
  statusCode: number,
  message: string,
  opts: ApiErrorOptions = {},
): void {
  const body: Record<string, unknown> = {
    success: false,
    error: message,
  }

  if (opts.code) {
    body.code = opts.code
  }

  if (opts.details && process.env.NODE_ENV === "development") {
    body.details = opts.details
  }

  res.status(statusCode).json(body)
}

// ---------------------------------------------------------------------------
// Method guard
// ---------------------------------------------------------------------------

/**
 * Return 405 if the request method is not in the allowed list.
 * Returns `true` if the method is allowed, `false` if a 405 was sent.
 */
export function requireMethod(
  res: NextApiResponse,
  method: string | undefined,
  allowed: string[],
): boolean {
  if (method && allowed.includes(method)) {
    return true
  }
  res.setHeader("Allow", allowed.join(", "))
  apiError(res, 405, "Method not allowed", { code: "METHOD_NOT_ALLOWED" })
  return false
}
