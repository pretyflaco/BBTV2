/**
 * Unit Tests for lib/shutdown.ts
 *
 * Tests onShutdown() registration and callback execution.
 * Because the module uses module-level state (callbacks array, registered flag),
 * we use jest.isolateModules() to get a fresh module for each test.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get a fresh shutdown module with mocked dependencies */
function getShutdownModule() {
  let shutdownModule: typeof import("../../lib/shutdown")

  jest.isolateModules(() => {
    // Mock logger before importing shutdown (which imports logger)
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

    shutdownModule = require("../../lib/shutdown") as typeof import("../../lib/shutdown")
  })

  return shutdownModule!
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("lib/shutdown", () => {
  // Store original process.on and process.exit so we can spy/restore
  const originalOn = process.on.bind(process)
  const originalExit = process.exit

  beforeEach(() => {
    jest.restoreAllMocks()
  })

  afterEach(() => {
    // Restore process.exit in case a test replaced it
    process.exit = originalExit
  })

  it("should register SIGTERM and SIGINT handlers on first onShutdown call", () => {
    const spy = jest.spyOn(process, "on")

    const mod = getShutdownModule()
    mod.onShutdown("TestCleanup", () => {})

    const signals = spy.mock.calls.map((call) => call[0])
    expect(signals).toContain("SIGTERM")
    expect(signals).toContain("SIGINT")
  })

  it("should not double-register signal handlers on subsequent calls", () => {
    const spy = jest.spyOn(process, "on")

    const mod = getShutdownModule()
    mod.onShutdown("First", () => {})
    mod.onShutdown("Second", () => {})
    mod.onShutdown("Third", () => {})

    // SIGTERM and SIGINT should each appear exactly once
    const sigterms = spy.mock.calls.filter((c) => c[0] === "SIGTERM")
    const sigints = spy.mock.calls.filter((c) => c[0] === "SIGINT")
    expect(sigterms).toHaveLength(1)
    expect(sigints).toHaveLength(1)
  })

  it("should execute callbacks in registration order on shutdown", async () => {
    const order: string[] = []

    // Mock process.exit to prevent actually exiting
    process.exit = jest.fn() as never

    const mod = getShutdownModule()
    mod.onShutdown("A", () => {
      order.push("A")
    })
    mod.onShutdown("B", async () => {
      order.push("B")
    })
    mod.onShutdown("C", () => {
      order.push("C")
    })

    // Manually emit SIGTERM to trigger the handler
    process.emit("SIGTERM")

    // Give async callbacks time to run
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(order).toEqual(["A", "B", "C"])
    expect(process.exit).toHaveBeenCalledWith(0)
  })

  it("should continue executing remaining callbacks if one throws", async () => {
    const order: string[] = []

    process.exit = jest.fn() as never

    const mod = getShutdownModule()
    mod.onShutdown("Good1", () => {
      order.push("Good1")
    })
    mod.onShutdown("Bad", () => {
      order.push("Bad")
      throw new Error("Cleanup failed")
    })
    mod.onShutdown("Good2", () => {
      order.push("Good2")
    })

    process.emit("SIGTERM")
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(order).toEqual(["Good1", "Bad", "Good2"])
    expect(process.exit).toHaveBeenCalledWith(0)
  })

  it("should prevent double-shutdown (second signal is ignored)", async () => {
    let callCount = 0

    process.exit = jest.fn() as never

    const mod = getShutdownModule()
    mod.onShutdown("Counter", () => {
      callCount++
    })

    // Emit SIGTERM twice rapidly
    process.emit("SIGTERM")
    process.emit("SIGINT")

    await new Promise((resolve) => setTimeout(resolve, 50))

    // Callback should only run once
    expect(callCount).toBe(1)
  })
})
