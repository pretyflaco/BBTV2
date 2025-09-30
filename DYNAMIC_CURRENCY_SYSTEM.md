# Dynamic Currency System

## Overview

The application now supports **all 71+ fiat currencies** that Blink supports, plus Bitcoin (Satoshis), for a total of 72 display currencies. This is a fully dynamic system that automatically updates when Blink adds new currencies - no code changes required!

## Features

✅ **Automatic Currency Discovery** - Fetches available currencies from Blink API  
✅ **Smart Caching** - Currencies cached in localStorage for 24 hours  
✅ **Dynamic Formatting** - Proper symbols and decimal places for each currency  
✅ **Fallback Support** - Graceful degradation if API is unavailable  
✅ **Real-time Exchange Rates** - Uses Blink's exchange rate API  
✅ **User Preference Sync** - Automatically uses user's Blink display currency preference

## Supported Currencies

The system supports all 71 fiat currencies from Blink:

- **Americas**: USD, CAD, MXN, BRL, ARS, CLP, COP, PEN, BOB, etc.
- **Europe**: EUR, GBP, CHF, SEK, NOK, DKK, PLN, CZK, HUF, etc.
- **Asia-Pacific**: JPY, CNY, INR, KRW, IDR, THB, PHP, VND, etc.
- **Africa**: ZAR, KES, NGN, GHS, TZS, UGX, EGP, MAD, etc.
- **Middle East**: AED, ILS, etc.
- **Plus**: BTC (Satoshis)

See the full list by visiting: http://localhost:3000/api/blink/currency-list

## Architecture

### 1. Currency Data Layer

**API Endpoint**: `/pages/api/blink/currency-list.js`
- Fetches currency metadata from Blink GraphQL API
- Returns: `{ id, symbol, name, flag, fractionDigits }`
- Cached with HTTP headers (1 hour)

**React Hook**: `/lib/hooks/useCurrencies.js`
- Fetches currencies on app load
- Caches in localStorage (24 hours)
- Provides helper functions: `formatAmount()`, `getCurrency()`, `getAllCurrencies()`

### 2. Formatting Layer

**Client-side**: `/lib/currency-utils.js`
- `formatDisplayAmount()` - Main formatting function
- `formatCurrencyAmount()` - Format with currency metadata
- `getCurrencyById()` - Get currency object by ID

**Server-side**: `/lib/currency-formatter-server.js`
- `formatCurrencyServer()` - Standalone formatter for API routes
- Contains hardcoded symbols as fallback
- Handles all 71+ currencies

### 3. Component Integration

**Dashboard** (`/components/Dashboard.js`)
- Uses `useCurrencies()` hook
- Dynamic dropdown with all currencies
- Passes currency data to child components

**POS** (`/components/POS.js`)
- Receives currencies as prop
- Dynamic amount formatting
- Works with any Blink-supported currency

**API Routes** (`/pages/api/blink/forward-with-tips.js`)
- Uses server-side formatter
- Dynamic memo formatting for tips

## Usage Examples

### Client-Side (React Components)

```javascript
import { useCurrencies } from '../lib/hooks/useCurrencies';
import { formatDisplayAmount } from '../lib/currency-utils';

function MyComponent() {
  const { currencies, formatAmount, getAllCurrencies } = useCurrencies();
  
  // Format an amount
  const formatted = formatAmount(100.50, 'EUR');
  // Returns: "€100.50"
  
  // Get all currencies for dropdown
  const allCurrencies = getAllCurrencies();
  // Returns: [{ id: 'BTC', name: 'Bitcoin', ... }, { id: 'USD', ... }, ...]
  
  return (
    <select>
      {allCurrencies.map(c => (
        <option key={c.id} value={c.id}>
          {c.flag} {c.id} - {c.name}
        </option>
      ))}
    </select>
  );
}
```

### Server-Side (API Routes)

```javascript
const { formatCurrencyServer } = require('../../../lib/currency-formatter-server');

export default async function handler(req, res) {
  const amount = 1234.56;
  const currency = 'ZAR';
  
  const formatted = formatCurrencyServer(amount, currency);
  // Returns: "R1234.56"
  
  res.json({ formatted });
}
```

## Currency Formatting Rules

1. **Symbol Placement**:
   - Single-character symbols (e.g., $, €, £): `symbol + amount` → `$100.50`
   - Multi-character symbols (e.g., KSh, Rs): `symbol + space + amount` → `KSh 150.00`

2. **Decimal Places**:
   - Most currencies: 2 decimals
   - Zero-decimal currencies (JPY, KRW, VND, etc.): 0 decimals
   - BTC: 0 decimals, shows as "sats"

3. **Special Cases**:
   - BTC displays as: `100,000 sats` (with thousands separator)
   - Fallback for unknown currencies: `123.45 XXX`

## Caching Strategy

1. **Currency List**:
   - Cached in localStorage for 24 hours
   - Fetched from `/api/blink/currency-list` on first load
   - Automatic refresh after expiry

2. **Exchange Rates**:
   - Fetched on-demand when currency changes
   - Not cached (to ensure real-time accuracy)
   - Requested from `/api/blink/exchange-rate`

## Migration from Old System

### Before (Hardcoded)
```javascript
if (currency === 'USD') {
  return `$${amount.toFixed(2)}`;
} else if (currency === 'KES') {
  return `KSh ${amount.toFixed(2)}`;
} else if (currency === 'ZAR') {
  return `R ${amount.toFixed(2)}`;
}
```

### After (Dynamic)
```javascript
return formatDisplayAmount(amount, currency, currencies);
```

## Testing

Test the currency system:

```bash
# Test currency API
curl http://localhost:3000/api/blink/currency-list | jq

# Test formatting in Node.js
node -e "
const { formatCurrencyServer } = require('./lib/currency-formatter-server');
console.log('EUR:', formatCurrencyServer(100, 'EUR'));
console.log('JPY:', formatCurrencyServer(10000, 'JPY'));
console.log('INR:', formatCurrencyServer(8350, 'INR'));
"
```

## Benefits

1. **Zero Maintenance** - New currencies added by Blink work automatically
2. **Proper Formatting** - Uses correct symbols and decimal places per currency
3. **User-Friendly** - Shows flag emojis and full currency names
4. **Performance** - Efficient caching minimizes API calls
5. **Resilient** - Fallback formatting if metadata unavailable

## Future Enhancements

- [ ] Currency search/filter in dropdown
- [ ] Popular currencies section (pinned to top)
- [ ] Currency conversion history chart
- [ ] Custom currency symbol overrides (if needed)

## Files Modified

- `lib/currency-utils.js` - **NEW** - Client-side currency utilities
- `lib/currency-formatter-server.js` - **NEW** - Server-side formatter
- `lib/hooks/useCurrencies.js` - **NEW** - React hook for currencies
- `pages/api/blink/currency-list.js` - **NEW** - Currency API endpoint
- `components/Dashboard.js` - Updated to use dynamic currencies
- `components/POS.js` - Updated to use dynamic formatting
- `pages/api/blink/forward-with-tips.js` - Updated to use dynamic formatting
- `pages/api/auth/login.js` - Removed currency whitelist

## Support

All Blink-supported currencies are now available! If you encounter formatting issues with a specific currency, check the `CURRENCY_SYMBOLS` mapping in `lib/currency-formatter-server.js` and add/update the symbol if needed.
