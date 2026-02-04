import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Blink Bitcoin Terminal (BBT) E2E tests
 * 
 * Test credentials (staging):
 * - Read/Receive/Write API Key: galoy_staging_J0cSDXNLfKDuVU1ctmtA8m16UO8JlJkJzaax7aF7oaThUQyp01nZXuDtmG8H6nIt
 * - Read/Receive API Key: galoy_staging_taj9Io3ho67xNOy3hXFNcl87mFgINjKFY8e88wWUQUi2tFBaUU7ZLwX4ElGs1g6S
 * - Test Nostr nsec: nsec12y0mznqqht00jwp3ve9p8qjpqzmxuqezldz57hkkep54ysjxzrgqjq0faw
 * - Test Nostr npub: npub180qjfgtzhyx3a7ppwgc46t29l8dkzdnktxjzlefa9tq8m9acxeess2cyry
 */

export default defineConfig({
  // Test directory
  testDir: './e2e/tests',

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: [
    ['html', { outputFolder: 'e2e/reports/html' }],
    ['json', { outputFile: 'e2e/reports/results.json' }],
    ['list'],
  ],

  // Shared settings for all the projects below
  use: {
    // Base URL for the app - defaults to local dev server
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video recording on failure
    video: 'on-first-retry',

    // Default timeout for actions like click, fill, etc.
    actionTimeout: 10000,

    // Default navigation timeout
    navigationTimeout: 30000,
  },

  // Global timeout for each test
  timeout: 60000,

  // Expect timeout
  expect: {
    timeout: 10000,
  },

  // Configure projects for different browsers
  projects: [
    // Desktop browsers
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // Mobile browsers (BBT is primarily mobile-focused)
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  // Run local dev server before starting the tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      // Force staging environment for E2E tests
      BLINK_ENVIRONMENT: 'staging',
    },
  },

  // Output directory for test artifacts
  outputDir: 'e2e/test-results',

  // Global setup and teardown
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
});
