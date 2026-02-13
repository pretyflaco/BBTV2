/**
 * Structured logging with Pino + OpenTelemetry trace context
 *
 * Aligned with blink/apps/pay convention: pino@8.20.0, baseLogger singleton.
 * Use `baseLogger.child({ module: "name" })` for per-module context.
 *
 * The OTEL mixin automatically injects `traceId` and `spanId` from the
 * active OpenTelemetry span into every log record, enabling log-to-trace
 * correlation in Jaeger / Grafana / any OTLP-compatible backend.
 *
 * @see https://github.com/GaloyMoney/blink/blob/main/apps/pay/lib/logger.ts
 * @module lib/logger
 */

import pino from "pino"

import { getActiveTraceId, getActiveSpanId } from "./tracing"

export const baseLogger = pino({
  level: process.env.LOGLEVEL ?? "info",
  browser: { asObject: true },
  mixin() {
    const traceId = getActiveTraceId()
    const spanId = getActiveSpanId()
    if (traceId) {
      return { traceId, ...(spanId ? { spanId } : {}) }
    }
    return {}
  },
})
