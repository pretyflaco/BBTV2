import { test, expect } from "@playwright/test"

import { TIMEOUTS } from "../../fixtures/test-data"
import { AuthPage } from "../../page-objects"

/**
 * NIP-46 Security Tests
 *
 * These tests verify the security protections in the NIP-46 remote signer flow,
 * specifically the "Mike Dilger attack" prevention which requires bunker:// URLs
 * to include a verification secret.
 *
 * Background:
 * - Bunker URLs (signer-initiated flow) without secrets could be spoofed by attackers
 * - An attacker monitoring NIP-46 relays could race to send a malicious bunker URL
 * - Our security fix rejects bunker URLs without secrets to prevent this attack
 *
 * See: https://github.com/ArcadeLabsInc/blink-bbt/issues/431
 */

test.describe("NIP-46 Security", () => {
  let authPage: AuthPage

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page)
    await authPage.goto()
  })

  test.describe("Bunker URL Security Validation", () => {
    test("should reject bunker URL without secret parameter", async ({ page }) => {
      // Open the Remote Signer flow
      await authPage.connectRemoteSignerButton.click()
      await page.waitForTimeout(1000)

      // Click the "Bunker URL" tab
      const bunkerUrlTab = page.locator('button:has-text("Bunker URL")')
      await expect(bunkerUrlTab).toBeVisible({ timeout: TIMEOUTS.short })
      await bunkerUrlTab.click()

      // Enter a bunker URL WITHOUT a secret (this simulates an attack)
      const bunkerUrlInput = page
        .locator('input[placeholder*="bunker://"], textarea[placeholder*="bunker://"]')
        .first()
      await expect(bunkerUrlInput).toBeVisible({ timeout: TIMEOUTS.short })

      // Use a fake pubkey - the security check should happen before any connection attempt
      const insecureBunkerUrl =
        "bunker://fa984bd7dbb282f07e16e7ae87b26a2a7b9b90b7246a44771f0cf5ae58018f52?relay=wss://relay.nsec.app"
      await bunkerUrlInput.fill(insecureBunkerUrl)

      // Click Connect (specifically the submit button in the modal form)
      const connectButton = page.locator('button[type="submit"]:has-text("Connect")')
      await connectButton.click()

      // Should show security rejection UI
      const securityWarning = page.locator("text=Security Protection")
      await expect(securityWarning).toBeVisible({ timeout: TIMEOUTS.medium })

      // Should explain why the connection was blocked
      const explanationText = page.locator("text=does not contain a verification secret")
      await expect(explanationText).toBeVisible()

      // Should show instructions for getting a secure bunker URL
      const instructions = page.locator("text=How to get a secure bunker URL")
      await expect(instructions).toBeVisible()

      // Should have a "Try Again" button
      const tryAgainButton = page.locator('button:has-text("Try Again")')
      await expect(tryAgainButton).toBeVisible()
    })

    test("should show security rejection with helpful instructions", async ({ page }) => {
      // Open the Remote Signer flow
      await authPage.connectRemoteSignerButton.click()
      await page.waitForTimeout(1000)

      // Switch to Bunker URL tab
      const bunkerUrlTab = page.locator('button:has-text("Bunker URL")')
      await bunkerUrlTab.click()

      // Enter insecure bunker URL
      const bunkerUrlInput = page
        .locator('input[placeholder*="bunker://"], textarea[placeholder*="bunker://"]')
        .first()
      const insecureBunkerUrl =
        "bunker://0000000000000000000000000000000000000000000000000000000000000001?relay=wss://relay.example.com"
      await bunkerUrlInput.fill(insecureBunkerUrl)

      // Click Connect (specifically the submit button in the modal form)
      const connectButton = page.locator('button[type="submit"]:has-text("Connect")')
      await connectButton.click()

      // Verify instructions for different signer apps are shown
      const nsecAppInstructions = page.locator("text=nsec.app:")
      const amberInstructions = page.locator("text=Amber:")

      await expect(nsecAppInstructions).toBeVisible({ timeout: TIMEOUTS.medium })
      await expect(amberInstructions).toBeVisible()
    })

    test("should allow retry after security rejection", async ({ page }) => {
      // Open Remote Signer flow
      await authPage.connectRemoteSignerButton.click()
      await page.waitForTimeout(1000)

      // Switch to Bunker URL tab
      const bunkerUrlTab = page.locator('button:has-text("Bunker URL")')
      await bunkerUrlTab.click()

      // Enter insecure bunker URL (valid hex pubkey but no secret)
      const bunkerUrlInput = page
        .locator('input[placeholder*="bunker://"], textarea[placeholder*="bunker://"]')
        .first()
      await bunkerUrlInput.fill(
        "bunker://0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef?relay=wss://relay.test.com",
      )

      // Click Connect - should be rejected (specifically the submit button in the modal form)
      const connectButton = page.locator('button[type="submit"]:has-text("Connect")')
      await connectButton.click()

      // Wait for security rejection UI
      const securityWarning = page.locator("text=Security Protection")
      await expect(securityWarning).toBeVisible({ timeout: TIMEOUTS.medium })

      // Click "Try Again"
      const tryAgainButton = page.locator('button:has-text("Try Again")')
      await tryAgainButton.click()

      // Should return to the Bunker URL input view
      const bunkerUrlInputAgain = page
        .locator('input[placeholder*="bunker://"], textarea[placeholder*="bunker://"]')
        .first()
      await expect(bunkerUrlInputAgain).toBeVisible({ timeout: TIMEOUTS.short })
    })

    test("should accept bunker URL with valid secret parameter", async ({ page }) => {
      // Note: This test cannot fully complete the connection without a real signer,
      // but it verifies the URL passes initial validation

      // Open Remote Signer flow
      await authPage.connectRemoteSignerButton.click()
      await page.waitForTimeout(1000)

      // Switch to Bunker URL tab
      const bunkerUrlTab = page.locator('button:has-text("Bunker URL")')
      await bunkerUrlTab.click()

      // Enter a bunker URL WITH a secret (32-character hex string)
      const bunkerUrlInput = page
        .locator('input[placeholder*="bunker://"], textarea[placeholder*="bunker://"]')
        .first()
      const secureBunkerUrl =
        "bunker://fa984bd7dbb282f07e16e7ae87b26a2a7b9b90b7246a44771f0cf5ae58018f52?relay=wss://relay.nsec.app&secret=0123456789abcdef0123456789abcdef"
      await bunkerUrlInput.fill(secureBunkerUrl)

      // Click Connect (specifically the submit button in the modal form)
      const connectButton = page.locator('button[type="submit"]:has-text("Connect")')
      await connectButton.click()

      // Should NOT show security rejection - instead should show connecting state
      // or timeout waiting for signer response
      const securityWarning = page.locator("text=Security Protection")

      // Wait a short time - if security rejection doesn't appear, URL passed validation
      await page.waitForTimeout(2000)

      // The security warning should NOT be visible
      const isSecurityWarningVisible = await securityWarning
        .isVisible()
        .catch(() => false)
      expect(isSecurityWarningVisible).toBeFalsy()

      // Instead, we should see a connecting state or the modal still open waiting
      // (the actual connection will fail since the pubkey/secret are fake)
      const connectingState = page.locator("text=Connecting, text=Waiting")
      const modalStillOpen = page.locator('button:has-text("Cancel")')

      const isConnecting = await connectingState
        .first()
        .isVisible()
        .catch(() => false)
      const modalOpen = await modalStillOpen.isVisible().catch(() => false)

      // Either connecting state or modal should be visible (not security rejection)
      expect(isConnecting || modalOpen).toBeTruthy()
    })
  })

  test.describe("Console Security Logging", () => {
    test("should log security rejection in console", async ({ page }) => {
      // Set up console message listener
      const consoleMessages: string[] = []
      page.on("console", (msg) => {
        consoleMessages.push(`[${msg.type()}] ${msg.text()}`)
      })

      // Open Remote Signer flow
      await authPage.connectRemoteSignerButton.click()
      await page.waitForTimeout(1000)

      // Switch to Bunker URL tab
      const bunkerUrlTab = page.locator('button:has-text("Bunker URL")')
      await bunkerUrlTab.click()

      // Enter insecure bunker URL (valid hex pubkey but no secret)
      const bunkerUrlInput = page
        .locator('input[placeholder*="bunker://"], textarea[placeholder*="bunker://"]')
        .first()
      await bunkerUrlInput.fill(
        "bunker://0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef?relay=wss://test.relay",
      )

      // Click Connect (specifically the submit button in the modal form)
      const connectButton = page.locator('button[type="submit"]:has-text("Connect")')
      await connectButton.click()

      // Wait for processing
      await page.waitForTimeout(2000)

      // Check console for security log messages
      const hasSecurityLog = consoleMessages.some(
        (msg) => msg.includes("SECURITY") && msg.includes("no secret"),
      )

      expect(hasSecurityLog).toBeTruthy()
    })
  })

  test.describe("QR Code Flow (App-Initiated)", () => {
    test("should display QR code for scanning by mobile signer", async ({ page }) => {
      // Open Remote Signer flow
      await authPage.connectRemoteSignerButton.click()
      await page.waitForTimeout(1500)

      // Should be on QR code tab by default
      const qrScanTab = page.locator('button:has-text("Scan QR Code")')
      await expect(qrScanTab).toBeVisible({ timeout: TIMEOUTS.short })

      // Should show QR code or waiting state
      const waitingText = page.locator("text=Waiting for connection")
      const qrCanvas = page.locator("canvas")

      const hasWaiting = await waitingText.isVisible().catch(() => false)
      const hasQR = await qrCanvas.isVisible().catch(() => false)

      // Either QR code or waiting message should be visible
      expect(hasWaiting || hasQR).toBeTruthy()
    })

    test("should have option to open in desktop signer", async ({ page }) => {
      // Open Remote Signer flow
      await authPage.connectRemoteSignerButton.click()
      await page.waitForTimeout(1000)

      // Should have "Open in Desktop Signer" button
      const desktopSignerButton = page.locator(
        'button:has-text("Open in Desktop Signer")',
      )
      await expect(desktopSignerButton).toBeVisible({ timeout: TIMEOUTS.short })
    })

    test("should have option to copy connection link", async ({ page }) => {
      // Open Remote Signer flow
      await authPage.connectRemoteSignerButton.click()
      await page.waitForTimeout(1000)

      // Should have "Copy Link" button
      const copyLinkButton = page.locator('button:has-text("Copy Link")')
      await expect(copyLinkButton).toBeVisible({ timeout: TIMEOUTS.short })
    })
  })

  test.describe("Modal UI", () => {
    test("should have tabs for QR Code and Bunker URL", async ({ page }) => {
      // Open Remote Signer flow
      await authPage.connectRemoteSignerButton.click()
      await page.waitForTimeout(1000)

      // Should have both tabs
      const qrCodeTab = page.locator('button:has-text("Scan QR Code")')
      const bunkerUrlTab = page.locator('button:has-text("Bunker URL")')

      await expect(qrCodeTab).toBeVisible({ timeout: TIMEOUTS.short })
      await expect(bunkerUrlTab).toBeVisible()
    })

    test("should be able to cancel the connection flow", async ({ page }) => {
      // Open Remote Signer flow
      await authPage.connectRemoteSignerButton.click()
      await page.waitForTimeout(1000)

      // Should have Cancel button
      const cancelButton = page.locator('button:has-text("Cancel")').first()
      await expect(cancelButton).toBeVisible({ timeout: TIMEOUTS.short })

      // Click Cancel
      await cancelButton.click()

      // Modal should close (verify by checking if the main login buttons are visible again)
      await expect(authPage.connectRemoteSignerButton).toBeVisible({
        timeout: TIMEOUTS.short,
      })
    })

    test("should show instructions for different signer apps", async ({ page }) => {
      // Open Remote Signer flow
      await authPage.connectRemoteSignerButton.click()
      await page.waitForTimeout(1000)

      // Switch to Bunker URL tab
      const bunkerUrlTab = page.locator('button:has-text("Bunker URL")')
      await bunkerUrlTab.click()

      // Should show instructions
      const nsecAppInstructions = page.locator("text=nsec.app:")
      const amberInstructions = page.locator("text=Amber:")

      await expect(nsecAppInstructions).toBeVisible({ timeout: TIMEOUTS.short })
      await expect(amberInstructions).toBeVisible()
    })
  })
})
