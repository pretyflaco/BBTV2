import { Page, Locator } from "@playwright/test"

import { SELECTORS, TIMEOUTS } from "../fixtures/test-data"

import { BasePage } from "./BasePage"

/**
 * Page object for the Dashboard
 */
export class DashboardPage extends BasePage {
  readonly container: Locator
  readonly balanceDisplay: Locator
  readonly transactionList: Locator
  readonly settingsButton: Locator

  constructor(page: Page) {
    super(page)
    this.container = page.locator(SELECTORS.dashboard.container)
    this.balanceDisplay = page.locator(SELECTORS.dashboard.balanceDisplay)
    this.transactionList = page.locator(SELECTORS.dashboard.transactionList)
    this.settingsButton = page.locator(SELECTORS.dashboard.settingsButton)
  }

  /**
   * Navigate to dashboard
   */
  async goto() {
    await super.goto("/dashboard")
    await this.waitForLoad()
  }

  /**
   * Check if dashboard is displayed
   */
  async isDashboardVisible(): Promise<boolean> {
    try {
      await this.container.waitFor({ state: "visible", timeout: TIMEOUTS.medium })
      return true
    } catch {
      return false
    }
  }

  /**
   * Get current balance
   */
  async getBalance(): Promise<string> {
    await this.balanceDisplay.waitFor({ state: "visible", timeout: TIMEOUTS.medium })
    return (await this.balanceDisplay.textContent()) || ""
  }

  /**
   * Navigate to settings
   */
  async goToSettings() {
    await this.settingsButton.click()
    await this.page.waitForURL(/.*settings.*/, { timeout: TIMEOUTS.medium })
  }

  /**
   * Get transaction count
   */
  async getTransactionCount(): Promise<number> {
    const transactions = this.transactionList.locator('[data-testid="transaction-item"]')
    return transactions.count()
  }

  /**
   * Wait for transactions to load
   */
  async waitForTransactions() {
    await this.transactionList.waitFor({ state: "visible", timeout: TIMEOUTS.medium })
    await this.waitForLoadingComplete()
  }

  /**
   * Get most recent transaction details
   */
  async getRecentTransaction(): Promise<{ amount: string; type: string; date: string }> {
    const firstTransaction = this.transactionList
      .locator('[data-testid="transaction-item"]')
      .first()

    const amount =
      (await firstTransaction
        .locator('[data-testid="transaction-amount"]')
        .textContent()) || ""
    const type =
      (await firstTransaction
        .locator('[data-testid="transaction-type"]')
        .textContent()) || ""
    const date =
      (await firstTransaction
        .locator('[data-testid="transaction-date"]')
        .textContent()) || ""

    return { amount, type, date }
  }

  /**
   * Refresh dashboard data
   */
  async refresh() {
    const refreshButton = this.page.locator('[data-testid="refresh-button"]')
    if (await refreshButton.isVisible()) {
      await refreshButton.click()
      await this.waitForLoadingComplete()
    } else {
      // Fallback to page reload
      await this.page.reload()
      await this.waitForLoad()
    }
  }
}
