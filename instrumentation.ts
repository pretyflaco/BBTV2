/**
 * Next.js instrumentation hook
 *
 * Called once when a new Next.js server instance is created.
 * Delegates to `instrumentation.node.ts` for the Node.js runtime
 * (skips Edge runtime).
 *
 * Aligned with blink/apps/pay convention.
 * @see https://github.com/GaloyMoney/blink/blob/main/apps/pay/instrumentation.ts
 * @see https://nextjs.org/docs/pages/building-your-application/optimizing/instrumentation
 *
 * @module instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation.node")
  }
}
