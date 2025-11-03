#!/usr/bin/env node

/**
 * Test script for Hybrid Storage
 * 
 * This script validates that the hybrid storage implementation is correct
 * and provides guidance for manual testing.
 * 
 * Usage: node scripts/test-hybrid-storage.js
 */

const fs = require('fs');
const path = require('path');

console.log('\n🧪 BlinkPOS Hybrid Storage Test Suite');
console.log('═'.repeat(60));

let allTestsPassed = true;

/**
 * Test 1: Check if all required files exist
 */
function testFilesExist() {
  console.log('\n📁 Test 1: Checking required files...');
  
  const requiredFiles = [
    'docker-compose.yml',
    'database/init.sql',
    'lib/storage/hybrid-store.js',
    'scripts/migrate-to-hybrid.js',
    '.env.local.example',
    'HYBRID_STORAGE_QUICKSTART.md'
  ];

  let passed = true;
  
  for (const file of requiredFiles) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      console.log(`  ✅ ${file}`);
    } else {
      console.log(`  ❌ ${file} (missing)`);
      passed = false;
    }
  }

  if (passed) {
    console.log('  ✅ All required files exist');
  } else {
    console.log('  ❌ Some files are missing');
    allTestsPassed = false;
  }
  
  return passed;
}

/**
 * Test 2: Validate hybrid-store.js structure
 */
function testHybridStoreStructure() {
  console.log('\n🔍 Test 2: Validating hybrid-store.js structure...');
  
  const storePath = path.join(process.cwd(), 'lib/storage/hybrid-store.js');
  
  if (!fs.existsSync(storePath)) {
    console.log('  ❌ hybrid-store.js not found');
    allTestsPassed = false;
    return false;
  }

  const content = fs.readFileSync(storePath, 'utf8');
  
  const requiredMethods = [
    'connect',
    'disconnect',
    'storeTipData',
    'getTipData',
    'updatePaymentStatus',
    'removeTipData',
    'logEvent',
    'getStats',
    'healthCheck'
  ];

  let passed = true;
  
  for (const method of requiredMethods) {
    if (content.includes(`async ${method}(`) || content.includes(`${method}() {`)) {
      console.log(`  ✅ Method: ${method}()`);
    } else {
      console.log(`  ❌ Method: ${method}() (missing)`);
      passed = false;
    }
  }

  // Check for Redis and PostgreSQL imports
  if (content.includes("require('redis')")) {
    console.log('  ✅ Redis client imported');
  } else {
    console.log('  ❌ Redis client not imported');
    passed = false;
  }

  if (content.includes("require('pg')")) {
    console.log('  ✅ PostgreSQL client imported');
  } else {
    console.log('  ❌ PostgreSQL client not imported');
    passed = false;
  }

  if (passed) {
    console.log('  ✅ hybrid-store.js structure is valid');
  } else {
    console.log('  ❌ hybrid-store.js structure has issues');
    allTestsPassed = false;
  }
  
  return passed;
}

/**
 * Test 3: Check API endpoint updates
 */
function testAPIEndpoints() {
  console.log('\n🔌 Test 3: Checking API endpoint updates...');
  
  const endpoints = [
    'pages/api/blink/create-invoice.js',
    'pages/api/blink/forward-with-tips.js'
  ];

  let passed = true;
  
  for (const endpoint of endpoints) {
    const filePath = path.join(process.cwd(), endpoint);
    
    if (!fs.existsSync(filePath)) {
      console.log(`  ❌ ${endpoint} (not found)`);
      passed = false;
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check if using hybrid store
    if (content.includes('getHybridStore')) {
      console.log(`  ✅ ${endpoint} (uses hybrid storage)`);
    } else if (content.includes('tipStore')) {
      console.log(`  ⚠️  ${endpoint} (still uses old tipStore - needs update)`);
      passed = false;
    } else {
      console.log(`  ❓ ${endpoint} (unclear storage method)`);
      passed = false;
    }
  }

  if (passed) {
    console.log('  ✅ All API endpoints updated');
  } else {
    console.log('  ❌ Some API endpoints need updating');
    allTestsPassed = false;
  }
  
  return passed;
}

/**
 * Test 4: Validate database schema
 */
function testDatabaseSchema() {
  console.log('\n🗄️  Test 4: Validating database schema...');
  
  const schemaPath = path.join(process.cwd(), 'database/init.sql');
  
  if (!fs.existsSync(schemaPath)) {
    console.log('  ❌ init.sql not found');
    allTestsPassed = false;
    return false;
  }

  const content = fs.readFileSync(schemaPath, 'utf8');
  
  const requiredTables = [
    'payment_splits',
    'payment_events',
    'tip_recipient_stats',
    'system_metrics'
  ];

  const requiredViews = [
    'active_payments',
    'payment_statistics',
    'top_tip_recipients'
  ];

  let passed = true;
  
  console.log('  Tables:');
  for (const table of requiredTables) {
    if (content.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) {
      console.log(`    ✅ ${table}`);
    } else {
      console.log(`    ❌ ${table} (missing)`);
      passed = false;
    }
  }

  console.log('  Views:');
  for (const view of requiredViews) {
    if (content.includes(`CREATE OR REPLACE VIEW ${view}`)) {
      console.log(`    ✅ ${view}`);
    } else {
      console.log(`    ❌ ${view} (missing)`);
      passed = false;
    }
  }

  if (passed) {
    console.log('  ✅ Database schema is complete');
  } else {
    console.log('  ❌ Database schema has issues');
    allTestsPassed = false;
  }
  
  return passed;
}

/**
 * Test 5: Check package.json dependencies
 */
function testDependencies() {
  console.log('\n📦 Test 5: Checking dependencies...');
  
  const packagePath = path.join(process.cwd(), 'package.json');
  
  if (!fs.existsSync(packagePath)) {
    console.log('  ❌ package.json not found');
    allTestsPassed = false;
    return false;
  }

  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const dependencies = packageJson.dependencies || {};

  const requiredDeps = ['redis', 'pg'];
  let passed = true;

  for (const dep of requiredDeps) {
    if (dependencies[dep]) {
      console.log(`  ✅ ${dep} (${dependencies[dep]})`);
    } else {
      console.log(`  ❌ ${dep} (not installed)`);
      passed = false;
    }
  }

  if (passed) {
    console.log('  ✅ All required dependencies installed');
  } else {
    console.log('  ❌ Some dependencies missing');
    console.log('  Run: npm install --save redis pg');
    allTestsPassed = false;
  }
  
  return passed;
}

/**
 * Print manual testing instructions
 */
function printManualTestingInstructions() {
  console.log('\n📋 Manual Testing Instructions');
  console.log('═'.repeat(60));
  console.log(`
To complete the testing process, you need to:

1. **Fix Docker Compose Installation** (if needed):
   - Install Docker Compose: https://docs.docker.com/compose/install/
   - Or use Docker Desktop which includes Compose

2. **Start Infrastructure**:
   $ docker-compose up -d

3. **Verify Containers**:
   $ docker-compose ps
   # Should show: redis, postgres, redis-commander, pgadmin

4. **Check Database Initialization**:
   $ docker exec -it blinkpos-postgres psql -U blinkpos -d blinkpos -c "\\dt"
   # Should list: payment_splits, payment_events, etc.

5. **Test Connection in Code**:
   $ node -e "const {HybridStore} = require('./lib/storage/hybrid-store'); const store = new HybridStore(); store.connect().then(() => console.log('Connected!')).catch(console.error);"

6. **Start Application**:
   $ npm run dev
   # Check logs for: "✅ Redis connected" and "✅ PostgreSQL connected"

7. **Create Test Payment**:
   - Open http://localhost:3000
   - Create an invoice with a tip
   - Check Redis: $ docker exec -it blinkpos-redis redis-cli KEYS "blinkpos:payment:*"
   - Check PostgreSQL: $ docker exec -it blinkpos-postgres psql -U blinkpos -d blinkpos -c "SELECT * FROM payment_splits;"

8. **Migrate Existing Data** (if applicable):
   $ node scripts/migrate-to-hybrid.js --dry-run
   $ node scripts/migrate-to-hybrid.js --backup

See HYBRID_STORAGE_QUICKSTART.md for detailed instructions.
`);
}

/**
 * Main test runner
 */
function main() {
  testFilesExist();
  testHybridStoreStructure();
  testAPIEndpoints();
  testDatabaseSchema();
  testDependencies();
  
  printManualTestingInstructions();
  
  console.log('\n═'.repeat(60));
  if (allTestsPassed) {
    console.log('✅ All automated tests passed!');
    console.log('   Follow manual testing instructions above to complete setup.');
    console.log('═'.repeat(60) + '\n');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Please fix the issues above.');
    console.log('═'.repeat(60) + '\n');
    process.exit(1);
  }
}

// Run tests
main();

