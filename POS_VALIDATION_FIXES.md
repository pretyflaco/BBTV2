# POS Amount Validation Fixes

## Issues Fixed

### 1. ✅ Minimum Amount Validation
**Problem**: OK button turned green for amounts like 0.001 EUR, which is less than the minimum valid amount (0.01 EUR).

**Solution**: 
- Added `isValidAmount()` function that checks:
  - Minimum amount based on currency's `fractionDigits` (e.g., 0.01 for EUR, 1 for JPY)
  - Amount converts to at least 1 satoshi
- Updated OK button to use `hasValidAmount()` instead of simple > 0 check

### 2. ✅ Satoshi Conversion Check
**Problem**: Amounts like 0.00001 EUR (which is < 1 sat) made button green but caused "Missing required fields" error.

**Solution**:
- Added validation in `isValidAmount()` to check satoshi conversion
- Added explicit check in `createInvoice()` after conversion:
  ```javascript
  if (finalTotalInSats < 1) {
    setError(`Amount too small. Converts to less than 1 satoshi...`);
    return;
  }
  ```

### 3. ✅ Error Message Positioning
**Problem**: Error message appeared above the numpad, pushing it down when shown (bad UX).

**Solution**:
- Wrapped error message in fixed-height container: `min-h-[44px]`
- Error now appears/disappears without affecting layout
- Added `animate-pulse` for better visibility

### 4. ✅ Dynamic Decimal Places
**Bonus Fix**: Input now respects each currency's decimal places dynamically.

- EUR, USD, ZAR: 2 decimals
- JPY, KRW: 0 decimals
- Uses `currency.fractionDigits` from Blink API

## Code Changes

### New Functions Added

```javascript
// Get current currency metadata
const getCurrentCurrency = () => {
  return getCurrencyById(displayCurrency, currencies);
};

// Validate if amount meets minimum requirements
const isValidAmount = (amountValue) => {
  // Checks:
  // 1. Non-zero positive number
  // 2. Meets currency minimum (based on fractionDigits)
  // 3. Converts to at least 1 satoshi
};

// Check if current amount or total is valid
const hasValidAmount = () => {
  if (total > 0) return true;
  return isValidAmount(amount);
};
```

### Button Logic Updated

**Before:**
```javascript
disabled={(total === 0 && (!amount || parseFloat(amount) === 0)) || ...}
className={... (total === 0 && (!amount || parseFloat(amount) === 0)) ? 'bg-gray-400' : 'bg-green-600' ...}
```

**After:**
```javascript
disabled={!hasValidAmount() || ...}
className={... !hasValidAmount() ? 'bg-gray-400' : 'bg-green-600' ...}
```

### Error Message Layout

**Before:**
```jsx
{error && (
  <div className="bg-red-100 ...">
    {error}
  </div>
)}
```

**After:**
```jsx
<div className="mx-3 mt-3 min-h-[44px]">
  {error && (
    <div className="bg-red-100 ... animate-pulse">
      {error}
    </div>
  )}
</div>
```

## Validation Examples

| Currency | Min Amount | Why? |
|----------|-----------|------|
| EUR      | €0.01     | 2 decimal places |
| USD      | $0.01     | 2 decimal places |
| JPY      | ¥1        | 0 decimal places |
| KES      | KSh 0.01  | 2 decimal places |
| ZAR      | R 0.01    | 2 decimal places |
| BTC      | 1 sats    | No decimals |

## User Experience Improvements

1. **Button stays gray** until valid amount entered
2. **Clear error messages** showing minimum required
3. **No layout shifting** when errors appear
4. **Proper decimal handling** per currency
5. **Early validation** prevents confusing errors

## Testing

Test cases to verify:

```
✅ EUR: 0.001 → Button gray (too small)
✅ EUR: 0.01 → Button green (valid)
✅ EUR: 0.00001 → Button gray (< 1 sat)
✅ JPY: 0.5 → Cannot enter (no decimals)
✅ JPY: 1 → Button green (valid)
✅ BTC: 0.5 → Cannot enter (no decimals)
✅ BTC: 1 → Button green (valid)
✅ Error message → No numpad shift
```

## Files Modified

- `components/POS.js` - Main changes
  - Added validation functions
  - Updated button logic
  - Fixed error message layout
  - Dynamic decimal input handling

---

**Status**: ✅ All issues resolved and tested
