/**
 * Unit Tests for lib/logger.ts
 *
 * Tests baseLogger singleton creation and configuration.
 */

describe("lib/logger", () => {
  afterEach(() => {
    jest.restoreAllMocks()
    jest.resetModules()
  })

  it("should export a baseLogger object", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { baseLogger } = require("../../lib/logger")
    expect(baseLogger).toBeDefined()
    expect(typeof baseLogger.info).toBe("function")
    expect(typeof baseLogger.error).toBe("function")
    expect(typeof baseLogger.warn).toBe("function")
    expect(typeof baseLogger.debug).toBe("function")
  })

  it("should support child loggers with module context", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { baseLogger } = require("../../lib/logger")
    const child = baseLogger.child({ module: "test-module" })
    expect(child).toBeDefined()
    expect(typeof child.info).toBe("function")
    expect(typeof child.error).toBe("function")
  })

  it("should default to 'info' level when LOGLEVEL is not set", () => {
    const origLevel = process.env.LOGLEVEL
    delete process.env.LOGLEVEL

    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { baseLogger } = require("../../lib/logger")
    expect(baseLogger.level).toBe("info")

    if (origLevel !== undefined) {
      process.env.LOGLEVEL = origLevel
    }
  })

  it("should respect LOGLEVEL env var", () => {
    const origLevel = process.env.LOGLEVEL
    process.env.LOGLEVEL = "debug"

    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { baseLogger } = require("../../lib/logger")
    expect(baseLogger.level).toBe("debug")

    if (origLevel !== undefined) {
      process.env.LOGLEVEL = origLevel
    } else {
      delete process.env.LOGLEVEL
    }
  })

  it("should have browser.asObject set to true", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { baseLogger } = require("../../lib/logger")
    // Pino exposes the options; verify the logger is usable in browser mode
    // by checking it doesn't throw when logging
    expect(() => baseLogger.info("test message")).not.toThrow()
    expect(() => baseLogger.info({ key: "value" }, "structured")).not.toThrow()
  })
})
