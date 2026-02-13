/**
 * Structured logging with Pino
 *
 * Aligned with blink/apps/pay convention: pino@8.20.0, baseLogger singleton.
 * Use `baseLogger.child({ module: "name" })` for per-module context.
 *
 * @see https://github.com/GaloyMoney/blink/blob/main/apps/pay/lib/logger.ts
 * @module lib/logger
 */

import pino from "pino"

export const baseLogger = pino({
  level: process.env.LOGLEVEL ?? "info",
  browser: { asObject: true },
})
