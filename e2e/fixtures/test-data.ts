/**
 * Test fixtures and constants for E2E tests
 */

// Staging environment test credentials
export const TEST_CREDENTIALS = {
  // API Keys for staging environment
  apiKeys: {
    readReceiveWrite: 'galoy_staging_J0cSDXNLfKDuVU1ctmtA8m16UO8JlJkJzaax7aF7oaThUQyp01nZXuDtmG8H6nIt',
    readReceive: 'galoy_staging_taj9Io3ho67xNOy3hXFNcl87mFgINjKFY8e88wWUQUi2tFBaUU7ZLwX4ElGs1g6S',
  },
  
  // Test Nostr account
  nostr: {
    nsec: 'nsec12y0mznqqht00jwp3ve9p8qjpqzmxuqezldz57hkkep54ysjxzrgqjq0faw',
    npub: 'npub180qjfgtzhyx3a7ppwgc46t29l8dkzdnktxjzlefa9tq8m9acxeess2cyry',
  },
};

// Test data for various scenarios
export const TEST_DATA = {
  // Payment amounts for testing
  amounts: {
    small: 100, // 100 sats
    medium: 1000, // 1,000 sats
    large: 10000, // 10,000 sats
    testSats: 21, // 21 sats - standard test amount for BTC mode
    testUsdCents: 21, // 21 cents ($0.21) - standard test amount for USD mode
  },
  
  // Test Lightning addresses
  lightningAddresses: {
    valid: 'test@blink.sv',
    invalid: 'invalid-address',
    // Recipient for payment tests - this is a colleague's account, NOT the test account
    testRecipient: 'test@pay.staging.blink.sv',
  },
  
  // Test currency codes
  currencies: {
    btc: 'BTC',
    usd: 'USD',
  },
  
  // Test usernames for public POS
  usernames: {
    staging: 'test', // Valid staging test username
  },
  
  // Test account info (for authenticated tests)
  testAccount: {
    username: 'e2e-test', // Staging test account username
  },
};

// Selectors using data-testid attributes
export const SELECTORS = {
  // Auth page selectors
  auth: {
    loginForm: '[data-testid="login-form"]',
    nsecInput: '[data-testid="nsec-input"]',
    loginButton: '[data-testid="login-button"]',
    debugPanel: '[data-testid="debug-panel"]',
    stagingToggle: '[data-testid="staging-toggle"]',
    productionToggle: '[data-testid="production-toggle"]',
  },
  
  // POS/Numpad selectors
  pos: {
    numpad: '[data-testid="numpad"]',
    numpadButton: (digit: string) => `[data-testid="numpad-${digit}"]`,
    amountDisplay: '[data-testid="amount-display"]',
    currencyToggle: '[data-testid="currency-toggle"]',
    generateInvoice: '[data-testid="generate-invoice"]',
    clearButton: '[data-testid="clear-button"]',
  },
  
  // Invoice display selectors
  invoice: {
    container: '[data-testid="invoice-container"]',
    qrCode: '[data-testid="invoice-qr"]',
    copyButton: '[data-testid="copy-invoice"]',
    amount: '[data-testid="invoice-amount"]',
    status: '[data-testid="invoice-status"]',
  },
  
  // Dashboard selectors
  dashboard: {
    container: '[data-testid="dashboard"]',
    balanceDisplay: '[data-testid="balance-display"]',
    transactionList: '[data-testid="transaction-list"]',
    settingsButton: '[data-testid="settings-button"]',
  },
  
  // Settings selectors
  settings: {
    container: '[data-testid="settings-container"]',
    blinkAccountSection: '[data-testid="blink-account-section"]',
    apiKeyInput: '[data-testid="api-key-input"]',
    saveButton: '[data-testid="save-settings"]',
  },
  
  // Common selectors
  common: {
    loadingSpinner: '[data-testid="loading"]',
    errorMessage: '[data-testid="error-message"]',
    successMessage: '[data-testid="success-message"]',
    stagingBanner: '[data-testid="staging-banner"]',
  },
};

// API endpoints
export const API_ENDPOINTS = {
  staging: 'https://api.staging.blink.sv/graphql',
  production: 'https://api.blink.sv/graphql',
};

// Timeouts
export const TIMEOUTS = {
  short: 5000,
  medium: 10000,
  long: 30000,
  invoice: 60000, // Longer timeout for invoice-related operations
  balanceUpdate: 10000, // Timeout for balance update polling after transaction
};

// Balance polling interval
export const POLLING = {
  balanceIntervalMs: 1000, // Poll every second
  maxAttempts: 10, // Max polling attempts (10 seconds with 1s interval)
};
