# BlinkPOS Development Insights

## Overview
This document captures key insights, challenges, and solutions discovered during the development of the BlinkPOS tipping system. This serves as a reference to avoid repeating struggles in future development sessions.

## 🎯 Tip System Architecture

### Core Components
1. **BlinkPOS Account**: Special account that receives all payments initially
2. **User Account**: Final destination for the base payment amount
3. **Employee Account**: Lightning Address recipient for tips (e.g., `elturco@blink.sv`)
4. **Tip Store**: Persistent storage for tip metadata during payment processing

### Payment Flow
```
Customer Payment (110 sats) → BlinkPOS Account
                               ↓
                        Payment Splitting:
                         ↓              ↓
                   User Account      Employee LN Address
                    (100 sats)         (10 sats tip)
```

## 🚨 Critical Issues & Solutions

### 1. **Tip Store Persistence in Development**
**Problem**: Tip data was being lost during Next.js development recompilations.
```
💾 Stored tip data for payment: [hash]
wait - compiling /api/blink/forward-with-tips...  // <-- TIP STORE RESET HERE
❌ No tip data found for payment hash: [hash]     // <-- Store is empty
```

**Root Cause**: In-memory Map gets reset every time API routes are recompiled.

**Solution**: File-based persistence with `.tip-store.json`
```javascript
// lib/tip-store.js
class TipStore {
  constructor() {
    this.tipData = new Map();
    this.loadFromFile(); // Load persisted data
  }
  
  saveToFile() {
    const data = Object.fromEntries(this.tipData);
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
  }
}
```

### 2. **React State Timing Issues**
**Problem**: Tip overlay showed, user selected percentage, but invoice was created without tip amount.
```javascript
// What was happening:
setSelectedTipPercent(10);     // Async state update
createInvoice(true);           // Called immediately - still sees selectedTipPercent: 0
```

**Root Cause**: React state updates are asynchronous. `createInvoice` was called before state update completed.

**Solution**: Pass tip percentage directly as parameter
```javascript
// useEffect approach with direct parameter passing
useEffect(() => {
  if (pendingTipSelection !== null) {
    const newTipPercent = pendingTipSelection;
    setSelectedTipPercent(newTipPercent);
    setShowTipDialog(false);
    setPendingTipSelection(null);
    createInvoiceWithTip(newTipPercent); // Pass directly
  }
}, [pendingTipSelection]);

const createInvoice = async (skipTipDialog = false, forceTipPercent = null) => {
  const effectiveTipPercent = forceTipPercent !== null ? forceTipPercent : selectedTipPercent;
  // Use effectiveTipPercent for all calculations
};
```

### 3. **Button Click Event Parameter Issues**
**Problem**: OK button was passing React `SyntheticBaseEvent` as first parameter instead of boolean.
```javascript
// Wrong:
onClick={createInvoice}  // Passes event object as skipTipDialog

// Log showed:
skipTipDialog: SyntheticBaseEvent  // Truthy value!
!skipTipDialog = false            // Prevents tip overlay
```

**Solution**: Wrap in arrow function
```javascript
onClick={() => createInvoice()}  // Passes no parameters (undefined → false)
```

### 4. **LN Address Payment Schema Issues**
**Problem**: 500 Internal Server Error when sending tips to Lightning Address.

**Root Cause**: 
- Including unsupported `memo` field in GraphQL mutation
- Sending amount as number instead of string

**Solution**: Correct GraphQL schema
```javascript
// Wrong:
{
  input: {
    walletId,
    lnAddress,
    amount: 5,        // Number
    memo: "tip"       // Not supported
  }
}

// Correct:
{
  input: {
    walletId,
    lnAddress,
    amount: "5"       // String, no memo
  }
}
```

## 🔧 Environment Configuration

### Required Environment Variables
```bash
# .env (never commit to git)
BLINKPOS_API_KEY=your_blinkpos_api_key_here
BLINKPOS_BTC_WALLET_ID=860b3e63-72a8-4adc-95cd-8be3390e6e51
```

### .gitignore Entries
```
.env
.tip-store.json
```

## 🎮 User Experience Flow

### Tip Selection Process
1. User enters amount (e.g., 100 sats)
2. Clicks OK → Tip overlay appears (if tips enabled)
3. Selects tip percentage (e.g., 10%)
4. Invoice created for total amount (110 sats)
5. Payment received in BlinkPOS account
6. Automatic splitting: 100 sats → user, 10 sats → employee

### State Management
```javascript
// Tip settings persisted to localStorage
const [tipsEnabled, setTipsEnabled] = useState(() => {
  return localStorage.getItem('blinkpos-tips-enabled') === 'true';
});

// Tip overlay state (local to transaction)
const [selectedTipPercent, setSelectedTipPercent] = useState(0);
const [showTipDialog, setShowTipDialog] = useState(false);
const [pendingTipSelection, setPendingTipSelection] = useState(null);
```

## 🔍 Debugging Strategies

### Key Debug Points
1. **Tip Overlay**: Check if `tipsEnabled && tipRecipient && !skipTipDialog && tipPercent === 0`
2. **State Timing**: Log `selectedTipPercent` vs `effectiveTipPercent` in invoice creation
3. **Payment Hash Matching**: Verify payment hash from WebSocket matches stored hash
4. **LN Address Schema**: Log exact GraphQL variables being sent

### Useful Console Patterns
```javascript
// State debugging
console.log('🔴 createInvoice called:', { 
  shouldSkipTipDialog, 
  selectedTipPercent, 
  forceTipPercent,
  effectiveTipPercent
});

// Payment flow debugging  
console.log('💾 Stored tip data for payment:', paymentHash);
console.log('📋 Retrieved tip data for payment:', paymentHash);
console.log('❌ No tip data found for payment hash:', paymentHash);
```

## 🚀 Performance Considerations

### WebSocket Efficiency
- Only one WebSocket connection per account type (user vs BlinkPOS)
- Payment forwarding happens immediately upon receipt
- Tip data cleaned up after successful processing

### File System Usage
- Tip store file is small and ephemeral
- Automatic cleanup of old entries (24 hours)
- Development-only persistence solution

## 📋 Testing Checklist

### Tip System Testing
- [ ] Tip overlay shows when tips enabled
- [ ] Invoice includes tip amount correctly
- [ ] Payment splitting works (base + tip)
- [ ] Tip goes to correct Lightning Address
- [ ] State resets properly after payment
- [ ] Works across browser refresh/reload

### Error Scenarios
- [ ] No tip data found (falls back to regular forwarding)
- [ ] LN Address payment fails (logs error, continues)
- [ ] WebSocket disconnection/reconnection
- [ ] Invalid tip recipient username

## 🛠 Common Pitfalls

1. **Don't rely on React state immediately after setState** - Use parameters or useEffect
2. **Always wrap button onClick handlers** - Prevent event objects as parameters  
3. **Persist critical data during development** - Next.js recompilations reset memory
4. **Validate GraphQL schema exactly** - Field names and types matter
5. **Test state timing thoroughly** - Async operations can cause race conditions

## 📚 Key Files Modified

### Core Components
- `components/POS.js` - Main POS interface with tip overlay
- `components/Dashboard.js` - Tip settings in side menu
- `lib/hooks/useBlinkPOSWebSocket.js` - Payment detection and forwarding

### API Routes  
- `pages/api/blink/create-invoice.js` - Invoice creation with tip metadata
- `pages/api/blink/forward-with-tips.js` - Tip-aware payment splitting
- `pages/api/blink/forward-payment.js` - Fallback payment forwarding

### Utilities
- `lib/tip-store.js` - Persistent tip metadata storage
- `lib/blink-api.js` - GraphQL API wrapper with LN Address support

## 🎯 Future Improvements

1. **Production Tip Store**: Replace file-based storage with Redis/database
2. **Better Error Handling**: More granular error messages for tip failures  
3. **Tip History**: Track and display tip transaction history
4. **Multi-Employee Tips**: Support splitting tips between multiple recipients
5. **Tip Limits**: Set minimum/maximum tip amounts or percentages

---

*Last Updated: January 19, 2025*
*Session: Tip System Implementation & Debugging*
