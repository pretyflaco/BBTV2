import { Page, Locator } from "@playwright/test"

import { SELECTORS, TIMEOUTS } from "../fixtures/test-data"

/**
 * Base page object with common functionality
 */
export class BasePage {
  readonly page: Page
  readonly loadingSpinner: Locator
  readonly errorMessage: Locator
  readonly successMessage: Locator
  readonly stagingBanner: Locator

  constructor(page: Page) {
    this.page = page
    this.loadingSpinner = page.locator(SELECTORS.common.loadingSpinner)
    this.errorMessage = page.locator(SELECTORS.common.errorMessage)
    this.successMessage = page.locator(SELECTORS.common.successMessage)
    this.stagingBanner = page.locator(SELECTORS.common.stagingBanner)
  }

  /**
   * Navigate to a path relative to baseURL
   */
  async goto(path: string = "/") {
    await this.page.goto(path)
  }

  /**
   * Wait for page to finish loading
   * Note: We use 'domcontentloaded' instead of 'networkidle' because BBT has
   * persistent WebSocket connections for real-time payment notifications that
   * prevent networkidle from ever completing.
   */
  async waitForLoad() {
    await this.page.waitForLoadState("domcontentloaded")
    // Give React time to hydrate
    await this.page.waitForTimeout(1000)
  }

  /**
   * Wait for loading spinner to disappear
   */
  async waitForLoadingComplete() {
    try {
      await this.loadingSpinner.waitFor({ state: "hidden", timeout: TIMEOUTS.medium })
    } catch {
      // Loading spinner may not be present
    }
  }

  /**
   * Check if staging banner is visible
   */
  async isStagingMode(): Promise<boolean> {
    try {
      await this.stagingBanner.waitFor({ state: "visible", timeout: TIMEOUTS.short })
      return true
    } catch {
      return false
    }
  }

  /**
   * Get current URL
   */
  getCurrentUrl(): string {
    return this.page.url()
  }

  /**
   * Take a screenshot
   */
  async screenshot(name: string) {
    await this.page.screenshot({ path: `e2e/test-results/screenshots/${name}.png` })
  }

  /**
   * Wait for an element to be visible
   */
  async waitForVisible(selector: string, timeout: number = TIMEOUTS.medium) {
    await this.page.locator(selector).waitFor({ state: "visible", timeout })
  }

  /**
   * Check if element exists
   */
  async elementExists(selector: string): Promise<boolean> {
    const count = await this.page.locator(selector).count()
    return count > 0
  }
}
