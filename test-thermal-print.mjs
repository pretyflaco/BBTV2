#!/usr/bin/env node
/**
 * ESC/POS Thermal Printer Test Script
 * 
 * Tests the ESCPOSBuilder and VoucherReceipt by sending directly to a printer.
 * 
 * Usage:
 *   node test-thermal-print.js [device]
 * 
 * Examples:
 *   node test-thermal-print.js /dev/rfcomm0        # Bluetooth on Linux
 *   node test-thermal-print.js /dev/usb/lp0        # USB on Linux
 *   node test-thermal-print.js /dev/ttyUSB0        # USB-Serial on Linux
 */

import fs from 'fs';
import ESCPOSBuilder from './lib/escpos/ESCPOSBuilder.js';
import VoucherReceipt from './lib/escpos/VoucherReceipt.js';

// Default device - adjust for your setup
const device = process.argv[2] || '/dev/rfcomm0';

// Test voucher data
const testVoucher = {
  lnurl: 'LNURL1DP68GURN8GHJ7MRWW4EXCTNXD9SHG6NPVCHXXMMD9AKXUATJDSKHW6T5DPJ8YCTH8AEK2UMND9HKU0FKVESNZWP3X5UNWWF5XSEK2DPEXGMNJV35XVMKYV35VVNXYVE3VDNRXV3JX5MXXW34V9SNVD33VYMNXC33VVEXGCE4XCU',
  satsAmount: 5000,
  displayAmount: 100,
  displayCurrency: 'KES',
  voucherSecret: 'q6pvY79EftnZ',
  identifierCode: 'A1B2C3D4',
  commissionPercent: 2,
  expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
  issuedBy: 'testuser',
};

async function testBasicPrint() {
  console.log('🖨️  ESC/POS Thermal Print Test');
  console.log('================================');
  console.log(`Device: ${device}`);
  console.log('');

  // Check if device exists
  if (!fs.existsSync(device)) {
    console.error(`❌ Device not found: ${device}`);
    console.log('');
    console.log('Available options:');
    console.log('  Bluetooth: /dev/rfcomm0 (need to pair first)');
    console.log('  USB:       /dev/usb/lp0 or /dev/ttyUSB0');
    console.log('');
    console.log('To set up Bluetooth on Linux:');
    console.log('  1. bluetoothctl');
    console.log('  2. scan on');
    console.log('  3. pair <MAC_ADDRESS>');
    console.log('  4. trust <MAC_ADDRESS>');
    console.log('  5. sudo rfcomm bind 0 <MAC_ADDRESS>');
    process.exit(1);
  }

  try {
    // Test 1: Basic ESC/POS commands
    console.log('Test 1: Basic text printing...');
    const basic = new ESCPOSBuilder({ paperWidth: 80 });
    basic
      .initialize()
      .align('center')
      .bold(true)
      .textSize(2, 2)
      .line('BLINK')
      .textSize(1, 1)
      .bold(false)
      .line('ESC/POS Test Print')
      .emptyLines(1)
      .dashedLine()
      .align('left')
      .labelValue('Status:', 'Working!', { labelWidth: 12 })
      .labelValue('Date:', new Date().toLocaleDateString(), { labelWidth: 12 })
      .labelValue('Time:', new Date().toLocaleTimeString(), { labelWidth: 12 })
      .dashedLine()
      .emptyLines(1)
      .align('center')
      .line('Basic test complete')
      .feed(4);

    const basicData = basic.build();
    fs.writeFileSync(device, Buffer.from(basicData));
    console.log(`✅ Basic test sent (${basicData.length} bytes)`);

    // Wait a moment
    await sleep(2000);

    // Test 2: Full voucher receipt
    console.log('');
    console.log('Test 2: Full voucher receipt...');
    const receipt = new VoucherReceipt({ paperWidth: 80 });
    receipt.build(testVoucher);
    
    const receiptData = receipt.getBytes();
    fs.writeFileSync(device, Buffer.from(receiptData));
    console.log(`✅ Voucher receipt sent (${receiptData.length} bytes)`);

    console.log('');
    console.log('================================');
    console.log('✅ All tests complete!');
    console.log('');
    console.log('Check your thermal printer for output.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'EACCES') {
      console.log('');
      console.log('Permission denied. Try:');
      console.log(`  sudo chmod 666 ${device}`);
      console.log('  OR');
      console.log('  sudo usermod -a -G dialout $USER');
      console.log('  (then log out and back in)');
    }
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the test
testBasicPrint();
