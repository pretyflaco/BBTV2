/**
 * Global setup for E2E tests
 * Runs once before all tests
 */

import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('\n🚀 Starting E2E test suite...');
  console.log('📍 Using staging environment for tests');
  
  // Verify staging API is accessible
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // Check staging API health
    const response = await page.request.post('https://api.staging.blink.sv/graphql', {
      data: {
        query: `{ globals { network } }`,
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok()) {
      const data = await response.json();
      console.log(`✅ Staging API is accessible (network: ${data.data?.globals?.network || 'unknown'})`);
    } else {
      console.warn('⚠️ Staging API returned non-OK status:', response.status());
    }
  } catch (error) {
    console.warn('⚠️ Could not verify staging API:', error);
  } finally {
    await browser.close();
  }
  
  console.log('✅ Global setup complete\n');
}

export default globalSetup;
