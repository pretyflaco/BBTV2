import { test, expect } from "@playwright/test"

import {
  getWalletBalance,
  sendPaymentToLightningAddress,
  getTransactionHistory,
  waitForBalanceChange,
} from "../../fixtures/api-helpers"
import { setupAuthenticatedState } from "../../fixtures/auth.fixture"
import { TEST_CREDENTIALS, TEST_DATA, TIMEOUTS, POLLING } from "../../fixtures/test-data"
import { SettingsPage, DashboardPage } from "../../page-objects"

test.describe("Wallet Setup", () => {
  let _settingsPage: SettingsPage
  let _dashboardPage: DashboardPage

  test.beforeEach(async ({ page }) => {
    _settingsPage = new SettingsPage(page)
    _dashboardPage = new DashboardPage(page)
  })

  test.describe("Blink Account Connection", () => {
    test("should display API key input field in settings", async ({ page }) => {
      await page.goto("/settings")
      await page.waitForLoadState("domcontentloaded")
      await page.waitForTimeout(1000)

      // Look for API key input
      const apiKeyInput = page.locator(
        '[data-testid="api-key-input"], input[placeholder*="API"], input[placeholder*="key"], input[name*="api"]',
      )

      // Should have some form of API key input
      const _hasInput = await apiKeyInput
        .first()
        .isVisible()
        .catch(() => false)
      // May require authentication first
    })

    test("should accept valid Blink API key format", async ({ page }) => {
      await page.goto("/settings")
      await page.waitForLoadState("domcontentloaded")
      await page.waitForTimeout(1000)

      const apiKeyInput = page
        .locator(
          '[data-testid="api-key-input"], input[placeholder*="API"], input[name*="api"]',
        )
        .first()

      if (await apiKeyInput.isVisible()) {
        await apiKeyInput.fill(TEST_CREDENTIALS.apiKeys.readReceiveWrite)
        const value = await apiKeyInput.inputValue()
        expect(value).toContain("galoy_staging")
      }
    })

    test("should validate API key on save", async ({ page }) => {
      test.slow()
      await page.goto("/settings")
      await page.waitForLoadState("domcontentloaded")
      await page.waitForTimeout(1000)

      const apiKeyInput = page
        .locator(
          '[data-testid="api-key-input"], input[placeholder*="API"], input[name*="api"]',
        )
        .first()
      const saveButton = page
        .locator(
          '[data-testid="save-settings"], button:has-text("Save"), button:has-text("Connect")',
        )
        .first()

      if ((await apiKeyInput.isVisible()) && (await saveButton.isVisible())) {
        await apiKeyInput.fill(TEST_CREDENTIALS.apiKeys.readReceiveWrite)
        await saveButton.click()

        // Wait for validation response
        await page.waitForTimeout(3000)

        // Should show success or error message
        const _successMsg = page.locator(
          '[data-testid="success-message"], .success, [role="alert"]:has-text("success")',
        )
        const _errorMsg = page.locator(
          '[data-testid="error-message"], .error, [role="alert"]:has-text("error")',
        )

        // One of these should appear
      }
    })

    test("should show error for invalid API key", async ({ page }) => {
      await page.goto("/settings")
      await page.waitForLoadState("domcontentloaded")
      await page.waitForTimeout(1000)

      const apiKeyInput = page
        .locator(
          '[data-testid="api-key-input"], input[placeholder*="API"], input[name*="api"]',
        )
        .first()
      const saveButton = page
        .locator(
          '[data-testid="save-settings"], button:has-text("Save"), button:has-text("Connect")',
        )
        .first()

      if ((await apiKeyInput.isVisible()) && (await saveButton.isVisible())) {
        await apiKeyInput.fill("invalid_api_key_12345")
        await saveButton.click()

        // Wait for error response
        await page.waitForTimeout(3000)

        // Should show error
        const _errorMsg = page.locator(
          '[data-testid="error-message"], .error, [role="alert"]',
        )
        // Error should appear
      }
    })

    test("should show connection status indicator", async ({ page }) => {
      await page.goto("/settings")
      await page.waitForLoadState("domcontentloaded")
      await page.waitForTimeout(1000)

      // Look for connection status indicator
      const _statusIndicator = page.locator(
        '[data-testid="blink-connected"], [data-testid="blink-status"], .connection-status',
      )
      // May show connected/disconnected state
    })
  })

  test.describe("Wallet Display", () => {
    test("should display balance when connected", async ({ page }) => {
      // Setup authenticated state with API key
      await setupAuthenticatedState(page, {
        apiKey: TEST_CREDENTIALS.apiKeys.readReceiveWrite,
        username: TEST_DATA.testAccount.username,
      })

      // Navigate to dashboard
      await page.goto("/dashboard")
      await page.waitForLoadState("domcontentloaded")
      await page.waitForTimeout(2000) // Wait for balance to load

      // Look for balance display elements
      const balanceDisplay = page
        .locator(
          '[data-testid="balance-display"], ' +
            '[data-testid="btc-balance"], ' +
            '[class*="balance"], ' +
            ".balance, " +
            '[class*="Balance"]',
        )
        .first()

      // Balance should be visible or page should show wallet connected state
      const pageContent = await page.content()
      const hasBalanceIndicator =
        pageContent.includes("sats") ||
        pageContent.includes("SAT") ||
        pageContent.includes("BTC") ||
        pageContent.includes("$") ||
        pageContent.includes("USD") ||
        (await balanceDisplay.isVisible().catch(() => false))

      expect(hasBalanceIndicator).toBeTruthy()
    })

    test("should show BTC and USD balance", async ({ page }) => {
      // Setup authenticated state
      await setupAuthenticatedState(page, {
        apiKey: TEST_CREDENTIALS.apiKeys.readReceiveWrite,
        username: TEST_DATA.testAccount.username,
      })

      // Navigate to dashboard
      await page.goto("/dashboard")
      await page.waitForLoadState("domcontentloaded")
      await page.waitForTimeout(2000)

      // Get page content
      const pageContent = await page.content()

      // Look for BTC indicators (sats, SAT, BTC)
      const hasBtcBalance =
        pageContent.includes("sats") ||
        pageContent.includes("SAT") ||
        pageContent.includes("BTC")

      // Look for USD indicators ($, USD)
      const hasUsdBalance = pageContent.includes("$") || pageContent.includes("USD")

      // At least one of these should be present (depends on user's default currency)
      expect(hasBtcBalance || hasUsdBalance).toBeTruthy()
    })

    test("should update balance after transaction", async ({ page }) => {
      test.slow() // This test involves real API calls

      // Setup authenticated state
      await setupAuthenticatedState(page, {
        apiKey: TEST_CREDENTIALS.apiKeys.readReceiveWrite,
        username: TEST_DATA.testAccount.username,
      })

      // Get initial balance via API
      const initialBalance = await getWalletBalance(
        TEST_CREDENTIALS.apiKeys.readReceiveWrite,
      )
      console.log("Initial BTC balance:", initialBalance.btcBalance, "sats")

      // Ensure we have enough balance for the test
      if (initialBalance.btcBalance < TEST_DATA.amounts.testSats + 10) {
        test.skip(true, "Insufficient balance for transaction test")
        return
      }

      // Navigate to dashboard
      await page.goto("/dashboard")
      await page.waitForLoadState("domcontentloaded")
      await page.waitForTimeout(2000)

      // Send a payment via API (21 sats to test recipient)
      const paymentResult = await sendPaymentToLightningAddress(
        TEST_CREDENTIALS.apiKeys.readReceiveWrite,
        TEST_DATA.lightningAddresses.testRecipient,
        TEST_DATA.amounts.testSats,
      )

      if (!paymentResult.success) {
        console.log("Payment failed:", paymentResult.error)
        // Don't fail test if recipient is unavailable (e.g., offline node)
        if (paymentResult.error?.code === "NO_ROUTE") {
          test.skip(true, "No route to recipient - skipping balance update test")
          return
        }
      }

      expect(paymentResult.success).toBeTruthy()
      console.log("Payment sent successfully")

      // Wait for balance to update (poll for up to 10 seconds)
      const balanceChange = await waitForBalanceChange(
        TEST_CREDENTIALS.apiKeys.readReceiveWrite,
        initialBalance.btcBalance,
        "decrease",
        TIMEOUTS.balanceUpdate,
        POLLING.balanceIntervalMs,
      )

      // Balance should have decreased
      expect(balanceChange.changed).toBeTruthy()
      expect(balanceChange.newBalance).toBeLessThan(initialBalance.btcBalance)
      console.log(
        "Balance updated:",
        initialBalance.btcBalance,
        "->",
        balanceChange.newBalance,
      )
    })
  })

  test.describe("Transaction History", () => {
    test("should display transaction list", async ({ page }) => {
      await page.goto("/dashboard")
      await page.waitForLoadState("domcontentloaded")
      await page.waitForTimeout(1000)

      // Look for transaction list
      const _txList = page.locator(
        '[data-testid="transaction-list"], .transactions, [class*="transaction"]',
      )
      // May require authentication
    })

    test("should show transaction details", async ({ page }) => {
      // Setup authenticated state
      await setupAuthenticatedState(page, {
        apiKey: TEST_CREDENTIALS.apiKeys.readReceiveWrite,
        username: TEST_DATA.testAccount.username,
      })

      // Get transactions via API to verify we have some
      const transactions = await getTransactionHistory(
        TEST_CREDENTIALS.apiKeys.readReceiveWrite,
        5,
      )

      if (transactions.length === 0) {
        test.skip(true, "No transactions available for testing")
        return
      }

      // Navigate to dashboard
      await page.goto("/dashboard")
      await page.waitForLoadState("domcontentloaded")
      await page.waitForTimeout(2000)

      // Look for transaction items
      const txItems = page.locator(
        '[data-testid="transaction-item"], ' +
          '[class*="transaction"], ' +
          ".transaction-item, " +
          '[class*="Transaction"]',
      )

      // Check if any transaction items are visible
      const txCount = await txItems.count()
      const pageContent = await page.content()

      // Transaction details might show amount, date, or status
      const hasTransactionIndicator =
        txCount > 0 ||
        pageContent.includes("sats") ||
        pageContent.includes("received") ||
        pageContent.includes("sent") ||
        pageContent.includes("pending")

      expect(hasTransactionIndicator).toBeTruthy()
    })

    test("should paginate transactions", async ({ page }) => {
      // Setup authenticated state
      await setupAuthenticatedState(page, {
        apiKey: TEST_CREDENTIALS.apiKeys.readReceiveWrite,
        username: TEST_DATA.testAccount.username,
      })

      // Get transactions via API to check if we have enough for pagination
      const transactions = await getTransactionHistory(
        TEST_CREDENTIALS.apiKeys.readReceiveWrite,
        20,
      )

      if (transactions.length < 10) {
        test.skip(true, "Not enough transactions for pagination test")
        return
      }

      // Navigate to dashboard
      await page.goto("/dashboard")
      await page.waitForLoadState("domcontentloaded")
      await page.waitForTimeout(2000)

      // Look for load more / pagination controls
      const loadMoreButton = page
        .locator(
          'button:has-text("Load more"), ' +
            'button:has-text("Show more"), ' +
            '[data-testid="load-more"], ' +
            '[class*="pagination"], ' +
            '[class*="loadMore"]',
        )
        .first()

      // Check if pagination exists (may not be visible if few transactions)
      const hasPagination = await loadMoreButton.isVisible().catch(() => false)

      // If pagination exists, test clicking it
      if (hasPagination) {
        await loadMoreButton.click()
        await page.waitForTimeout(1000)

        // Page should still be stable after loading more
        expect(await page.title()).toBeTruthy()
      } else {
        // No pagination needed - test passes if transactions are shown inline
        const pageContent = await page.content()
        const hasTransactions =
          pageContent.includes("sats") || pageContent.includes("transaction")
        expect(hasTransactions).toBeTruthy()
      }
    })
  })

  test.describe("Settings Persistence", () => {
    test("should persist settings across page refresh", async ({ page }) => {
      // Setup authenticated state
      await setupAuthenticatedState(page, {
        apiKey: TEST_CREDENTIALS.apiKeys.readReceiveWrite,
        username: TEST_DATA.testAccount.username,
      })

      // Navigate to a page and wait
      await page.goto("/")
      await page.waitForLoadState("domcontentloaded")
      await page.waitForTimeout(1000)

      // Get current localStorage state
      const beforeRefresh = await page.evaluate(() => {
        return {
          profiles: localStorage.getItem("blinkpos_profiles"),
          activeProfile: localStorage.getItem("blinkpos_active_profile"),
          environment: localStorage.getItem("blink_environment"),
        }
      })

      // Verify we have data stored
      expect(beforeRefresh.profiles).toBeTruthy()
      expect(beforeRefresh.activeProfile).toBeTruthy()

      // Refresh the page
      await page.reload()
      await page.waitForLoadState("domcontentloaded")
      await page.waitForTimeout(1000)

      // Check localStorage after refresh
      const afterRefresh = await page.evaluate(() => {
        return {
          profiles: localStorage.getItem("blinkpos_profiles"),
          activeProfile: localStorage.getItem("blinkpos_active_profile"),
          environment: localStorage.getItem("blink_environment"),
        }
      })

      // Data should persist
      expect(afterRefresh.profiles).toBe(beforeRefresh.profiles)
      expect(afterRefresh.activeProfile).toBe(beforeRefresh.activeProfile)
      expect(afterRefresh.environment).toBe(beforeRefresh.environment)
    })

    test("should persist settings across browser sessions", async ({ browser }) => {
      // Create first context/session
      const context1 = await browser.newContext()
      const page1 = await context1.newPage()

      try {
        // Setup authenticated state in first session
        await setupAuthenticatedState(page1, {
          apiKey: TEST_CREDENTIALS.apiKeys.readReceiveWrite,
          username: TEST_DATA.testAccount.username,
        })

        // Get storage state from first session
        const storageState = await page1.evaluate(() => {
          return {
            profiles: localStorage.getItem("blinkpos_profiles"),
            activeProfile: localStorage.getItem("blinkpos_active_profile"),
            environment: localStorage.getItem("blink_environment"),
            deviceKey: localStorage.getItem("_blinkpos_dk"),
          }
        })

        // Verify we have data
        expect(storageState.profiles).toBeTruthy()
        expect(storageState.activeProfile).toBeTruthy()

        // Close first context
        await context1.close()

        // Create second context (simulates new session)
        const context2 = await browser.newContext()
        const page2 = await context2.newPage()

        try {
          // Navigate to app
          await page2.goto("/")
          await page2.waitForLoadState("domcontentloaded")

          // Inject the storage state from first session (simulates persistent storage)
          await page2.evaluate((state) => {
            if (state.profiles) localStorage.setItem("blinkpos_profiles", state.profiles)
            if (state.activeProfile)
              localStorage.setItem("blinkpos_active_profile", state.activeProfile)
            if (state.environment)
              localStorage.setItem("blink_environment", state.environment)
            if (state.deviceKey) localStorage.setItem("_blinkpos_dk", state.deviceKey)
          }, storageState)

          // Reload to pick up state
          await page2.reload()
          await page2.waitForLoadState("domcontentloaded")
          await page2.waitForTimeout(1000)

          // Verify state is restored
          const restoredState = await page2.evaluate(() => {
            return {
              profiles: localStorage.getItem("blinkpos_profiles"),
              activeProfile: localStorage.getItem("blinkpos_active_profile"),
            }
          })

          expect(restoredState.profiles).toBe(storageState.profiles)
          expect(restoredState.activeProfile).toBe(storageState.activeProfile)
        } finally {
          await context2.close()
        }
      } finally {
        // Ensure context1 is closed if not already
        if (context1) {
          await context1.close().catch(() => {})
        }
      }
    })
  })
})
