/**
 * Unit Tests for pure utility functions in lib/network/db.ts
 *
 * Tests parseTransactionTimestamp() and getDateRange() — both are pure
 * functions that don't require a database connection.
 *
 * We mock lib/db and lib/logger since they're imported at module level
 * by lib/network/db.ts (pg Pool, Pino logger).
 */

// Mock the shared pool module to avoid real PG connections
jest.mock("../../lib/db", () => ({
  getSharedPool: jest.fn(() => ({
    query: jest.fn(),
    connect: jest.fn(),
    on: jest.fn(),
  })),
  getClient: jest.fn(),
}))

// Mock the logger to avoid pino output in tests
jest.mock("../../lib/logger", () => ({
  baseLogger: {
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}))

import { parseTransactionTimestamp, getDateRange } from "../../lib/network/db"

// ---------------------------------------------------------------------------
// parseTransactionTimestamp()
// ---------------------------------------------------------------------------

describe("parseTransactionTimestamp()", () => {
  it("should return null for null input", () => {
    expect(parseTransactionTimestamp(null)).toBeNull()
  })

  it("should return null for undefined input", () => {
    expect(parseTransactionTimestamp(undefined)).toBeNull()
  })

  it("should return null for 0 (falsy number)", () => {
    expect(parseTransactionTimestamp(0)).toBeNull()
  })

  it("should return the same Date object if already a Date", () => {
    const date = new Date("2024-06-15T12:00:00Z")
    const result = parseTransactionTimestamp(date)
    expect(result).toBe(date)
  })

  it("should convert Unix seconds (< 10 billion) to Date", () => {
    // 1700000000 = 2023-11-14T22:13:20Z
    const result = parseTransactionTimestamp(1700000000)
    expect(result).toBeInstanceOf(Date)
    expect(result!.getTime()).toBe(1700000000 * 1000)
  })

  it("should treat numbers >= 10 billion as milliseconds", () => {
    const ms = 1700000000000 // already milliseconds
    const result = parseTransactionTimestamp(ms)
    expect(result).toBeInstanceOf(Date)
    expect(result!.getTime()).toBe(ms)
  })

  it("should handle a small Unix timestamp (2020)", () => {
    // 1577836800 = 2020-01-01T00:00:00Z
    const result = parseTransactionTimestamp(1577836800)
    expect(result!.toISOString()).toBe("2020-01-01T00:00:00.000Z")
  })

  it("should parse an ISO 8601 string", () => {
    const iso = "2024-03-15T10:30:00.000Z"
    const result = parseTransactionTimestamp(iso)
    expect(result).toBeInstanceOf(Date)
    expect(result!.toISOString()).toBe(iso)
  })

  it("should parse a date-only string", () => {
    const result = parseTransactionTimestamp("2024-01-01")
    expect(result).toBeInstanceOf(Date)
    expect(result!.getFullYear()).toBe(2024)
  })

  it("should return an Invalid Date for garbage strings (not null)", () => {
    // new Date("not-a-date") returns Invalid Date, not null
    const result = parseTransactionTimestamp("not-a-date")
    expect(result).toBeInstanceOf(Date)
    expect(isNaN(result!.getTime())).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getDateRange()
// ---------------------------------------------------------------------------

describe("getDateRange()", () => {
  beforeEach(() => {
    // Fix "now" to Wednesday 2024-06-12 15:00:00 UTC for deterministic tests
    jest.useFakeTimers()
    jest.setSystemTime(new Date("2024-06-12T15:00:00Z"))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("should return a DateRange with start, end, and label", () => {
    const range = getDateRange("all")
    expect(range).toHaveProperty("start")
    expect(range).toHaveProperty("end")
    expect(range).toHaveProperty("label")
    expect(range.start).toBeInstanceOf(Date)
    expect(range.end).toBeInstanceOf(Date)
    expect(typeof range.label).toBe("string")
  })

  describe("current_week", () => {
    it("should start on Sunday of the current week", () => {
      const range = getDateRange("current_week")
      // 2024-06-12 is Wednesday, Sunday = June 9
      expect(range.start.getDate()).toBe(9)
      expect(range.start.getHours()).toBe(0)
      expect(range.start.getMinutes()).toBe(0)
      expect(range.label).toBe("This Week")
    })

    it("should end at the current time", () => {
      const range = getDateRange("current_week")
      // end should be close to "now"
      expect(range.end.getDate()).toBe(12)
    })
  })

  describe("last_week", () => {
    it("should span the previous full week (Sun-Sat)", () => {
      const range = getDateRange("last_week")
      // Current week starts Sunday June 9. Last week: June 2 – June 8
      expect(range.start.getDate()).toBe(2)
      expect(range.start.getHours()).toBe(0)
      expect(range.end.getDate()).toBe(8)
      expect(range.end.getHours()).toBe(23)
      expect(range.end.getMinutes()).toBe(59)
      expect(range.label).toBe("Last Week")
    })
  })

  describe("current_month", () => {
    it("should start on the 1st of the current month", () => {
      const range = getDateRange("current_month")
      expect(range.start.getDate()).toBe(1)
      expect(range.start.getMonth()).toBe(5) // June = 5 (0-indexed)
    })

    it("should end at the current time", () => {
      const range = getDateRange("current_month")
      expect(range.end.getDate()).toBe(12)
    })

    it("should include month name in label", () => {
      const range = getDateRange("current_month")
      expect(range.label).toContain("2024")
    })
  })

  describe("last_month", () => {
    it("should span the previous full month", () => {
      const range = getDateRange("last_month")
      // Last month = May 2024
      expect(range.start.getMonth()).toBe(4) // May = 4
      expect(range.start.getDate()).toBe(1)
      // End = last day of May = 31
      expect(range.end.getMonth()).toBe(4)
      expect(range.end.getDate()).toBe(31)
      expect(range.end.getHours()).toBe(23)
    })

    it("should include month name in label", () => {
      const range = getDateRange("last_month")
      expect(range.label).toContain("2024")
    })
  })

  describe("all", () => {
    it("should start from 2020-01-01", () => {
      const range = getDateRange("all")
      expect(range.start.getFullYear()).toBe(2020)
      expect(range.start.getMonth()).toBe(0)
      expect(range.start.getDate()).toBe(1)
      expect(range.label).toBe("All Time")
    })
  })

  describe("unknown period (default)", () => {
    it("should fall through to the 'all' case", () => {
      const range = getDateRange("unknown_period")
      expect(range.start.getFullYear()).toBe(2020)
      expect(range.label).toBe("All Time")
    })
  })

  it("should always have start <= end", () => {
    const periods = ["current_week", "last_week", "current_month", "last_month", "all"]
    for (const period of periods) {
      const range = getDateRange(period)
      expect(range.start.getTime()).toBeLessThanOrEqual(range.end.getTime())
    }
  })
})
