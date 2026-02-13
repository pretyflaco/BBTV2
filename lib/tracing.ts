/**
 * Tracing helpers for custom OpenTelemetry spans
 *
 * Wraps @opentelemetry/api to provide:
 * - Named tracers for different subsystems (payments, blink-api, storage)
 * - A `withSpan` helper that creates a span, records exceptions on error,
 *   sets the span status, and ensures the span is always ended.
 *
 * Usage:
 *   import { getTracer, withSpan } from "@/lib/tracing"
 *
 *   const tracer = getTracer("bbt-payment")
 *
 *   // Automatic span lifecycle management:
 *   const result = await withSpan(tracer, "payment.forward-tips", async (span) => {
 *     span.setAttribute("payment.hash", hash)
 *     return await forwardTips(...)
 *   })
 *
 * @module lib/tracing
 */

import {
  trace,
  context,
  propagation,
  SpanStatusCode,
  type Tracer,
  type Span,
  type SpanOptions,
} from "@opentelemetry/api"

/**
 * Get or create a named tracer.
 *
 * Convention: use "bbt-<subsystem>" names, e.g.:
 * - "bbt-payment"   — invoice creation, forwarding, webhook processing
 * - "bbt-blink-api" — outbound calls to Blink GraphQL API
 * - "bbt-storage"   — Redis/PostgreSQL storage operations
 */
export function getTracer(name: string): Tracer {
  return trace.getTracer(name)
}

/**
 * Execute `fn` inside a new span. The span is:
 * - Automatically ended when `fn` resolves or rejects
 * - Marked ERROR with the exception recorded if `fn` throws
 * - Marked OK if `fn` succeeds
 *
 * @returns The return value of `fn`
 */
export async function withSpan<T>(
  tracer: Tracer,
  spanName: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions,
): Promise<T> {
  return tracer.startActiveSpan(spanName, options ?? {}, async (span) => {
    try {
      const result = await fn(span)
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR })
      if (error instanceof Error) {
        span.recordException(error)
      } else {
        span.recordException(new Error(String(error)))
      }
      throw error
    } finally {
      span.end()
    }
  })
}

/**
 * Inject W3C Trace Context headers into an outbound request headers object.
 * Use this when making HTTP calls to Blink core API so traces propagate
 * across service boundaries.
 *
 * @param headers — mutable headers object; traceparent/tracestate are injected in place
 * @returns The same headers object (for chaining)
 */
export function injectTraceHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  propagation.inject(context.active(), headers)
  return headers
}

/**
 * Get the trace ID from the currently active span, or undefined if
 * no span is active. Useful for including in log messages or response headers.
 */
export function getActiveTraceId(): string | undefined {
  const span = trace.getActiveSpan()
  if (!span) return undefined
  const ctx = span.spanContext()
  // A zero trace ID means no valid trace context
  if (ctx.traceId === "00000000000000000000000000000000") return undefined
  return ctx.traceId
}

/**
 * Get the span ID from the currently active span.
 */
export function getActiveSpanId(): string | undefined {
  const span = trace.getActiveSpan()
  if (!span) return undefined
  const ctx = span.spanContext()
  if (ctx.spanId === "0000000000000000") return undefined
  return ctx.spanId
}
