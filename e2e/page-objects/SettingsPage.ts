import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { SELECTORS, TIMEOUTS, TEST_CREDENTIALS } from '../fixtures/test-data';

/**
 * Page object for the Settings page
 */
export class SettingsPage extends BasePage {
  readonly container: Locator;
  readonly blinkAccountSection: Locator;
  readonly apiKeyInput: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    super(page);
    this.container = page.locator(SELECTORS.settings.container);
    this.blinkAccountSection = page.locator(SELECTORS.settings.blinkAccountSection);
    this.apiKeyInput = page.locator(SELECTORS.settings.apiKeyInput);
    this.saveButton = page.locator(SELECTORS.settings.saveButton);
  }

  /**
   * Navigate to settings page
   */
  async goto() {
    await super.goto('/settings');
    await this.waitForLoad();
  }

  /**
   * Navigate to settings from dashboard
   */
  async gotoFromDashboard() {
    const settingsButton = this.page.locator(SELECTORS.dashboard.settingsButton);
    await settingsButton.click();
    await this.container.waitFor({ state: 'visible', timeout: TIMEOUTS.medium });
  }

  /**
   * Enter Blink API key
   */
  async enterApiKey(apiKey: string = TEST_CREDENTIALS.apiKeys.readReceiveWrite) {
    await this.apiKeyInput.waitFor({ state: 'visible', timeout: TIMEOUTS.medium });
    await this.apiKeyInput.fill(apiKey);
  }

  /**
   * Save settings
   */
  async saveSettings() {
    await this.saveButton.click();
    await this.waitForLoadingComplete();
  }

  /**
   * Setup Blink account with API key
   */
  async setupBlinkAccount(apiKey: string = TEST_CREDENTIALS.apiKeys.readReceiveWrite) {
    await this.enterApiKey(apiKey);
    await this.saveSettings();
    
    // Wait for success indication
    await expect(this.successMessage).toBeVisible({ timeout: TIMEOUTS.medium });
  }

  /**
   * Check if Blink account is connected
   */
  async isBlinkAccountConnected(): Promise<boolean> {
    // Look for connected indicator
    const connectedIndicator = this.page.locator('[data-testid="blink-connected"]');
    try {
      await connectedIndicator.waitFor({ state: 'visible', timeout: TIMEOUTS.short });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current API key (masked or partial)
   */
  async getCurrentApiKey(): Promise<string> {
    return await this.apiKeyInput.inputValue();
  }

  /**
   * Clear API key / disconnect Blink account
   */
  async disconnectBlinkAccount() {
    const disconnectButton = this.page.locator('[data-testid="disconnect-blink"]');
    if (await disconnectButton.isVisible()) {
      await disconnectButton.click();
      await this.page.waitForTimeout(500);
    }
  }

  /**
   * Check if settings page is displayed
   */
  async isSettingsPageVisible(): Promise<boolean> {
    try {
      await this.container.waitFor({ state: 'visible', timeout: TIMEOUTS.short });
      return true;
    } catch {
      return false;
    }
  }
}
