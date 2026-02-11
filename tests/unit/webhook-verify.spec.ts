/**
 * @jest-environment node
 * 
 * Tests for lib/webhook-verify.js
 * Webhook signature verification for Blink/Svix webhooks
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeCrypto = require("crypto") as typeof import("crypto")

// Import the module
// eslint-disable-next-line @typescript-eslint/no-require-imports
const webhookVerify = require("../../lib/webhook-verify.js")

const { verifyWebhookSignature, verifyWebhookSignatureRaw, WEBHOOK_TOLERANCE_SECONDS } = webhookVerify

// Helper to create a valid signature
function createSignature(secret: string, svixId: string, timestamp: string, payload: string): string {
  const secretBytes = secret.startsWith("whsec_")
    ? Buffer.from(secret.substring(6), "base64")
    : Buffer.from(secret, "base64")
  
  const signedContent = `${svixId}.${timestamp}.${payload}`
  const signature = nodeCrypto
    .createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64")
  
  return `v1,${signature}`
}

describe("lib/webhook-verify.js", () => {
  // Test secret (base64 encoded)
  const testSecret = "whsec_" + Buffer.from("test-secret-key-123").toString("base64")
  const testSecretWithoutPrefix = Buffer.from("test-secret-key-123").toString("base64")
  
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {})
    jest.spyOn(console, "warn").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe("WEBHOOK_TOLERANCE_SECONDS", () => {
    it("should be 300 seconds (5 minutes)", () => {
      expect(WEBHOOK_TOLERANCE_SECONDS).toBe(300)
    })
  })

  describe("verifyWebhookSignature()", () => {
    const testPayload = { event: "payment.received", amount: 1000 }
    const testPayloadStr = JSON.stringify(testPayload)

    describe("valid signatures", () => {
      it("should return true for valid signature", () => {
        const now = Math.floor(Date.now() / 1000).toString()
        const svixId = "msg_test123"
        const signature = createSignature(testSecret, svixId, now, testPayloadStr)

        const req = {
          headers: {
            "svix-id": svixId,
            "svix-timestamp": now,
            "svix-signature": signature,
          },
          body: testPayload,
        }

        expect(verifyWebhookSignature(req, testSecret)).toBe(true)
      })

      it("should work with secret without whsec_ prefix", () => {
        const now = Math.floor(Date.now() / 1000).toString()
        const svixId = "msg_test456"
        const signature = createSignature(testSecretWithoutPrefix, svixId, now, testPayloadStr)

        const req = {
          headers: {
            "svix-id": svixId,
            "svix-timestamp": now,
            "svix-signature": signature,
          },
          body: testPayload,
        }

        expect(verifyWebhookSignature(req, testSecretWithoutPrefix)).toBe(true)
      })

      it("should work with string body", () => {
        const now = Math.floor(Date.now() / 1000).toString()
        const svixId = "msg_stringbody"
        const signature = createSignature(testSecret, svixId, now, testPayloadStr)

        const req = {
          headers: {
            "svix-id": svixId,
            "svix-timestamp": now,
            "svix-signature": signature,
          },
          body: testPayloadStr, // String instead of object
        }

        expect(verifyWebhookSignature(req, testSecret)).toBe(true)
      })

      it("should work with multiple signatures (key rotation)", () => {
        const now = Math.floor(Date.now() / 1000).toString()
        const svixId = "msg_multi"
        const validSignature = createSignature(testSecret, svixId, now, testPayloadStr)
        const invalidSignature = "v1,invalidbase64signature="
        
        // Multiple signatures separated by space
        const multiSignature = `${invalidSignature} ${validSignature}`

        const req = {
          headers: {
            "svix-id": svixId,
            "svix-timestamp": now,
            "svix-signature": multiSignature,
          },
          body: testPayload,
        }

        expect(verifyWebhookSignature(req, testSecret)).toBe(true)
      })
    })

    describe("missing headers", () => {
      it("should return false when svix-id is missing", () => {
        const now = Math.floor(Date.now() / 1000).toString()

        const req = {
          headers: {
            "svix-timestamp": now,
            "svix-signature": "v1,test",
          },
          body: testPayload,
        }

        expect(verifyWebhookSignature(req, testSecret)).toBe(false)
        expect(console.error).toHaveBeenCalledWith(
          "[Webhook Verify] Missing required Svix headers:",
          expect.any(Object)
        )
      })

      it("should return false when svix-timestamp is missing", () => {
        const req = {
          headers: {
            "svix-id": "msg_test",
            "svix-signature": "v1,test",
          },
          body: testPayload,
        }

        expect(verifyWebhookSignature(req, testSecret)).toBe(false)
      })

      it("should return false when svix-signature is missing", () => {
        const now = Math.floor(Date.now() / 1000).toString()

        const req = {
          headers: {
            "svix-id": "msg_test",
            "svix-timestamp": now,
          },
          body: testPayload,
        }

        expect(verifyWebhookSignature(req, testSecret)).toBe(false)
      })
    })

    describe("timestamp validation", () => {
      it("should return false for invalid timestamp format", () => {
        const req = {
          headers: {
            "svix-id": "msg_test",
            "svix-timestamp": "not-a-number",
            "svix-signature": "v1,test",
          },
          body: testPayload,
        }

        expect(verifyWebhookSignature(req, testSecret)).toBe(false)
        expect(console.error).toHaveBeenCalledWith(
          "[Webhook Verify] Invalid timestamp format:",
          "not-a-number"
        )
      })

      it("should return false for timestamp too old", () => {
        const oldTimestamp = (Math.floor(Date.now() / 1000) - WEBHOOK_TOLERANCE_SECONDS - 60).toString()
        const svixId = "msg_old"
        const signature = createSignature(testSecret, svixId, oldTimestamp, testPayloadStr)

        const req = {
          headers: {
            "svix-id": svixId,
            "svix-timestamp": oldTimestamp,
            "svix-signature": signature,
          },
          body: testPayload,
        }

        expect(verifyWebhookSignature(req, testSecret)).toBe(false)
        expect(console.error).toHaveBeenCalledWith(
          "[Webhook Verify] Timestamp outside tolerance:",
          expect.objectContaining({
            tolerance: WEBHOOK_TOLERANCE_SECONDS,
          })
        )
      })

      it("should return false for timestamp in the future", () => {
        const futureTimestamp = (Math.floor(Date.now() / 1000) + WEBHOOK_TOLERANCE_SECONDS + 60).toString()
        const svixId = "msg_future"
        const signature = createSignature(testSecret, svixId, futureTimestamp, testPayloadStr)

        const req = {
          headers: {
            "svix-id": svixId,
            "svix-timestamp": futureTimestamp,
            "svix-signature": signature,
          },
          body: testPayload,
        }

        expect(verifyWebhookSignature(req, testSecret)).toBe(false)
      })

      it("should accept timestamp within tolerance", () => {
        // Timestamp at the edge of tolerance (just within)
        const edgeTimestamp = (Math.floor(Date.now() / 1000) - WEBHOOK_TOLERANCE_SECONDS + 10).toString()
        const svixId = "msg_edge"
        const signature = createSignature(testSecret, svixId, edgeTimestamp, testPayloadStr)

        const req = {
          headers: {
            "svix-id": svixId,
            "svix-timestamp": edgeTimestamp,
            "svix-signature": signature,
          },
          body: testPayload,
        }

        expect(verifyWebhookSignature(req, testSecret)).toBe(true)
      })
    })

    describe("signature validation", () => {
      it("should return false for invalid signature", () => {
        const now = Math.floor(Date.now() / 1000).toString()

        const req = {
          headers: {
            "svix-id": "msg_test",
            "svix-timestamp": now,
            "svix-signature": "v1,invalidSignature=",
          },
          body: testPayload,
        }

        expect(verifyWebhookSignature(req, testSecret)).toBe(false)
        expect(console.error).toHaveBeenCalledWith(
          "[Webhook Verify] No valid signature found"
        )
      })

      it("should warn for unknown signature version", () => {
        const now = Math.floor(Date.now() / 1000).toString()
        const validSignature = createSignature(testSecret, "msg_test", now, testPayloadStr)

        const req = {
          headers: {
            "svix-id": "msg_test",
            "svix-timestamp": now,
            "svix-signature": `v2,someSignature ${validSignature}`, // v2 is unknown
          },
          body: testPayload,
        }

        expect(verifyWebhookSignature(req, testSecret)).toBe(true)
        expect(console.warn).toHaveBeenCalledWith(
          "[Webhook Verify] Unknown signature version:",
          "v2"
        )
      })

      it("should return false for wrong secret", () => {
        const now = Math.floor(Date.now() / 1000).toString()
        const svixId = "msg_wrongsecret"
        const signature = createSignature(testSecret, svixId, now, testPayloadStr)

        const req = {
          headers: {
            "svix-id": svixId,
            "svix-timestamp": now,
            "svix-signature": signature,
          },
          body: testPayload,
        }

        const wrongSecret = "whsec_" + Buffer.from("wrong-secret").toString("base64")
        expect(verifyWebhookSignature(req, wrongSecret)).toBe(false)
      })

      it("should return false for tampered payload", () => {
        const now = Math.floor(Date.now() / 1000).toString()
        const svixId = "msg_tampered"
        const signature = createSignature(testSecret, svixId, now, testPayloadStr)

        const req = {
          headers: {
            "svix-id": svixId,
            "svix-timestamp": now,
            "svix-signature": signature,
          },
          body: { event: "payment.received", amount: 9999 }, // Different amount!
        }

        expect(verifyWebhookSignature(req, testSecret)).toBe(false)
      })
    })
  })

  describe("verifyWebhookSignatureRaw()", () => {
    const testPayload = { event: "payment.received", amount: 1000 }
    const testPayloadStr = JSON.stringify(testPayload)

    describe("valid signatures", () => {
      it("should return true for valid signature with string body", () => {
        const now = Math.floor(Date.now() / 1000).toString()
        const svixId = "msg_raw1"
        const signature = createSignature(testSecret, svixId, now, testPayloadStr)

        const headers = {
          "svix-id": svixId,
          "svix-timestamp": now,
          "svix-signature": signature,
        }

        expect(verifyWebhookSignatureRaw(testPayloadStr, headers, testSecret)).toBe(true)
      })

      it("should return true for valid signature with Buffer body", () => {
        const now = Math.floor(Date.now() / 1000).toString()
        const svixId = "msg_rawbuffer"
        const signature = createSignature(testSecret, svixId, now, testPayloadStr)

        const headers = {
          "svix-id": svixId,
          "svix-timestamp": now,
          "svix-signature": signature,
        }

        const bufferBody = Buffer.from(testPayloadStr, "utf8")
        expect(verifyWebhookSignatureRaw(bufferBody, headers, testSecret)).toBe(true)
      })
    })

    describe("missing headers", () => {
      it("should return false when headers are missing", () => {
        const headers = {
          "svix-timestamp": "12345",
          "svix-signature": "v1,test",
        }

        expect(verifyWebhookSignatureRaw(testPayloadStr, headers, testSecret)).toBe(false)
        expect(console.error).toHaveBeenCalledWith(
          "[Webhook Verify] Missing required Svix headers"
        )
      })
    })

    describe("timestamp validation", () => {
      it("should return false for invalid/expired timestamp", () => {
        const oldTimestamp = (Math.floor(Date.now() / 1000) - 1000).toString()

        const headers = {
          "svix-id": "msg_expired",
          "svix-timestamp": oldTimestamp,
          "svix-signature": "v1,test",
        }

        expect(verifyWebhookSignatureRaw(testPayloadStr, headers, testSecret)).toBe(false)
        expect(console.error).toHaveBeenCalledWith(
          "[Webhook Verify] Timestamp invalid or expired"
        )
      })

      it("should return false for NaN timestamp", () => {
        const headers = {
          "svix-id": "msg_nan",
          "svix-timestamp": "invalid",
          "svix-signature": "v1,test",
        }

        expect(verifyWebhookSignatureRaw(testPayloadStr, headers, testSecret)).toBe(false)
      })
    })

    describe("signature validation", () => {
      it("should return false for invalid signature", () => {
        const now = Math.floor(Date.now() / 1000).toString()

        const headers = {
          "svix-id": "msg_invalid",
          "svix-timestamp": now,
          "svix-signature": "v1,invalidbase64",
        }

        expect(verifyWebhookSignatureRaw(testPayloadStr, headers, testSecret)).toBe(false)
      })

      it("should skip non-v1 signatures", () => {
        const now = Math.floor(Date.now() / 1000).toString()
        const svixId = "msg_v2only"
        const validSignature = createSignature(testSecret, svixId, now, testPayloadStr)

        const headers = {
          "svix-id": svixId,
          "svix-timestamp": now,
          "svix-signature": `v2,somesig ${validSignature}`,
        }

        // Should still pass because v1 signature is valid
        expect(verifyWebhookSignatureRaw(testPayloadStr, headers, testSecret)).toBe(true)
      })

      it("should handle secret with and without whsec_ prefix", () => {
        const now = Math.floor(Date.now() / 1000).toString()
        const svixId = "msg_prefixtest"
        const signature = createSignature(testSecretWithoutPrefix, svixId, now, testPayloadStr)

        const headers = {
          "svix-id": svixId,
          "svix-timestamp": now,
          "svix-signature": signature,
        }

        expect(verifyWebhookSignatureRaw(testPayloadStr, headers, testSecretWithoutPrefix)).toBe(true)
      })
    })

    describe("error handling", () => {
      it("should return false on any error", () => {
        // Pass null which will cause an error
        expect(verifyWebhookSignatureRaw(null as unknown as string, {}, testSecret)).toBe(false)
        expect(console.error).toHaveBeenCalled()
      })
    })
  })

  describe("Signature computation", () => {
    it("should correctly compute HMAC-SHA256 signature", () => {
      // Known test vector
      const secret = "whsec_" + Buffer.from("my-secret").toString("base64")
      const svixId = "msg_2Jf3p4sFvH9b"
      const timestamp = "1640000000"
      const payload = '{"test":"data"}'
      
      const expectedSignedContent = `${svixId}.${timestamp}.${payload}`
      const secretBytes = Buffer.from("my-secret")
      const expectedSig = nodeCrypto
        .createHmac("sha256", secretBytes)
        .update(expectedSignedContent)
        .digest("base64")

      const req = {
        headers: {
          "svix-id": svixId,
          "svix-timestamp": timestamp,
          "svix-signature": `v1,${expectedSig}`,
        },
        body: payload,
      }

      // Freeze time to match the timestamp
      const realDateNow = Date.now
      Date.now = jest.fn(() => 1640000000 * 1000)

      expect(verifyWebhookSignature(req, secret)).toBe(true)

      Date.now = realDateNow
    })
  })
})
