# Complete Payment Flow: From Customer to Database

A detailed step-by-step breakdown of how a single payment flows through the BlinkPOS system.

---

## 🎬 Complete Flow Overview

```
Customer → Frontend → API → Hybrid Storage → WebSocket → Payment Detection
                                                              │
                                          ┌───────────────────┴───────────────────┐
                                          │                                       │
                                   INSTANT ANIMATION              Background Forwarding
                                   (Customer sees success!)       → Tip Split → DB Update
```

**Key UX Optimization:** Animation triggers INSTANTLY on payment detection,
BEFORE forwarding completes. Customer gets immediate feedback.

---

## 📋 Step-by-Step Flow

### **PHASE 1: Invoice Creation (Frontend → Backend)**

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CASHIER ENTERS PAYMENT INFO                             │
└─────────────────────────────────────────────────────────────┘

Component: components/POS.js
Location: Browser

Actions:
  ✓ Cashier enters amount: $2.00
  ✓ Selects currency: USD
  ✓ Adds tip: 10%
  ✓ Enters tip recipient: "elturco"
  ✓ Clicks "Create Invoice"

Data Prepared:
  {
    amount: 23,              // Total in sats (2.20 converted)
    baseAmount: 21,          // Base amount in sats
    tipAmount: 2,            // Tip amount in sats
    tipPercent: 10,
    tipRecipient: "elturco",
    displayCurrency: "USD",
    baseAmountDisplay: 2.00,
    tipAmountDisplay: 0.20,
    memo: "$2.00 + 10% tip = $2.20 (23 sats)"
  }

       │
       ▼

┌─────────────────────────────────────────────────────────────┐
│ 2. WEBSOCKET CONNECTION INITIATED                          │
└─────────────────────────────────────────────────────────────┘

Component: lib/hooks/useBlinkPOSWebSocket.js
Location: Browser

Actions:
  ✓ Lazy-load BlinkPOS WebSocket connection
  ✓ Connect to wss://ws.blink.sv/graphql
  ✓ Authenticate with BlinkPOS API key (from server)
  ✓ Subscribe to payment updates

       │
       ▼

┌─────────────────────────────────────────────────────────────┐
│ 3. API CALL: Create Invoice                                │
└─────────────────────────────────────────────────────────────┘

Component: pages/api/blink/create-invoice.js
Location: Next.js API (Server)

Actions:
  ✓ Receive request from frontend
  ✓ Get BlinkPOS credentials from environment
  ✓ Create Blink API instance with BlinkPOS key

GraphQL Query Sent to Blink:
  mutation LnInvoiceCreate {
    lnInvoiceCreate(
      input: {
        walletId: "860b3e63-..." (BlinkPOS BTC wallet)
        amount: 23
        memo: "$2.00 + 10% tip = $2.20 (23 sats)"
      }
    ) {
      invoice {
        paymentRequest
        paymentHash
        satoshis
      }
    }
  }

Response from Blink:
  {
    paymentRequest: "lnbc230n1...",
    paymentHash: "2fb4245b5afe400a...",
    satoshis: 23
  }

       │
       ▼
```

---

### **PHASE 2: Storage (Backend → Hybrid Storage)**

```
┌─────────────────────────────────────────────────────────────┐
│ 4. STORE TIP METADATA IN HYBRID STORAGE                    │
└─────────────────────────────────────────────────────────────┘

Component: lib/storage/hybrid-store.js
Location: Server

Action: storeTipData(paymentHash, tipData)

┌───────────────────────────────────┐
│ STEP 4A: PostgreSQL Write         │
└───────────────────────────────────┘

Table: payment_splits

INSERT INTO payment_splits (
  payment_hash,                    // "2fb4245b5afe400a..."
  user_api_key_hash,               // SHA256 hash of merchant API key
  user_wallet_id,                  // "0515bb4d-9064-..." (merchant)
  total_amount,                    // 23 sats
  base_amount,                     // 21 sats
  tip_amount,                      // 2 sats
  tip_percent,                     // 10
  tip_recipient,                   // "elturco"
  display_currency,                // "USD"
  base_amount_display,             // 2.00
  tip_amount_display,              // 0.20
  memo,                            // "$2.00 + 10% tip..."
  status,                          // "pending"
  metadata,                        // {userApiKey: "blink_...", ...}
  created_at,                      // NOW()
  expires_at                       // NOW() + 15 minutes
) VALUES (...)

Result: Row inserted with ID=123

┌───────────────────────────────────┐
│ STEP 4B: Event Logging             │
└───────────────────────────────────┘

Table: payment_events

INSERT INTO payment_events (
  payment_hash,                    // "2fb4245b5afe400a..."
  event_type,                      // "created"
  event_status,                    // "success"
  event_data,                      // {totalAmount: 23, tipAmount: 2, ...}
  created_at                       // NOW()
) VALUES (...)

┌───────────────────────────────────┐
│ STEP 4C: Redis Cache (Hot Data)   │
└───────────────────────────────────┘

Key: blinkpos:payment:2fb4245b5afe400a...

Redis SET:
  Key: "blinkpos:payment:2fb4245b5afe400a..."
  Value: JSON.stringify({
    paymentHash: "2fb4245b5afe400a...",
    totalAmount: 23,
    baseAmount: 21,
    tipAmount: 2,
    tipPercent: 10,
    tipRecipient: "elturco",
    userApiKey: "blink_...",
    userWalletId: "0515bb4d-9064-...",
    status: "pending",
    createdAt: "2025-10-26T12:57:00Z"
  })
  TTL: 900 seconds (15 minutes)

Storage Complete:
  ✓ PostgreSQL: Permanent record ✅
  ✓ Redis: Fast access cache ✅
  ✓ Event log: Audit trail ✅

       │
       ▼

┌─────────────────────────────────────────────────────────────┐
│ 5. RETURN INVOICE TO FRONTEND                              │
└─────────────────────────────────────────────────────────────┘

API Response (200 OK):
  {
    success: true,
    invoice: {
      paymentRequest: "lnbc230n1...",
      paymentHash: "2fb4245b5afe400a...",
      satoshis: 23,
      hasTip: true,
      tipAmount: 2,
      tipRecipient: "elturco"
    }
  }

       │
       ▼
```

---

### **PHASE 3: Payment Detection (Customer → Lightning → WebSocket)**

```
┌─────────────────────────────────────────────────────────────┐
│ 6. DISPLAY QR CODE & WAIT FOR PAYMENT                      │
└─────────────────────────────────────────────────────────────┘

Component: components/POS.js
Location: Browser

Actions:
  ✓ Generate QR code from payment request
  ✓ Display QR code to customer
  ✓ Show amount: $2.20 (23 sats)
  ✓ Show memo: "$2.00 + 10% tip = $2.20"
  ✓ WebSocket listening for payment...

       │
       │ (Customer scans QR and pays)
       │
       ▼

┌─────────────────────────────────────────────────────────────┐
│ 7. CUSTOMER PAYS INVOICE                                   │
└─────────────────────────────────────────────────────────────┘

Network: Lightning Network
Destination: BlinkPOS BTC Wallet

Customer Wallet → Lightning Network → Blink Node → BlinkPOS Account

Payment Details:
  - Amount: 23 sats
  - Destination: BlinkPOS wallet (860b3e63-...)
  - Invoice: lnbc230n1...
  - Type: Lightning payment (if external) OR
          Intraledger (if Blink → Blink, zero fee!)

       │
       ▼

┌─────────────────────────────────────────────────────────────┐
│ 8. BLINK PROCESSES PAYMENT                                 │
└─────────────────────────────────────────────────────────────┘

Blink Backend:
  ✓ Verify invoice signature
  ✓ Check payment amount
  ✓ Credit BlinkPOS wallet: +23 sats
  ✓ Update transaction status: SUCCESS
  ✓ Broadcast to WebSocket subscribers

       │
       ▼

┌─────────────────────────────────────────────────────────────┐
│ 9. WEBSOCKET RECEIVES PAYMENT NOTIFICATION                 │
└─────────────────────────────────────────────────────────────┘

Component: lib/hooks/useBlinkPOSWebSocket.js
Location: Browser

WebSocket Message Received:
  {
    type: "next",
    payload: {
      data: {
        myUpdates: {
          update: {
            transaction: {
              id: "68fe172edad9a1b8f72ce9d1",
              direction: "RECEIVE",
              status: "SUCCESS",
              settlementAmount: 23,
              memo: "$2.00 + 10% tip = $2.20 (23 sats)",
              paymentHash: "2fb4245b5afe400a..."
            }
          }
        }
      }
    }
  }

Actions:
  ✓ Detect: direction=RECEIVE, status=SUCCESS
  ✓ Extract: paymentHash, amount, memo
  ✓ Log: "🎉 BLINKPOS PAYMENT DETECTED!"
  ✓ Verify: isExpectedPayment(paymentHash) - matches this client's pending invoice
  ✓ INSTANT UX: Trigger onPaymentReceived() callback IMMEDIATELY
  ✓ Background: Call forwardPayment() (non-blocking)

       │
       ├────────────────────────────────────────────┐
       │                                            │
       ▼                                            ▼
┌─────────────────────────────┐    ┌─────────────────────────────────────┐
│ 9A. INSTANT ANIMATION       │    │ 9B. BACKGROUND FORWARDING           │
│ (Customer sees success!)    │    │ (Payment forwarded to merchant)     │
└─────────────────────────────┘    └─────────────────────────────────────┘

PARALLEL EXECUTION:
  • Left path (9A): Animation shows immediately (~100ms after payment)
  • Right path (9B): Forwarding happens in background (~500ms-2s)

Customer Experience: INSTANT SUCCESS FEEDBACK
  - Animation triggers BEFORE forwarding completes
  - Customer payment is already confirmed on BlinkPOS
  - Forwarding is backend-only, customer doesn't wait

       │
       ▼
```

---

### **PHASE 4: Payment Forwarding & Tip Split (Backend)**

```
┌─────────────────────────────────────────────────────────────┐
│ 10. INITIATE PAYMENT FORWARDING                            │
└─────────────────────────────────────────────────────────────┘

Component: lib/hooks/useBlinkPOSWebSocket.js → forwardPayment()
Location: Browser → API Call

API Request: POST /api/blink/forward-with-tips

Request Body:
  {
    paymentHash: "2fb4245b5afe400a...",
    totalAmount: 23,
    memo: "$2.00 + 10% tip = $2.20 (23 sats)"
  }

       │
       ▼

┌─────────────────────────────────────────────────────────────┐
│ 11. RETRIEVE TIP DATA FROM HYBRID STORAGE                  │
└─────────────────────────────────────────────────────────────┘

Component: pages/api/blink/forward-with-tips.js
Location: Server

Action: getTipData(paymentHash)

┌───────────────────────────────────┐
│ STEP 11A: Try Redis First (Fast)  │
└───────────────────────────────────┘

Redis GET: blinkpos:payment:2fb4245b5afe400a...

If found in Redis (cache hit):
  ✓ Return data immediately (~5ms)
  ✓ Skip PostgreSQL query

If NOT found in Redis (cache miss):
  → Continue to Step 11B

┌───────────────────────────────────┐
│ STEP 11B: Query PostgreSQL         │
└───────────────────────────────────┘

SELECT * FROM payment_splits
WHERE payment_hash = '2fb4245b5afe400a...'
AND status = 'pending'

Result:
  {
    baseAmount: 21,
    tipAmount: 2,
    tipRecipient: "elturco",
    userApiKey: "blink_Is9z...",
    userWalletId: "0515bb4d-9064-...",
    displayCurrency: "USD",
    ...
  }

       │
       ▼

┌─────────────────────────────────────────────────────────────┐
│ 12. FORWARD BASE AMOUNT TO MERCHANT                        │
└─────────────────────────────────────────────────────────────┘

Component: lib/blink-api.js
Location: Server

Action: Create invoice for merchant, pay from BlinkPOS

Step 12A: Create Invoice on Merchant Account
  GraphQL Mutation:
    mutation LnInvoiceCreate {
      lnInvoiceCreate(
        input: {
          walletId: "0515bb4d-9064-..." (merchant wallet)
          amount: 21 (total - tip)
          memo: "BlinkPOS: $2.00 + 10% tip = $2.20 | $0.20 (2 sat) tip received to elturco"
        }
      )
    }
  
  Result:
    paymentRequest: "lnbc210n1..."

Step 12B: Pay Invoice from BlinkPOS Account
  GraphQL Mutation:
    mutation LnInvoicePaymentSend {
      lnInvoicePaymentSend(
        input: {
          walletId: "860b3e63-..." (BlinkPOS wallet)
          paymentRequest: "lnbc210n1..."
        }
      )
    }
  
  Transaction Type: INTRALEDGER (Blink → Blink)
  Fee: 0 sats (zero fee for internal transfers!)
  Speed: Instant
  
  Result:
    status: SUCCESS
    BlinkPOS wallet: -21 sats (now 2 sats remaining)
    Merchant wallet: +21 sats ✅

       │
       ▼

┌─────────────────────────────────────────────────────────────┐
│ 13. SEND TIP TO RECIPIENT                                  │
└─────────────────────────────────────────────────────────────┘

Component: lib/blink-api.js → sendTipViaInvoice()
Location: Server

Action: Send 2 sats to elturco@blink.sv

Step 13A: Get Recipient Wallet ID
  GraphQL Query:
    query AccountDefaultWallet($username: Username!) {
      accountDefaultWallet(username: $username) {
        id
        walletCurrency
      }
    }
    Variables: { username: "elturco" }
  
  Result:
    walletId: "a7b8c9d0-..." (elturco's BTC wallet)

Step 13B: Create Invoice on Recipient Account
  GraphQL Mutation:
    mutation LnInvoiceCreateOnBehalfOfRecipient {
      lnInvoiceCreateOnBehalfOfRecipient(
        input: {
          recipientWalletId: "a7b8c9d0-..."
          amount: 2
          memo: "BlinkPOS Tip received: $0.20 (2 sats)"
        }
      )
    }
  
  Result:
    paymentRequest: "lnbc20n1..."

Step 13C: Pay Tip Invoice from BlinkPOS Account
  GraphQL Mutation:
    mutation LnInvoicePaymentSend {
      lnInvoicePaymentSend(
        input: {
          walletId: "860b3e63-..." (BlinkPOS wallet)
          paymentRequest: "lnbc20n1..."
        }
      )
    }
  
  Transaction Type: INTRALEDGER (Blink → Blink)
  Fee: 0 sats (zero fee!)
  Speed: Instant
  
  Result:
    status: SUCCESS
    BlinkPOS wallet: -2 sats (now 0 sats)
    Elturco wallet: +2 sats ✅

Payment Forwarding Complete:
  ✓ Merchant received: 21 sats
  ✓ Elturco received: 2 sats
  ✓ BlinkPOS wallet: Back to 0 sats (pass-through)

       │
       ▼
```

---

### **PHASE 5: Database Updates & Cleanup**

```
┌─────────────────────────────────────────────────────────────┐
│ 14. UPDATE PAYMENT STATUS                                  │
└─────────────────────────────────────────────────────────────┘

Component: lib/storage/hybrid-store.js
Location: Server

Action: updatePaymentStatus(paymentHash, 'processing')

PostgreSQL UPDATE:
  UPDATE payment_splits
  SET 
    status = 'processing',
    processed_at = NOW()
  WHERE payment_hash = '2fb4245b5afe400a...'

Redis UPDATE (if cached):
  Update status in cached object
  Extend TTL to processing duration

       │
       ▼

┌─────────────────────────────────────────────────────────────┐
│ 15. LOG FORWARDING EVENT                                   │
└─────────────────────────────────────────────────────────────┘

Action: logEvent(paymentHash, 'forwarded', 'success')

PostgreSQL INSERT:
  INSERT INTO payment_events (
    payment_hash,
    event_type,
    event_status,
    event_data,
    created_at
  ) VALUES (
    '2fb4245b5afe400a...',
    'forwarded',
    'success',
    '{"forwardedAmount":21,"tipAmount":2,"tipRecipient":"elturco"}',
    NOW()
  )

Audit Trail Updated:
  ✓ Payment created (event 1)
  ✓ Payment forwarded (event 2) ← NEW

       │
       ▼

┌─────────────────────────────────────────────────────────────┐
│ 16. CLEANUP: Remove from Hot Storage                      │
└─────────────────────────────────────────────────────────────┘

Action: removeTipData(paymentHash)

┌───────────────────────────────────┐
│ STEP 16A: Update PostgreSQL        │
└───────────────────────────────────┘

UPDATE payment_splits
SET 
  status = 'completed',
  processed_at = NOW()
WHERE payment_hash = '2fb4245b5afe400a...'

Result: Status changed from 'processing' → 'completed'

┌───────────────────────────────────┐
│ STEP 16B: Remove from Redis Cache  │
└───────────────────────────────────┘

Redis DEL: blinkpos:payment:2fb4245b5afe400a...

Result: Cache entry deleted (hot data removed)

┌───────────────────────────────────┐
│ STEP 16C: Update Statistics        │
└───────────────────────────────────┘

PostgreSQL UPSERT (tip_recipient_stats):
  INSERT INTO tip_recipient_stats (
    tip_recipient,
    month,
    total_tips_received,
    tips_count,
    avg_tip_amount,
    last_tip_date
  ) VALUES (
    'elturco',
    '2025-10',
    2,
    1,
    2,
    NOW()
  )
  ON CONFLICT (tip_recipient, month)
  DO UPDATE SET
    total_tips_received = tip_recipient_stats.total_tips_received + 2,
    tips_count = tip_recipient_stats.tips_count + 1,
    avg_tip_amount = (tip_recipient_stats.total_tips_received + 2) / (tip_recipient_stats.tips_count + 1),
    last_tip_date = NOW()

Result: Statistics updated for elturco

Database State:
  ✓ Payment marked as completed ✅
  ✓ Hot storage cleared ✅
  ✓ Statistics updated ✅
  ✓ Permanent audit trail preserved ✅

       │
       ▼

┌─────────────────────────────────────────────────────────────┐
│ 17. RETURN SUCCESS TO FRONTEND                             │
└─────────────────────────────────────────────────────────────┘

API Response (200 OK):
  {
    success: true,
    message: "Payment successfully processed with tip splitting",
    details: {
      paymentHash: "2fb4245b5afe400a...",
      totalAmount: 23,
      forwardedAmount: 21,
      tipResult: {
        success: true,
        amount: 2,
        recipient: "elturco@blink.sv"
      }
    }
  }

       │
       ▼
```

---

### **PHASE 6: User Experience (Frontend Feedback)**

**NOTE:** Animation is now triggered INSTANTLY in Step 9A (parallel to forwarding).
This provides immediate customer feedback. The steps below happen in parallel with
payment forwarding (Phase 4), not after it.

```
┌─────────────────────────────────────────────────────────────┐
│ (From Step 9A) INSTANT PAYMENT ANIMATION                   │
└─────────────────────────────────────────────────────────────┘

Component: lib/hooks/useBlinkPOSWebSocket.js
Location: Browser
Timing: IMMEDIATELY after customer payment detected (~100ms)

Triggered in WebSocket onmessage handler (BEFORE forwardPayment):
  ✓ Check: isExpectedPayment(paymentHash)
  ✓ If match: onPaymentReceived() callback triggered INSTANTLY

Callback Executes (in components/Dashboard.js):
  1. triggerPaymentAnimation({
       amount: 23,
       currency: 'BTC',
       memo: "$2.00 + 10% tip = $2.20 (23 sats)",
       isForwarded: false  // Animation before forwarding completes
     })
  
  2. Play sound: /success.mp3
  
  3. Clear POS invoice (via posPaymentReceivedRef)
  
  4. Disconnect BlinkPOS WebSocket
  
  5. Refresh transaction data (fetchData)

CRITICAL UX IMPROVEMENT:
  • Old flow: Animation at ~1.5-3s (after forwarding)
  • New flow: Animation at ~0.5-1s (on payment detection)
  • Customer sees success INSTANTLY - forwarding is background only

       │
       ▼

┌─────────────────────────────────────────────────────────────┐
│ SHOW SUCCESS ANIMATION                                     │
└─────────────────────────────────────────────────────────────┘

Component: components/PaymentAnimation.js
Location: Browser

Animation Display:
  ┌──────────────────────────────────────┐
  │                                      │
  │          ✓ (checkmark icon)          │
  │                                      │
  │       Payment Received               │
  │                                      │
  │            +23                       │
  │            sats                      │
  │                                      │
  │   $2.00 + 10% tip = $2.20 (23 sats)  │
  │                                      │
  │         Tap to continue              │
  │                                      │
  └──────────────────────────────────────┘

Background: Green (rgba(34, 197, 94, 0.95))
Sound: success.mp3 plays
Duration: Until user taps screen

       │
       │ (User taps screen - meanwhile forwarding completes in background)
       ▼

┌─────────────────────────────────────────────────────────────┐
│ RESET POS FOR NEXT PAYMENT                                 │
└─────────────────────────────────────────────────────────────┘

Component: components/POS.js
Location: Browser

Actions:
  ✓ Hide QR code
  ✓ Clear amount input
  ✓ Reset numpad
  ✓ Keep tip settings (recipient & percentage)
  ✓ Ready for next payment

POS State: READY ✅
```

---

## 🗄️ Final Database State

After the complete flow, the database contains:

### **PostgreSQL Table: payment_splits**
```sql
| id | payment_hash     | total | base | tip | recipient | status    | created_at | processed_at |
|----|------------------|-------|------|-----|-----------|-----------|------------|--------------|
| 1  | 2fb4245b5afe...  | 23    | 21   | 2   | elturco   | completed | 12:57:00   | 12:57:02     |
```

### **PostgreSQL Table: payment_events**
```sql
| id | payment_hash     | event_type | event_status | created_at |
|----|------------------|------------|--------------|------------|
| 1  | 2fb4245b5afe...  | created    | success      | 12:57:00   |
| 2  | 2fb4245b5afe...  | forwarded  | success      | 12:57:02   |
```

### **PostgreSQL Table: tip_recipient_stats**
```sql
| tip_recipient | month   | total_tips | tips_count | avg_tip | last_tip_date |
|---------------|---------|------------|------------|---------|---------------|
| elturco       | 2025-10 | 2          | 1          | 2       | 12:57:02      |
```

### **Redis Cache**
```
(Empty - payment removed after completion)
```

---

## ⚡ Performance Metrics

| Phase | Duration | Bottleneck |
|-------|----------|------------|
| Invoice Creation | ~200ms | Blink API call |
| Storage (PostgreSQL + Redis) | ~50ms | Database writes |
| Payment (Customer) | ~1-5s | Customer action |
| WebSocket Detection | ~100ms | Network latency |
| **Animation Display** | **~100ms** | **INSTANT (parallel to forwarding)** |
| Payment Forwarding | ~500ms | 2x Blink API calls (background) |
| Tip Splitting | ~500ms | 2x Blink API calls (background) |
| Database Updates | ~50ms | PostgreSQL writes (background) |
| **Customer sees success** | **~1.3-5.3s** | **Payment time + 100ms** |

**UX Improvement:** Animation triggers immediately on payment detection.
Customer doesn't wait for forwarding (~1-1.5s saved).

---

## 🔐 Security Checkpoints

Throughout the flow, security is maintained:

1. ✅ **API Key Hashing**: User API keys hashed in PostgreSQL
2. ✅ **Session Validation**: All API calls verify auth token
3. ✅ **Payment Hash Verification**: Payment hash used as unique ID
4. ✅ **Amount Validation**: Amounts validated at every step
5. ✅ **Audit Trail**: Every event logged permanently
6. ✅ **TTL Enforcement**: Redis entries expire after 15 minutes
7. ✅ **Status Tracking**: Payment status prevents duplicate processing

---

## 🧩 Components Summary

| Component | Type | Purpose | Data Flow |
|-----------|------|---------|-----------|
| `components/POS.js` | Frontend | UI for creating invoices | User input → API |
| `pages/api/blink/create-invoice.js` | API | Create Lightning invoice | Request → Blink API → Storage |
| `lib/storage/hybrid-store.js` | Storage | Manage payment data | Data → Redis + PostgreSQL |
| `lib/hooks/useBlinkPOSWebSocket.js` | WebSocket | Real-time payment detection | Blink WS → Forward API |
| `pages/api/blink/forward-with-tips.js` | API | Forward & split payments | Storage → Blink API → Storage |
| `lib/blink-api.js` | API Client | Interact with Blink GraphQL | GraphQL mutations/queries |
| `components/PaymentAnimation.js` | Frontend | Success feedback | State → UI |

---

## 📊 Data Storage Locations

| Data Type | Redis | PostgreSQL | Lifespan |
|-----------|-------|------------|----------|
| Payment metadata (pending) | ✅ Yes | ✅ Yes | 15 min (Redis) / Forever (PG) |
| Payment metadata (completed) | ❌ No | ✅ Yes | Forever |
| Event logs | ❌ No | ✅ Yes | Forever |
| Tip statistics | ❌ No | ✅ Yes | Forever |
| User API keys (hashed) | ❌ No | ✅ Yes | Forever |

---

## 🎯 Key Insights

1. **Hybrid Storage**: Redis provides fast access for active payments; PostgreSQL ensures permanent records
2. **Zero Fees**: All forwarding uses Blink intraledger transactions (instant + free)
3. **Atomic Operations**: Payment forwarding and tip splitting happen in sequence, with rollback capability
4. **Real-time**: WebSocket provides instant payment notification (<100ms)
5. **Audit Trail**: Every step logged for compliance and debugging
6. **Scalability**: Redis caching reduces database load; PostgreSQL handles historical data
7. **User Experience**: Animation provides instant feedback while background processing completes

---

Generated: October 26, 2025

