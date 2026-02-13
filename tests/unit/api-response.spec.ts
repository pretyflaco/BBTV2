/**
 * Unit Tests for lib/api-response.ts
 *
 * Tests apiSuccess, apiError, and requireMethod helpers.
 */

import type { NextApiResponse } from "next"

import { apiSuccess, apiError, requireMethod } from "../../lib/api-response"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRes(): NextApiResponse & {
  _status: number | null
  _json: unknown
  _headers: Record<string, string>
} {
  const res = {
    _status: null as number | null,
    _json: null as unknown,
    _headers: {} as Record<string, string>,
    status(code: number) {
      res._status = code
      return res
    },
    json(body: unknown) {
      res._json = body
      return res
    },
    setHeader(key: string, value: string) {
      res._headers[key] = value
      return res
    },
  }
  return res as unknown as NextApiResponse & {
    _status: number | null
    _json: unknown
    _headers: Record<string, string>
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("lib/api-response", () => {
  describe("apiSuccess()", () => {
    it("should return 200 with success envelope", () => {
      const res = mockRes()
      apiSuccess(res, { invoice: "lnbc123" })

      expect(res._status).toBe(200)
      expect(res._json).toEqual({
        success: true,
        data: { invoice: "lnbc123" },
      })
    })

    it("should accept a custom status code", () => {
      const res = mockRes()
      apiSuccess(res, { id: 1 }, 201)

      expect(res._status).toBe(201)
      expect(res._json).toEqual({
        success: true,
        data: { id: 1 },
      })
    })

    it("should wrap null data correctly", () => {
      const res = mockRes()
      apiSuccess(res, null)

      expect(res._json).toEqual({ success: true, data: null })
    })

    it("should wrap array data correctly", () => {
      const res = mockRes()
      apiSuccess(res, [1, 2, 3])

      expect(res._json).toEqual({ success: true, data: [1, 2, 3] })
    })
  })

  describe("apiError()", () => {
    it("should return error envelope with status code", () => {
      const res = mockRes()
      apiError(res, 400, "Invalid amount")

      expect(res._status).toBe(400)
      expect(res._json).toEqual({
        success: false,
        error: "Invalid amount",
      })
    })

    it("should include error code when provided", () => {
      const res = mockRes()
      apiError(res, 429, "Rate limited", { code: "RATE_LIMIT_EXCEEDED" })

      expect(res._json).toEqual({
        success: false,
        error: "Rate limited",
        code: "RATE_LIMIT_EXCEEDED",
      })
    })

    it("should include details in development mode", () => {
      const origEnv = process.env.NODE_ENV
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "development",
        writable: true,
        configurable: true,
      })

      const res = mockRes()
      apiError(res, 500, "Server error", {
        details: { stack: "Error at line 42" },
      })

      expect(res._json).toEqual({
        success: false,
        error: "Server error",
        details: { stack: "Error at line 42" },
      })

      Object.defineProperty(process.env, "NODE_ENV", {
        value: origEnv,
        writable: true,
        configurable: true,
      })
    })

    it("should omit details in production mode", () => {
      const origEnv = process.env.NODE_ENV
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "production",
        writable: true,
        configurable: true,
      })

      const res = mockRes()
      apiError(res, 500, "Server error", {
        details: { stack: "Error at line 42" },
      })

      expect(res._json).toEqual({
        success: false,
        error: "Server error",
      })

      Object.defineProperty(process.env, "NODE_ENV", {
        value: origEnv,
        writable: true,
        configurable: true,
      })
    })

    it("should handle 404 errors", () => {
      const res = mockRes()
      apiError(res, 404, "Not found", { code: "NOT_FOUND" })

      expect(res._status).toBe(404)
      expect(res._json).toEqual({
        success: false,
        error: "Not found",
        code: "NOT_FOUND",
      })
    })
  })

  describe("requireMethod()", () => {
    it("should return true for an allowed method", () => {
      const res = mockRes()
      const result = requireMethod(res, "POST", ["POST", "GET"])

      expect(result).toBe(true)
      expect(res._status).toBeNull()
    })

    it("should return false and send 405 for disallowed method", () => {
      const res = mockRes()
      const result = requireMethod(res, "DELETE", ["POST", "GET"])

      expect(result).toBe(false)
      expect(res._status).toBe(405)
      expect(res._json).toEqual({
        success: false,
        error: "Method not allowed",
        code: "METHOD_NOT_ALLOWED",
      })
      expect(res._headers["Allow"]).toBe("POST, GET")
    })

    it("should return false for undefined method", () => {
      const res = mockRes()
      const result = requireMethod(res, undefined, ["POST"])

      expect(result).toBe(false)
      expect(res._status).toBe(405)
    })

    it("should set the Allow header to all allowed methods", () => {
      const res = mockRes()
      requireMethod(res, "PUT", ["GET", "POST", "PATCH"])

      expect(res._headers["Allow"]).toBe("GET, POST, PATCH")
    })
  })
})
