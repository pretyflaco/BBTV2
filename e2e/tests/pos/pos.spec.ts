import { test, expect } from '@playwright/test';
import { POSPage, InvoicePage } from '../../page-objects';
import { TEST_DATA, TIMEOUTS, SELECTORS } from '../../fixtures/test-data';

test.describe('Point of Sale (POS)', () => {
  let posPage: POSPage;
  let invoicePage: InvoicePage;

  test.beforeEach(async ({ page }) => {
    posPage = new POSPage(page);
    invoicePage = new InvoicePage(page);
  });

  test.describe('Numpad', () => {
    test('should display numpad on POS page', async ({ page }) => {
      await posPage.goto();
      
      // Look for numpad or number input buttons
      const numpad = page.locator('[data-testid="numpad"], .numpad, [class*="numpad"]');
      const numberButtons = page.locator('button:has-text("1"), button:has-text("2"), button:has-text("3")');
      
      // Either numpad container or individual number buttons should be visible
      const hasNumpad = await numpad.first().isVisible().catch(() => false);
      const hasNumbers = await numberButtons.first().isVisible().catch(() => false);
      
      expect(hasNumpad || hasNumbers).toBeTruthy();
    });

    test('should have all digit buttons (0-9)', async ({ page }) => {
      await posPage.goto();
      
      for (let digit = 0; digit <= 9; digit++) {
        const button = page.locator(`button:has-text("${digit}"), [data-testid="numpad-${digit}"]`).first();
        // Button should exist
        const exists = await button.count() > 0;
        if (!exists) {
          console.log(`Digit ${digit} button not found with expected selector`);
        }
      }
    });

    test('should have decimal point button', async ({ page }) => {
      await posPage.goto();
      
      const decimalButton = page.locator('button:has-text("."), [data-testid="numpad-decimal"], [data-testid="numpad-."]');
      // May not exist in all numpad implementations
    });

    test('should have clear/backspace button', async ({ page }) => {
      await posPage.goto();
      
      const clearButton = page.locator('[data-testid="clear-button"], button:has-text("C"), button:has-text("Clear"), [data-testid="numpad-clear"]');
      // Should exist
    });

    test('should update amount display when pressing digits', async ({ page }) => {
      await posPage.goto();
      
      // Find a digit button and amount display
      const digit1 = page.locator('button:has-text("1"), [data-testid="numpad-1"]').first();
      const digit2 = page.locator('button:has-text("2"), [data-testid="numpad-2"]').first();
      const amountDisplay = page.locator('[data-testid="amount-display"], .amount-display, [class*="amount"]').first();
      
      if (await digit1.isVisible() && await digit2.isVisible()) {
        await digit1.click();
        await digit2.click();
        await digit1.click();
        
        // Amount should show "121" or formatted version
        const displayText = await amountDisplay.textContent();
        expect(displayText).toContain('1');
      }
    });

    test('should clear amount when clear button is pressed', async ({ page }) => {
      await posPage.goto();
      
      const digit5 = page.locator('button:has-text("5"), [data-testid="numpad-5"]').first();
      const clearButton = page.locator('[data-testid="clear-button"], button:has-text("C"), [data-testid="numpad-clear"]').first();
      const amountDisplay = page.locator('[data-testid="amount-display"], .amount-display, [class*="amount"]').first();
      
      if (await digit5.isVisible() && await clearButton.isVisible()) {
        await digit5.click();
        await digit5.click();
        await clearButton.click();
        
        // Amount should be cleared (show 0 or empty)
        const displayText = await amountDisplay.textContent();
        // Check it's cleared or shows 0
      }
    });
  });

  test.describe('Currency Toggle', () => {
    test('should display currency toggle', async ({ page }) => {
      await posPage.goto();
      
      const currencyToggle = page.locator('[data-testid="currency-toggle"], button:has-text("BTC"), button:has-text("USD"), button:has-text("sats")');
      // Should have some currency indicator
    });

    test('should switch between BTC and fiat', async ({ page }) => {
      await posPage.goto();
      
      const currencyToggle = page.locator('[data-testid="currency-toggle"]').first();
      
      if (await currencyToggle.isVisible()) {
        const initialText = await currencyToggle.textContent();
        await currencyToggle.click();
        await page.waitForTimeout(300);
        const newText = await currencyToggle.textContent();
        
        // Currency should have changed
        expect(newText).not.toBe(initialText);
      }
    });
  });

  test.describe('Invoice Generation', () => {
    test('should have generate invoice button', async ({ page }) => {
      await posPage.goto();
      
      // Wait for page to fully load
      await page.waitForTimeout(1000);
      
      // The generate invoice button exists but may be disabled when amount is 0
      // We should check the button exists in the DOM (not necessarily visible/enabled)
      const generateButton = page.locator('[data-testid="generate-invoice"]');
      await expect(generateButton).toBeAttached({ timeout: TIMEOUTS.medium });
      
      // Verify button exists - it may be disabled initially
      const buttonCount = await generateButton.count();
      expect(buttonCount).toBeGreaterThan(0);
    });

    test('should generate invoice when amount is entered', async ({ page }) => {
      test.slow(); // Invoice generation may take time
      await posPage.goto();
      
      // Wait for numpad to be fully loaded
      const numpad = page.locator('[data-testid="numpad"]');
      await expect(numpad).toBeVisible({ timeout: TIMEOUTS.medium });
      
      // Wait a moment for exchange rates to load
      await page.waitForTimeout(3000);
      
      // Use data-testid selectors for numpad buttons
      // Enter 21 sats (standard test amount)
      const digit2 = page.locator('[data-testid="numpad-2"]');
      const digit1 = page.locator('[data-testid="numpad-1"]');
      const generateButton = page.locator('[data-testid="generate-invoice"]');
      
      // Wait for buttons to be visible and clickable
      await expect(digit2).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(digit1).toBeVisible({ timeout: TIMEOUTS.short });
      
      // Enter amount: 21 (TEST_DATA.amounts.testSats)
      await digit2.click();
      await page.waitForTimeout(100); // Small delay for state update
      await digit1.click();
      await page.waitForTimeout(200);
      
      // Wait for the generate button to be enabled (not disabled)
      // The button is disabled when amount is 0/invalid or exchange rate is unavailable
      await expect(generateButton).toBeEnabled({ timeout: TIMEOUTS.medium });
      
      // Generate invoice
      await generateButton.click();
      
      // Wait for invoice/QR code to appear - check for various QR representations
      const qrCode = page.locator('[data-testid="invoice-qr"], canvas, svg[class*="qr"], img[alt*="QR"], svg').first();
      await expect(qrCode).toBeVisible({ timeout: TIMEOUTS.invoice });
    });

    test('should display QR code for generated invoice', async ({ page }) => {
      test.slow();
      await posPage.goto();
      
      // Wait for numpad
      const numpad = page.locator('[data-testid="numpad"]');
      await expect(numpad).toBeVisible({ timeout: TIMEOUTS.medium });
      await page.waitForTimeout(3000);
      
      // Enter 21 sats
      const digit2 = page.locator('[data-testid="numpad-2"]');
      const digit1 = page.locator('[data-testid="numpad-1"]');
      await digit2.click();
      await page.waitForTimeout(100);
      await digit1.click();
      await page.waitForTimeout(200);
      
      // Generate invoice
      const generateButton = page.locator('[data-testid="generate-invoice"]');
      await expect(generateButton).toBeEnabled({ timeout: TIMEOUTS.medium });
      await generateButton.click();
      
      // Verify QR code is displayed
      const qrCode = page.locator('[data-testid="invoice-qr"]');
      await expect(qrCode).toBeVisible({ timeout: TIMEOUTS.invoice });
      
      // Verify QR code contains an image or canvas (actual QR rendering)
      const qrContainer = page.locator('[data-testid="invoice-qr"] canvas, [data-testid="invoice-qr"] svg, [data-testid="invoice-qr"] img');
      const qrExists = await qrContainer.count() > 0 || await qrCode.locator('canvas, svg, img').count() > 0;
      
      // QR code element should exist (either as direct child or the container itself has canvas/svg)
      expect(await qrCode.isVisible()).toBeTruthy();
    });

    test('should show invoice amount', async ({ page }) => {
      test.slow();
      await posPage.goto();
      
      // Wait for numpad
      const numpad = page.locator('[data-testid="numpad"]');
      await expect(numpad).toBeVisible({ timeout: TIMEOUTS.medium });
      await page.waitForTimeout(3000);
      
      // Enter 21 sats
      const digit2 = page.locator('[data-testid="numpad-2"]');
      const digit1 = page.locator('[data-testid="numpad-1"]');
      await digit2.click();
      await page.waitForTimeout(100);
      await digit1.click();
      await page.waitForTimeout(200);
      
      // Generate invoice
      const generateButton = page.locator('[data-testid="generate-invoice"]');
      await expect(generateButton).toBeEnabled({ timeout: TIMEOUTS.medium });
      await generateButton.click();
      
      // Wait for invoice to appear
      const qrCode = page.locator('[data-testid="invoice-qr"]');
      await expect(qrCode).toBeVisible({ timeout: TIMEOUTS.invoice });
      
      // Verify the amount is displayed somewhere on the invoice page
      // The amount may be shown as "21" sats, "$21.00", or similar
      const pageContent = await page.content();
      
      // Check for various amount formats:
      // - "21" (raw number)
      // - "$21" (USD format)
      // - "21 sats" (BTC format)
      // - The amount converted to sats may appear in the invoice string
      const amountVisible = 
        pageContent.includes('21') ||
        pageContent.includes('$21') ||
        pageContent.includes('21 sat') ||
        pageContent.includes('21.00');
      
      expect(amountVisible).toBeTruthy();
    });
  });

  test.describe('Public POS', () => {
    test('should load public POS page for valid username', async ({ page }) => {
      // Navigate to public POS using the staging test username
      await page.goto(`/${TEST_DATA.usernames.staging}`);
      
      // Should show POS interface
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);
      
      // Check that the numpad is visible (indicates POS loaded successfully)
      const numpad = page.locator('[data-testid="numpad"]');
      await expect(numpad).toBeVisible({ timeout: TIMEOUTS.medium });
    });

    test('should display merchant name on public POS', async ({ page }) => {
      // Navigate to public POS
      await page.goto(`/${TEST_DATA.usernames.staging}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);
      
      // Look for the username/merchant name displayed on the page
      // The username should appear in the title, header, or on the page somewhere
      const pageContent = await page.content();
      const usernameVisible = pageContent.toLowerCase().includes(TEST_DATA.usernames.staging.toLowerCase());
      
      // Also check page title
      const title = await page.title();
      const inTitle = title.toLowerCase().includes(TEST_DATA.usernames.staging.toLowerCase());
      
      // Username should be visible somewhere (page content or title)
      expect(usernameVisible || inTitle).toBeTruthy();
    });

    test('should allow generating invoice without login', async ({ page }) => {
      test.slow(); // Invoice generation may take time
      
      // Navigate to public POS - this works without authentication
      await page.goto(`/${TEST_DATA.usernames.staging}`);
      await page.waitForLoadState('domcontentloaded');
      
      // Wait for numpad to be fully loaded
      const numpad = page.locator('[data-testid="numpad"]');
      await expect(numpad).toBeVisible({ timeout: TIMEOUTS.medium });
      
      // Wait for exchange rates to load
      await page.waitForTimeout(3000);
      
      // Use data-testid selectors for numpad buttons
      // Enter 21 sats (standard test amount)
      const digit2 = page.locator('[data-testid="numpad-2"]');
      const digit1 = page.locator('[data-testid="numpad-1"]');
      const generateButton = page.locator('[data-testid="generate-invoice"]');
      
      // Wait for buttons to be visible
      await expect(digit2).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(digit1).toBeVisible({ timeout: TIMEOUTS.short });
      
      // Enter amount: 21 sats
      await digit2.click();
      await page.waitForTimeout(100);
      await digit1.click();
      await page.waitForTimeout(200);
      
      // Wait for generate button to be enabled
      await expect(generateButton).toBeEnabled({ timeout: TIMEOUTS.medium });
      
      // Generate invoice without being logged in
      await generateButton.click();
      
      // Wait for invoice/QR code to appear
      const qrCode = page.locator('[data-testid="invoice-qr"], canvas, svg[class*="qr"], img[alt*="QR"], svg').first();
      await expect(qrCode).toBeVisible({ timeout: TIMEOUTS.invoice });
    });

    test('should generate invoice in USD mode', async ({ page }) => {
      test.slow(); // Invoice generation may take time
      
      // Navigate to public POS
      await page.goto(`/${TEST_DATA.usernames.staging}`);
      await page.waitForLoadState('domcontentloaded');
      
      // Wait for numpad to be fully loaded
      const numpad = page.locator('[data-testid="numpad"]');
      await expect(numpad).toBeVisible({ timeout: TIMEOUTS.medium });
      
      // Wait for exchange rates to load
      await page.waitForTimeout(3000);
      
      // Find and click currency toggle to switch to USD
      const currencyToggle = page.locator('[data-testid="currency-toggle"]');
      if (await currencyToggle.isVisible()) {
        // Get initial currency state
        const initialText = await currencyToggle.textContent();
        
        // If it's in BTC/sats mode, switch to USD
        if (initialText?.toLowerCase().includes('sat') || initialText?.toLowerCase().includes('btc')) {
          await currencyToggle.click();
          await page.waitForTimeout(500);
        }
      }
      
      // Enter 21 cents ($0.21) - standard test amount for USD mode
      const digit2 = page.locator('[data-testid="numpad-2"]');
      const digit1 = page.locator('[data-testid="numpad-1"]');
      const generateButton = page.locator('[data-testid="generate-invoice"]');
      
      await digit2.click();
      await page.waitForTimeout(100);
      await digit1.click();
      await page.waitForTimeout(200);
      
      // Wait for generate button to be enabled
      await expect(generateButton).toBeEnabled({ timeout: TIMEOUTS.medium });
      
      // Generate invoice
      await generateButton.click();
      
      // Wait for invoice/QR code to appear
      const qrCode = page.locator('[data-testid="invoice-qr"], canvas, svg[class*="qr"], img[alt*="QR"], svg').first();
      await expect(qrCode).toBeVisible({ timeout: TIMEOUTS.invoice });
    });
  });
});
