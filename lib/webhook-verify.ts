/**
 * Webhook Signature Verification for Blink/Svix Webhooks
 *
 * Blink uses Svix for webhook delivery. Svix uses HMAC-SHA256 signatures
 * to verify webhook authenticity.
 *
 * Headers sent by Svix:
 * - svix-id: Unique message identifier
 * - svix-timestamp: Unix timestamp when the webhook was sent
 * - svix-signature: HMAC signature(s) of the payload
 *
 * @see https://docs.svix.com/receiving/verifying-payloads/how
 */

import crypto from "crypto"
import type { NextApiRequest } from "next"

interface WebhookHeaders {
  "svix-id"?: string
  "svix-timestamp"?: string
  "svix-signature"?: string
  [key: string]: string | string[] | undefined
}

// Maximum age of a webhook in seconds (5 minutes)
const WEBHOOK_TOLERANCE_SECONDS: number = 300

/**
 * Verify the Svix webhook signature
 *
 * @param req - Next.js API request object
 * @param secret - Webhook signing secret (from Blink Dashboard)
 * @returns True if signature is valid
 */
function verifyWebhookSignature(req: NextApiRequest, secret: string): boolean {
  try {
    const svixId: string | string[] | undefined = req.headers["svix-id"]
    const svixTimestamp: string | string[] | undefined = req.headers["svix-timestamp"]
    const svixSignature: string | string[] | undefined = req.headers["svix-signature"]

    // All headers are required
    if (!svixId || !svixTimestamp || !svixSignature) {
      console.error("[Webhook Verify] Missing required Svix headers:", {
        hasSvixId: !!svixId,
        hasSvixTimestamp: !!svixTimestamp,
        hasSvixSignature: !!svixSignature,
      })
      return false
    }

    // Ensure we have string values (not arrays)
    const svixIdStr: string = Array.isArray(svixId) ? svixId[0] : svixId
    const svixTimestampStr: string = Array.isArray(svixTimestamp)
      ? svixTimestamp[0]
      : svixTimestamp
    const svixSignatureStr: string = Array.isArray(svixSignature)
      ? svixSignature[0]
      : svixSignature

    // Verify timestamp is within tolerance
    const timestampSeconds: number = parseInt(svixTimestampStr, 10)
    const now: number = Math.floor(Date.now() / 1000)

    if (isNaN(timestampSeconds)) {
      console.error("[Webhook Verify] Invalid timestamp format:", svixTimestampStr)
      return false
    }

    if (Math.abs(now - timestampSeconds) > WEBHOOK_TOLERANCE_SECONDS) {
      console.error("[Webhook Verify] Timestamp outside tolerance:", {
        webhookTime: timestampSeconds,
        serverTime: now,
        difference: Math.abs(now - timestampSeconds),
        tolerance: WEBHOOK_TOLERANCE_SECONDS,
      })
      return false
    }

    // Get the raw body as a string
    // Note: Next.js parses JSON automatically, so we need to stringify it back
    const payload: string =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body)

    // Construct the signed content
    // Format: {svix-id}.{svix-timestamp}.{body}
    const signedContent: string = `${svixIdStr}.${svixTimestampStr}.${payload}`

    // The secret may have a 'whsec_' prefix that needs to be removed
    const secretBytes: Buffer = secret.startsWith("whsec_")
      ? Buffer.from(secret.substring(6), "base64")
      : Buffer.from(secret, "base64")

    // Calculate expected signature
    const expectedSignature: string = crypto
      .createHmac("sha256", secretBytes)
      .update(signedContent)
      .digest("base64")

    // Svix may send multiple signatures (for key rotation)
    // Format: v1,{sig1} v1,{sig2} ...
    const signatures: string[] = svixSignatureStr.split(" ")

    for (const versionedSignature of signatures) {
      const [version, signature] = versionedSignature.split(",")

      if (version !== "v1") {
        console.warn("[Webhook Verify] Unknown signature version:", version)
        continue
      }

      // Use timing-safe comparison
      try {
        const signatureBuffer: Buffer = Buffer.from(signature, "base64")
        const expectedBuffer: Buffer = Buffer.from(expectedSignature, "base64")

        if (
          signatureBuffer.length === expectedBuffer.length &&
          crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
        ) {
          return true
        }
      } catch (comparisonError: unknown) {
        // Buffer length mismatch or other error
        continue
      }
    }

    console.error("[Webhook Verify] No valid signature found")
    return false
  } catch (err: unknown) {
    console.error("[Webhook Verify] Verification error:", err)
    return false
  }
}

/**
 * Verify webhook with raw body (for when body parsing is disabled)
 *
 * @param rawBody - Raw request body
 * @param headers - Request headers
 * @param secret - Webhook signing secret
 * @returns True if signature is valid
 */
function verifyWebhookSignatureRaw(
  rawBody: Buffer | string,
  headers: WebhookHeaders,
  secret: string,
): boolean {
  try {
    const svixId: string | string[] | undefined = headers["svix-id"]
    const svixTimestamp: string | string[] | undefined = headers["svix-timestamp"]
    const svixSignature: string | string[] | undefined = headers["svix-signature"]

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.error("[Webhook Verify] Missing required Svix headers")
      return false
    }

    // Ensure we have string values (not arrays)
    const svixIdStr: string = Array.isArray(svixId) ? svixId[0] : svixId
    const svixTimestampStr: string = Array.isArray(svixTimestamp)
      ? svixTimestamp[0]
      : svixTimestamp
    const svixSignatureStr: string = Array.isArray(svixSignature)
      ? svixSignature[0]
      : svixSignature

    // Verify timestamp
    const timestampSeconds: number = parseInt(svixTimestampStr, 10)
    const now: number = Math.floor(Date.now() / 1000)

    if (
      isNaN(timestampSeconds) ||
      Math.abs(now - timestampSeconds) > WEBHOOK_TOLERANCE_SECONDS
    ) {
      console.error("[Webhook Verify] Timestamp invalid or expired")
      return false
    }

    // Get payload as string
    const payload: string = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody

    // Construct signed content
    const signedContent: string = `${svixIdStr}.${svixTimestampStr}.${payload}`

    // Decode secret
    const secretBytes: Buffer = secret.startsWith("whsec_")
      ? Buffer.from(secret.substring(6), "base64")
      : Buffer.from(secret, "base64")

    // Calculate expected signature
    const expectedSignature: string = crypto
      .createHmac("sha256", secretBytes)
      .update(signedContent)
      .digest("base64")

    // Check each signature
    const signatures: string[] = svixSignatureStr.split(" ")

    for (const versionedSignature of signatures) {
      const [version, signature] = versionedSignature.split(",")

      if (version !== "v1") continue

      try {
        const signatureBuffer: Buffer = Buffer.from(signature, "base64")
        const expectedBuffer: Buffer = Buffer.from(expectedSignature, "base64")

        if (
          signatureBuffer.length === expectedBuffer.length &&
          crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
        ) {
          return true
        }
      } catch (_err: unknown) {
        continue
      }
    }

    return false
  } catch (err: unknown) {
    console.error("[Webhook Verify] Raw verification error:", err)
    return false
  }
}

export { verifyWebhookSignature, verifyWebhookSignatureRaw, WEBHOOK_TOLERANCE_SECONDS }

export type { WebhookHeaders }
