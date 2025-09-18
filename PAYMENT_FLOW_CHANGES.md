# Payment Flow Changes - BlinkPOS Integration

## Overview
The BLINK Balance Tracker V2 application has been updated to implement a new payment flow where all POS payments are collected through a special "blinkpos" account before being forwarded to the user's account.

## Changes Implemented

### 1. Environment Configuration
- **File**: `.env` (LOCAL ONLY - DO NOT PUSH TO GITHUB)
- **Purpose**: Stores secure BlinkPOS credentials
- **Contents**:
  - `BLINKPOS_API_KEY`: API key for the blinkpos account with READ, RECEIVE, WRITE scopes
  - `BLINKPOS_BTC_WALLET_ID`: BTC wallet ID for the blinkpos account

### 2. Invoice Generation Changes
- **File**: `pages/api/blink/create-invoice.js`
- **Changes**:
  - Now uses BlinkPOS credentials instead of user credentials
  - All invoices are created on the BlinkPOS BTC wallet
  - Stores user's API key and wallet ID for payment forwarding
  - Enhanced error handling for BlinkPOS configuration

### 3. Payment Forwarding System
- **New File**: `pages/api/blink/forward-payment.js`
- **Purpose**: Forwards payments from BlinkPOS to user accounts
- **Process**:
  1. Creates an invoice from the user's account for the received amount
  2. Pays the user's invoice from the BlinkPOS account
  3. Implements intraledger transaction as specified in [Blink API docs](https://dev.blink.sv/api/btc-ln-send#pay-a-lightning-invoice)

### 4. Payment Monitoring
- **New File**: `pages/api/blink/check-blinkpos-payments.js`
- **Purpose**: Monitors BlinkPOS account for new payments
- **Features**:
  - Checks for recent RECEIVE transactions
  - Automatically triggers payment forwarding
  - Prevents duplicate processing
  - Memory-efficient with automatic cleanup

### 5. Frontend Integration
- **File**: `lib/hooks/usePaymentForwarding.js`
- **Purpose**: React hook for monitoring payment forwarding
- **Features**:
  - Polls payment checking API every 5 seconds
  - Triggers UI updates when payments are forwarded
  - Provides manual trigger function

### 6. Updated API Library
- **File**: `lib/blink-api.js`
- **Changes**: Added `payLnInvoice()` method for paying Lightning invoices

### 7. Dashboard Integration
- **File**: `components/Dashboard.js`
- **Changes**: 
  - Integrated payment forwarding hook
  - Added automatic data refresh on forwarded payments

### 8. POS Component Updates
- **File**: `components/POS.js`
- **Changes**: Updated to pass user wallet ID for payment forwarding

## New Payment Flow

### Before (Original Flow)
1. User enters API key
2. POS creates invoice using user's API key on user's wallet
3. Payment goes directly to user's account

### After (New Flow)
1. User enters API key (still required for forwarding)
2. POS creates invoice using BlinkPOS API key on BlinkPOS wallet
3. Payment goes to BlinkPOS account
4. System detects payment in BlinkPOS account
5. System creates invoice from user's account
6. System pays user's invoice from BlinkPOS account
7. Payment ends up in user's account (forwarded via intraledger transaction)

## Security Considerations

- BlinkPOS API key is stored in `.env` file (not tracked by Git)
- Environment variables are only accessible server-side
- User API keys are still required and validated for forwarding
- All forwarding operations are logged for debugging

## Testing

The implementation has been tested with:
- ✅ Invoice creation using BlinkPOS credentials
- ✅ API endpoint functionality
- ✅ Environment variable loading
- ✅ Development server integration

To fully test the complete flow:
1. Log in with a real Blink account
2. Create a POS invoice
3. Pay the invoice with a Lightning wallet
4. Observe automatic forwarding to user account (check console logs)

## Development Notes

- All changes are for local development only
- The `.env` file must never be committed to Git
- Payment forwarding runs every 5 seconds when POS is active
- Console logs provide detailed information about the forwarding process

## API Endpoints Added

1. `POST /api/blink/forward-payment` - Forwards payment from BlinkPOS to user
2. `POST /api/blink/check-blinkpos-payments` - Checks for new BlinkPOS payments

## Files Modified

- `components/Dashboard.js` - Integrated payment forwarding
- `components/POS.js` - Updated to pass user wallet info
- `pages/api/blink/create-invoice.js` - Uses BlinkPOS credentials
- `lib/blink-api.js` - Added payment functionality

## Files Added

- `.env` - BlinkPOS credentials (LOCAL ONLY)
- `pages/api/blink/forward-payment.js` - Payment forwarding API
- `pages/api/blink/check-blinkpos-payments.js` - Payment monitoring API
- `lib/hooks/usePaymentForwarding.js` - React hook for payment monitoring
