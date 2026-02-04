/**
 * Centralized API Configuration
 * 
 * Manages environment switching between production and staging for testing.
 * 
 * Usage:
 * - Import { getApiUrl } and use instead of hardcoded URLs
 * - Use debug panel (tap logo 5 times on signin) to switch environments
 * - Staging uses signet (not real sats)
 * 
 * Staging Documentation: https://dev.blink.sv/self-host/deployment/staging-environment
 */

const ENVIRONMENTS = {
  production: {
    name: 'Production',
    apiUrl: 'https://api.blink.sv/graphql',
    dashboardUrl: 'https://dashboard.blink.sv',
    payUrl: 'https://pay.blink.sv',
    wsUrl: 'wss://ws.blink.sv/graphql',
    lnAddressDomain: 'blink.sv',
    validDomains: ['blink.sv', 'pay.blink.sv', 'galoy.io'],
    description: 'Live environment with real sats'
  },
  staging: {
    name: 'Staging',
    apiUrl: 'https://api.staging.blink.sv/graphql',
    dashboardUrl: 'https://dashboard.staging.blink.sv',
    payUrl: 'https://pay.staging.blink.sv',
    wsUrl: 'wss://ws.staging.blink.sv/graphql',
    lnAddressDomain: 'pay.staging.blink.sv',
    validDomains: ['staging.blink.sv', 'pay.staging.blink.sv'],
    description: 'Test environment with signet (not real sats)'
  }
};

const STORAGE_KEY = 'blink_environment';

/**
 * Get the current environment name
 * @returns {'production' | 'staging'} Current environment
 */
export function getEnvironment() {
  // Server-side: use env var or default to production
  if (typeof window === 'undefined') {
    return process.env.BLINK_ENVIRONMENT || 'production';
  }
  
  // Client-side: check localStorage
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && ENVIRONMENTS[stored]) {
    return stored;
  }
  
  return 'production';
}

/**
 * Set the current environment
 * @param {'production' | 'staging'} env - Environment to switch to
 * @param {boolean} reload - Whether to reload the page after switching (default: true)
 */
export function setEnvironment(env, reload = true) {
  if (!ENVIRONMENTS[env]) {
    console.error(`[API Config] Invalid environment: ${env}`);
    return;
  }
  
  if (typeof window === 'undefined') {
    console.warn('[API Config] Cannot set environment on server-side');
    return;
  }
  
  const currentEnv = getEnvironment();
  if (currentEnv === env) {
    console.log(`[API Config] Already in ${env} environment`);
    return;
  }
  
  console.log(`[API Config] Switching from ${currentEnv} to ${env}`);
  localStorage.setItem(STORAGE_KEY, env);
  
  if (reload) {
    // Clear any cached auth state when switching environments
    // This prevents using production tokens in staging or vice versa
    console.log('[API Config] Clearing auth state for environment switch...');
    
    // Clear Blink-specific auth tokens (but not Nostr identity)
    localStorage.removeItem('blinkpos_api_key');
    localStorage.removeItem('blinkpos_wallet_id');
    localStorage.removeItem('blinkpos_blink_account');
    
    // Reload to apply changes
    window.location.reload();
  }
}

/**
 * Get the current environment's configuration
 * @returns {Object} Environment configuration object
 */
export function getEnvironmentConfig() {
  return ENVIRONMENTS[getEnvironment()];
}

/**
 * Get the API URL for the current environment
 * @returns {string} GraphQL API URL
 */
export function getApiUrl() {
  return getEnvironmentConfig().apiUrl;
}

/**
 * Get the dashboard URL for the current environment
 * @returns {string} Dashboard URL
 */
export function getDashboardUrl() {
  return getEnvironmentConfig().dashboardUrl;
}

/**
 * Get the pay URL for the current environment
 * @returns {string} Pay URL
 */
export function getPayUrl() {
  return getEnvironmentConfig().payUrl;
}

/**
 * Get the WebSocket URL for the current environment
 * @returns {string} WebSocket URL
 */
export function getWsUrl() {
  return getEnvironmentConfig().wsUrl;
}

/**
 * Get the Lightning Address domain for the current environment
 * @returns {string} Lightning Address domain (e.g., 'blink.sv' or 'pay.staging.blink.sv')
 */
export function getLnAddressDomain() {
  return getEnvironmentConfig().lnAddressDomain;
}

/**
 * Get valid Blink domains for the current environment
 * @returns {string[]} Array of valid domain names
 */
export function getValidDomains() {
  return getEnvironmentConfig().validDomains;
}

/**
 * Get all valid Blink domains across all environments
 * Used for accepting both production and staging addresses
 * @returns {string[]} Array of all valid domain names
 */
export function getAllValidDomains() {
  return [
    ...ENVIRONMENTS.production.validDomains,
    ...ENVIRONMENTS.staging.validDomains
  ];
}

/**
 * Check if currently in staging environment
 * @returns {boolean} True if in staging
 */
export function isStaging() {
  return getEnvironment() === 'staging';
}

/**
 * Check if currently in production environment
 * @returns {boolean} True if in production
 */
export function isProduction() {
  return getEnvironment() === 'production';
}

/**
 * Get all available environments (for UI)
 * @returns {Object} All environment configurations
 */
export function getAllEnvironments() {
  return ENVIRONMENTS;
}

/**
 * Get environment display info for UI
 * @returns {Object} Display info for current environment
 */
export function getEnvironmentDisplayInfo() {
  const env = getEnvironment();
  const config = ENVIRONMENTS[env];
  return {
    key: env,
    name: config.name,
    description: config.description,
    isStaging: env === 'staging',
    isProduction: env === 'production'
  };
}

// Log current environment on module load (client-side only)
if (typeof window !== 'undefined') {
  const env = getEnvironment();
  const config = ENVIRONMENTS[env];
  console.log(`[API Config] Environment: ${config.name} (${env})`);
  console.log(`[API Config] API URL: ${config.apiUrl}`);
  
  if (env === 'staging') {
    console.warn('[API Config] ⚠️ STAGING MODE - Using signet, not real sats!');
  }
}

export default {
  getEnvironment,
  setEnvironment,
  getEnvironmentConfig,
  getApiUrl,
  getDashboardUrl,
  getPayUrl,
  getWsUrl,
  getLnAddressDomain,
  getValidDomains,
  getAllValidDomains,
  isStaging,
  isProduction,
  getAllEnvironments,
  getEnvironmentDisplayInfo
};
