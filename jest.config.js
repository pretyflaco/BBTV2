/**
 * Jest Configuration
 *
 * Following Blink conventions for test setup.
 * Uses SWC for fast TypeScript compilation.
 */

/** @type {import('jest').Config} */
const config = {
  // Use SWC for fast TypeScript/JavaScript transformation
  transform: {
    "^.+\\.(t|j)sx?$": [
      "@swc/jest",
      {
        jsc: {
          parser: {
            syntax: "typescript",
            tsx: true,
          },
          transform: {
            react: {
              runtime: "automatic",
            },
          },
        },
      },
    ],
  },

  // Test file patterns - using .spec.ts for new tests, .test.js for legacy
  testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.[jt]sx?$",

  // File extensions to consider
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],

  // Test environment
  testEnvironment: "jsdom",

  // Module path aliases (matching tsconfig.json)
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@/lib/(.*)$": "<rootDir>/lib/$1",
    "^@/components/(.*)$": "<rootDir>/components/$1",
    "^@/types/(.*)$": "<rootDir>/types/$1",
  },

  // Setup files
  setupFilesAfterEnv: ["<rootDir>/tests/unit/setup.ts"],

  // Test directories
  roots: ["<rootDir>/tests/unit", "<rootDir>/lib", "<rootDir>/components"],

  // Exclude patterns
  testPathIgnorePatterns: ["/node_modules/", "/.next/", "/e2e/"],

  // Coverage configuration
  // Note: Collecting from all source files to track overall progress.
  // Thresholds are set to current baseline (~7%) and should be raised
  // incrementally as more files are migrated to TypeScript with tests
  // in Phase 4 and beyond.
  collectCoverageFrom: [
    "lib/**/*.{js,ts}",
    "components/**/*.{js,jsx,ts,tsx}",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  coverageThreshold: {
    global: {
      statements: 5,
      branches: 2,
      functions: 5,
      lines: 5,
    },
  },

  // Timeouts
  testTimeout: 10000,

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks after each test
  restoreMocks: true,
}

module.exports = config
