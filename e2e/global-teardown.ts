/**
 * Global teardown for E2E tests
 * Runs once after all tests complete
 */

import { FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('\n🧹 E2E test suite complete');
  console.log('📊 Check e2e/reports/ for detailed results\n');
}

export default globalTeardown;
