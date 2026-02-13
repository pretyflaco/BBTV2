import { Page, Locator, expect } from "@playwright/test"

import { SELECTORS, TIMEOUTS, TEST_DATA } from "../fixtures/test-data"

import { BasePage } from "./BasePage"

/**
 * Page object for the POS (Point of Sale) interface
 */
export class POSPage extends BasePage {
  readonly numpad: Locator
  readonly amountDisplay: Locator
  readonly currencyToggle: Locator
  readonly generateInvoiceButton: Locator
  readonly clearButton: Locator

  constructor(page: Page) {
    super(page)
    this.numpad = page.locator(SELECTORS.pos.numpad)
    this.amountDisplay = page.locator(SELECTORS.pos.amountDisplay)
    this.currencyToggle = page.locator(SELECTORS.pos.currencyToggle)
    this.generateInvoiceButton = page.locator(SELECTORS.pos.generateInvoice)
    this.clearButton = page.locator(SELECTORS.pos.clearButton)
  }

  /**
   * Navigate to POS page
   * By default, navigates to the staging test user's public POS
   */
  async goto(username?: string) {
    // Use test username for staging by default
    const targetUsername = username || TEST_DATA.usernames.staging
    await super.goto(`/${targetUsername}`)
    await this.waitForLoad()
  }

  /**
   * Navigate to public POS page for a specific user
   */
  async gotoPublicPOS(username: string) {
    await super.goto(`/${username}`)
    await this.waitForLoad()
  }

  /**
   * Get numpad button by digit/character
   */
  getNumpadButton(digit: string): Locator {
    return this.page.locator(SELECTORS.pos.numpadButton(digit))
  }

  /**
   * Enter amount using numpad
   */
  async enterAmount(amount: string) {
    for (const digit of amount) {
      const button = this.getNumpadButton(digit)
      await button.click()
      await this.page.waitForTimeout(50) // Small delay between presses
    }
  }

  /**
   * Clear the current amount
   */
  async clearAmount() {
    await this.clearButton.click()
  }

  /**
   * Get the displayed amount
   */
  async getDisplayedAmount(): Promise<string> {
    return (await this.amountDisplay.textContent()) || ""
  }

  /**
   * Toggle between BTC and fiat currency
   */
  async toggleCurrency() {
    await this.currencyToggle.click()
    await this.page.waitForTimeout(200) // Wait for UI update
  }

  /**
   * Get current currency
   */
  async getCurrentCurrency(): Promise<string> {
    const currencyText = await this.currencyToggle.textContent()
    return currencyText || ""
  }

  /**
   * Generate an invoice for the entered amount
   */
  async generateInvoice() {
    await this.generateInvoiceButton.click()

    // Wait for invoice to be generated
    await this.page.locator(SELECTORS.invoice.container).waitFor({
      state: "visible",
      timeout: TIMEOUTS.invoice,
    })
  }

  /**
   * Check if numpad is visible
   */
  async isNumpadVisible(): Promise<boolean> {
    try {
      await this.numpad.waitFor({ state: "visible", timeout: TIMEOUTS.short })
      return true
    } catch {
      return false
    }
  }

  /**
   * Enter amount and generate invoice in one step
   */
  async createInvoice(amount: string) {
    await this.clearAmount()
    await this.enterAmount(amount)
    await this.generateInvoice()
  }

  /**
   * Test complete numpad input sequence
   */
  async testNumpadSequence(digits: string[]): Promise<boolean> {
    try {
      for (const digit of digits) {
        const button = this.getNumpadButton(digit)
        await expect(button).toBeVisible()
        await button.click()
      }
      return true
    } catch {
      return false
    }
  }
}
