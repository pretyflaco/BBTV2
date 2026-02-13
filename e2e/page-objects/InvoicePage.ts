import { Page, Locator, expect } from "@playwright/test"

import { SELECTORS, TIMEOUTS } from "../fixtures/test-data"

import { BasePage } from "./BasePage"

/**
 * Page object for the Invoice display
 */
export class InvoicePage extends BasePage {
  readonly container: Locator
  readonly qrCode: Locator
  readonly copyButton: Locator
  readonly amount: Locator
  readonly status: Locator

  constructor(page: Page) {
    super(page)
    this.container = page.locator(SELECTORS.invoice.container)
    this.qrCode = page.locator(SELECTORS.invoice.qrCode)
    this.copyButton = page.locator(SELECTORS.invoice.copyButton)
    this.amount = page.locator(SELECTORS.invoice.amount)
    this.status = page.locator(SELECTORS.invoice.status)
  }

  /**
   * Wait for invoice to be displayed
   */
  async waitForInvoice(timeout: number = TIMEOUTS.invoice) {
    await this.container.waitFor({ state: "visible", timeout })
  }

  /**
   * Check if invoice is displayed
   */
  async isInvoiceDisplayed(): Promise<boolean> {
    try {
      await this.container.waitFor({ state: "visible", timeout: TIMEOUTS.short })
      return true
    } catch {
      return false
    }
  }

  /**
   * Get invoice amount
   */
  async getInvoiceAmount(): Promise<string> {
    return (await this.amount.textContent()) || ""
  }

  /**
   * Get invoice status (e.g., "pending", "paid", "expired")
   */
  async getInvoiceStatus(): Promise<string> {
    return (await this.status.textContent()) || ""
  }

  /**
   * Check if QR code is visible
   */
  async isQRCodeVisible(): Promise<boolean> {
    try {
      await this.qrCode.waitFor({ state: "visible", timeout: TIMEOUTS.short })
      return true
    } catch {
      return false
    }
  }

  /**
   * Copy invoice to clipboard
   */
  async copyInvoice() {
    await this.copyButton.click()
  }

  /**
   * Wait for invoice to be paid
   */
  async waitForPayment(timeout: number = TIMEOUTS.invoice) {
    await expect(this.status).toContainText(/paid|success|complete/i, { timeout })
  }

  /**
   * Check if invoice is expired
   */
  async isExpired(): Promise<boolean> {
    const status = await this.getInvoiceStatus()
    return status.toLowerCase().includes("expired")
  }

  /**
   * Get the invoice string (for payment)
   * Note: This may need adjustment based on actual DOM structure
   */
  async getInvoiceString(): Promise<string> {
    // Try to get from a hidden input or data attribute
    const invoiceInput = this.page.locator('[data-testid="invoice-string"]')
    if (await invoiceInput.isVisible()) {
      return (await invoiceInput.getAttribute("value")) || ""
    }

    // Fallback: try to get from clipboard after copying
    await this.copyInvoice()
    return this.page.evaluate(() => navigator.clipboard.readText())
  }
}
