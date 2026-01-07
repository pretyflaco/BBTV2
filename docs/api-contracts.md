# BBTV2 API Documentation

## Overview

BBTV2 exposes 50 REST API endpoints through Next.js API routes. All endpoints are located in `/pages/api/`.

## Authentication

Most endpoints require authentication via JWT cookie (`auth-token`).

```javascript
// Cookie set on login
Set-Cookie: auth-token=${jwt}; HttpOnly; Path=/; SameSite=Strict; Max-Age=86400
```

## API Domains

| Domain | Endpoints | Purpose |
|--------|-----------|---------|
| `/api/auth/*` | 8 | Authentication and session management |
| `/api/blink/*` | 17 | Blink wallet operations |
| `/api/voucher/*` | 5 | Voucher creation and management |
| `/api/network/*` | 12 | Community and metrics |
| `/api/user/*` | 2 | User preferences |
| `/api/*` | 6 | Utilities (health, proxy, profiles) |

---

## Auth Endpoints (`/api/auth/*`)

### POST `/api/auth/login`
Authenticate with Blink API key.

**Request:**
```json
{
  "apiKey": "blink_xxx..."
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "username": "pretyflaco",
    "preferredCurrency": "USD"
  }
}
```

### POST `/api/auth/logout`
Clear session and cookies.

### GET `/api/auth/verify`
Verify current session is valid.

**Response:**
```json
{
  "authenticated": true,
  "user": { "username": "pretyflaco" }
}
```

### GET `/api/auth/get-api-key`
Retrieve decrypted API key (server-side use).

### POST `/api/auth/nostr-login`
Authenticate with Nostr npub.

### POST `/api/auth/migrate-to-nostr`
Link existing account to Nostr identity.

### GET `/api/auth/migration-status`
Check Nostr migration status.

### POST `/api/auth/nostr-blink-account`
Associate Nostr with Blink account.

---

## Blink Endpoints (`/api/blink/*`)

### GET `/api/blink/balance`
Get wallet balances.

**Response:**
```json
{
  "wallets": [
    { "id": "xxx", "walletCurrency": "BTC", "balance": 100000 },
    { "id": "yyy", "walletCurrency": "USD", "balance": 5000 }
  ]
}
```

### GET `/api/blink/transactions`
Get transaction history.

**Query Params:**
- `first` (int): Number of transactions (default: 100)
- `after` (string): Cursor for pagination

**Response:**
```json
{
  "edges": [
    {
      "node": {
        "id": "xxx",
        "direction": "RECEIVE",
        "settlementAmount": 1000,
        "settlementCurrency": "BTC",
        "memo": "Coffee",
        "createdAt": "2026-01-05T12:00:00Z"
      }
    }
  ],
  "pageInfo": {
    "hasNextPage": true,
    "endCursor": "cursor123"
  }
}
```

### POST `/api/blink/create-invoice`
Create Lightning invoice.

**Request:**
```json
{
  "amount": 1000,
  "memo": "Order #123",
  "walletCurrency": "BTC"
}
```

**Response:**
```json
{
  "paymentRequest": "lnbc...",
  "paymentHash": "abc123",
  "satoshis": 1000
}
```

### POST `/api/blink/pay-invoice`
Pay a Lightning invoice.

**Request:**
```json
{
  "paymentRequest": "lnbc...",
  "walletId": "xxx"
}
```

### GET `/api/blink/check-payment`
Check payment status by hash.

**Query Params:**
- `paymentHash` (string): Payment hash to check

### POST `/api/blink/forward-with-tips`
Forward payment and distribute tips.

**Request:**
```json
{
  "amount": 10000,
  "recipients": [
    { "username": "employee1", "percentage": 50 },
    { "lnAddress": "user@getalby.com", "percentage": 50 }
  ]
}
```

### POST `/api/blink/forward-nwc-with-tips`
Forward payment via NWC with tips.

### POST `/api/blink/forward-ln-address`
Forward to Lightning Address.

### POST `/api/blink/forward-npubcash`
Forward to npub.cash address.

### POST `/api/blink/send-nwc-tips`
Send tips via Nostr Wallet Connect.

### GET `/api/blink/wallets`
Get wallet IDs and currencies.

### GET `/api/blink/me`
Get current user info from Blink.

### GET `/api/blink/exchange-rate`
Get exchange rate for currency.

**Query Params:**
- `currency` (string): Currency code (USD, ZAR, etc.)

### GET `/api/blink/currency-list`
Get supported currencies.

### GET `/api/blink/csv-export`
Export transactions as CSV.

### POST `/api/blink/validate-ln-address`
Validate a Lightning Address.

### POST `/api/blink/webhook`
Receive Blink webhook events.

### GET `/api/blink/blinkpos-credentials`
Get BlinkPOS credentials for vouchers.

---

## Voucher Endpoints (`/api/voucher/*`)

### POST `/api/voucher/create`
Create a new voucher.

**Request:**
```json
{
  "amount": 5000,
  "memo": "Gift Card",
  "expiresIn": 1440
}
```

**Response:**
```json
{
  "chargeId": "uuid",
  "lnurl": "lnurl1...",
  "qrCode": "base64..."
}
```

### GET `/api/voucher/status/[chargeId]`
Get voucher status.

### GET `/api/voucher/lnurl/[chargeId]/[amount]`
LNURL-withdraw callback.

### POST `/api/voucher/callback`
Handle voucher payment callback.

### GET `/api/voucher/pdf`
Generate voucher PDF.

**Query Params:**
- `chargeId` (string): Voucher ID
- `amount` (int): Amount in sats

---

## Network Endpoints (`/api/network/*`)

### GET `/api/network/communities`
List all communities.

**Response:**
```json
{
  "communities": [
    {
      "id": "uuid",
      "name": "Bitcoin Ekasi",
      "slug": "bitcoin-ekasi",
      "memberCount": 50,
      "location": { "city": "Mossel Bay", "country": "ZA" }
    }
  ]
}
```

### POST `/api/network/communities`
Create a new community (leader only).

### GET `/api/network/memberships`
Get user's community memberships.

### POST `/api/network/memberships/apply`
Apply to join a community.

**Request:**
```json
{
  "communityId": "uuid",
  "message": "I'd like to join!"
}
```

### GET `/api/network/memberships/pending`
Get pending applications (leader only).

### POST `/api/network/memberships/review`
Approve/reject application (leader only).

**Request:**
```json
{
  "membershipId": 123,
  "action": "approve",
  "feedback": "Welcome!"
}
```

### GET/POST `/api/network/consent`
Manage data sharing consent.

**POST Request:**
```json
{
  "communityId": "uuid",
  "apiKey": "blink_xxx...",
  "consent": true
}
```

### POST `/api/network/sync`
Trigger transaction sync.

### GET `/api/network/metrics`
Get community metrics.

**Query Params:**
- `communityId` (string): Community UUID
- `period` (string): "week" | "month"

**Response:**
```json
{
  "closedLoopRatio": 0.72,
  "transactionCount": 150,
  "volume": 5000000,
  "velocity": 3.2,
  "growth": 0.15
}
```

### GET `/api/network/leaderboard`
Get community rankings.

### GET `/api/network/heatmap`
Get geographic data for map.

### GET `/api/network/profiles`
Fetch Nostr profiles for leaders.

### GET `/api/network/whitelist/check`
Check if user is whitelisted leader.

---

## User Endpoints (`/api/user/*`)

### GET/POST `/api/user/cart-items`
Manage POS cart items.

### POST `/api/user/sync`
Sync user preferences.

---

## Utility Endpoints

### GET `/api/health`
Health check for monitoring.

**Response:**
```json
{
  "status": "healthy",
  "checks": {
    "redis": { "status": "up" },
    "postgres": { "status": "up" },
    "blinkConfig": { "status": "configured" }
  },
  "uptime": 86400,
  "responseTime": 5
}
```

### GET `/api/lnurl-proxy`
Proxy LNURL requests.

### GET/POST `/api/split-profiles`
Manage tip split profiles.

### GET `/api/debug/tip-store`
Debug tip store (dev only).

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

Common HTTP status codes:
- `400` - Bad request / validation error
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not found
- `405` - Method not allowed
- `500` - Internal server error

---

*Last Updated: January 2026*
