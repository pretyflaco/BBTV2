# BBTV2 Architecture Documentation

## System Architecture

### High-Level Overview

BBTV2 follows a **layered monolith architecture** built on Next.js, combining server-side rendering with API routes for backend functionality.

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                 React Components                      │  │
│  │  Dashboard.js (316KB) │ POS.js │ Voucher.js │ Network│  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    React Hooks                        │  │
│  │  useAuth │ useBlinkWebSocket │ useKeyboardShortcuts  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       API LAYER                             │
│  50 Next.js API Routes in /pages/api/                       │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  auth/  │ │  blink/ │ │ voucher/ │ │     network/     │ │
│  │ 8 routes│ │17 routes│ │ 5 routes │ │    12 routes     │ │
│  └─────────┘ └─────────┘ └──────────┘ └──────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    BUSINESS LOGIC LAYER                     │
│  /lib/                                                      │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐  │
│  │   blink-api.js │ │    auth.js     │ │   storage.js   │  │
│  │  GraphQL client│ │  JWT/encryption│ │  User data mgmt│  │
│  └────────────────┘ └────────────────┘ └────────────────┘  │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐  │
│  │   network/     │ │    nostr/      │ │     nwc/       │  │
│  │  Community ops │ │ Identity/relay │ │ Wallet Connect │  │
│  └────────────────┘ └────────────────┘ └────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      DATA LAYER                             │
│  ┌────────────────────┐    ┌────────────────────────────┐  │
│  │     PostgreSQL     │    │          Redis             │  │
│  │  - communities     │    │  - Session cache           │  │
│  │  - memberships     │    │  - Rate limiting           │  │
│  │  - consents        │    │  - Hot data                │  │
│  │  - transactions    │    └────────────────────────────┘  │
│  │  - metrics         │                                    │
│  └────────────────────┘                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   EXTERNAL SERVICES                         │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐  │
│  │   Blink API    │ │ Nostr Relays   │ │Lightning Network│ │
│  │ api.blink.sv   │ │ NIP-01 profiles│ │  BOLT11/LNURL  │  │
│  │ GraphQL + WS   │ │ wss://relay..  │ │                │  │
│  └────────────────┘ └────────────────┘ └────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Component Architecture

### Main Components

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| **Dashboard** | `components/Dashboard.js` | ~4,000 | Main UI, tabs, balance, transactions |
| **POS** | `components/POS.js` | ~1,800 | Point of sale, invoice generation |
| **Voucher** | `components/Voucher.js` | ~1,700 | Voucher creation, LNURL-withdraw |
| **Network** | `components/Network.js` | ~1,900 | Community dashboard, metrics |
| **ItemCart** | `components/ItemCart.js` | ~1,000 | Cart management for POS |
| **LoginForm** | `components/LoginForm.js` | ~150 | Authentication UI |
| **PaymentAnimation** | `components/PaymentAnimation.js` | ~100 | Payment celebration overlay |
| **TransactionDetail** | `components/TransactionDetail.js` | ~600 | Transaction modal |

### Component Relationships

```
pages/index.js
    └── Dashboard.js (conditional render based on auth)
            ├── Tab: Home (balance, transactions)
            ├── Tab: POS
            │       └── POS.js
            │           └── ItemCart.js
            ├── Tab: Vouchers
            │       └── Voucher.js
            ├── Tab: Network
            │       └── Network.js
            └── Settings/
                    ├── SplitSettings.js
                    └── CartSettings.js
```

## Data Flow

### Authentication Flow

```
1. User enters API key
       │
       ▼
2. POST /api/auth/login
       │
       ├─► Validate with Blink API (getMe)
       │
       ├─► Encrypt API key (AES-256)
       │
       ├─► Store user data (PostgreSQL/Redis)
       │
       ├─► Generate JWT session token
       │
       └─► Set httpOnly cookie
              │
              ▼
3. Client receives auth confirmation
       │
       ▼
4. WebSocket connection to Blink (wss://ws.blink.sv/graphql)
       │
       └─► Subscribe to myUpdates for real-time payments
```

### Payment Flow

```
1. POS generates invoice
       │
       ├─► POST /api/blink/create-invoice
       │       └─► Blink lnInvoiceCreate mutation
       │
       ▼
2. Customer pays invoice
       │
       ▼
3. Blink WebSocket sends payment event
       │
       ├─► useBlinkWebSocket hook receives event
       │
       ├─► Payment animation triggers
       │
       └─► (If tips configured) Forward tips
               │
               └─► POST /api/blink/forward-with-tips
                       ├─► Create invoice for each recipient
                       └─► Pay invoices from sender wallet
```

### Network Metrics Flow

```
1. User consents to data sharing
       │
       ├─► Encrypts Blink API key (AES-256-GCM)
       │
       └─► POST /api/network/consent
              │
              ▼
2. Sync service runs (periodic batch)
       │
       ├─► POST /api/network/sync
       │
       ├─► Fetch transactions from Blink API
       │
       ├─► Match counterparties (internal detection)
       │
       └─► Store in member_transactions table
              │
              ▼
3. Metrics aggregation
       │
       ├─► Calculate closed-loop ratio
       │
       ├─► Calculate velocity, volume
       │
       └─► Update community_metrics table
              │
              ▼
4. Dashboard displays metrics
       │
       └─► GET /api/network/metrics
```

## Database Schema

### Core Tables

```sql
-- User sessions and authentication
users
    id, username, api_key_encrypted, npub, created_at

-- Network: Community management
communities
    id, name, slug, leader_npub, location, settings, member_count

community_memberships
    community_id, user_npub, role, status, joined_at

data_sharing_consents
    user_npub, community_id, api_key_encrypted, last_sync

member_transactions
    user_npub, tx_id, amount, counterparty, is_internal, created_at

community_metrics
    community_id, period, closed_loop_ratio, volume, velocity
```

## Security Architecture

### Encryption

| Data | Method | Key Source |
|------|--------|------------|
| API keys (auth) | AES-256 | `ENCRYPTION_KEY` env var |
| API keys (network) | AES-256-GCM | `NETWORK_ENCRYPTION_KEY` env var |
| Session tokens | JWT HS256 | `JWT_SECRET` env var |
| Passwords | bcrypt | Per-user salt |

### Authentication Layers

1. **Cookie-based JWT** - 24-hour sessions, httpOnly
2. **API key validation** - Server-side only, never sent to browser
3. **Nostr identity** - npub verification for network features
4. **Role-based access** - super_admin, leader, member, guest

### Security Headers (next.config.js)

```javascript
headers: [
  { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' }
]
```

## Real-time Architecture

### WebSocket Connection

```javascript
// Connection to Blink WebSocket
const ws = new WebSocket('wss://ws.blink.sv/graphql', 'graphql-transport-ws');

// Authentication
{ type: 'connection_init', payload: { 'X-API-KEY': apiKey } }

// Subscription
{
  type: 'subscribe',
  payload: {
    query: `subscription { myUpdates {
      update { transaction { direction, settlementAmount, ... } }
    }}`
  }
}
```

### Event Handling

- **Payment received**: Triggers animation, updates balance, forwards tips
- **Payment sent**: Updates transaction history
- **Connection lost**: Automatic reconnection with exponential backoff

## Deployment Architecture

### Docker Configuration

```yaml
# docker-compose.prod.yml
services:
  bbtv2:
    build: .
    ports: ["3000:3000"]
    environment:
      - NODE_ENV=production
      - DATABASE_URL
      - REDIS_URL
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:13
    volumes: ["./data:/var/lib/postgresql/data"]

  redis:
    image: redis:7
```

### Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `JWT_SECRET` | Session signing | Yes |
| `ENCRYPTION_KEY` | API key encryption | Yes |
| `DATABASE_URL` | PostgreSQL connection | Yes |
| `REDIS_URL` | Redis connection | Yes |
| `BLINKPOS_API_KEY` | Voucher webhook auth | Yes |
| `BLINKPOS_BTC_WALLET_ID` | Voucher payments | Yes |
| `NETWORK_ENCRYPTION_KEY` | Network consent encryption | For Network |

---

*Last Updated: January 2026*
