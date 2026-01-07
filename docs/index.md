# BBTV2 Documentation Index

## Project: Blink Bitcoin Terminal V2

A Bitcoin Lightning Point of Sale and circular economy management platform.

---

## Quick Links

| Document | Description |
|----------|-------------|
| [Project Overview](./project-overview.md) | Executive summary, features, and status |
| [Architecture](./architecture.md) | System design, data flow, security model |
| [API Contracts](./api-contracts.md) | REST API documentation (50 endpoints) |

---

## Project Stats

| Metric | Value |
|--------|-------|
| **Framework** | Next.js 12.3.4 |
| **Components** | 25 files (~13,500 lines) |
| **API Endpoints** | 50 |
| **Database Tables** | 5+ |
| **Documentation Files** | 34 in root |

---

## Core Components

### Frontend Components (`/components/`)

| Component | Lines | Purpose |
|-----------|-------|---------|
| `Dashboard.js` | ~4,000 | Main UI with tabs |
| `POS.js` | ~1,800 | Point of Sale |
| `Voucher.js` | ~1,700 | Voucher management |
| `Network.js` | ~1,900 | Community dashboard |
| `ItemCart.js` | ~1,000 | Cart management |
| `TransactionDetail.js` | ~600 | Transaction modal |
| `LoginForm.js` | ~150 | Authentication |
| `PaymentAnimation.js` | ~100 | Payment celebration |

### Business Logic (`/lib/`)

| Module | Purpose |
|--------|---------|
| `blink-api.js` | Blink GraphQL API client |
| `auth.js` | JWT/encryption utilities |
| `storage.js` | User data persistence |
| `hooks/` | React hooks (useAuth, useBlinkWebSocket) |
| `network/` | Community operations |
| `nostr/` | Nostr identity/relay |
| `nwc/` | Nostr Wallet Connect |
| `pdf/` | PDF generation |

### API Routes (`/pages/api/`)

| Domain | Endpoints | Purpose |
|--------|-----------|---------|
| `auth/` | 8 | Authentication |
| `blink/` | 17 | Wallet operations |
| `voucher/` | 5 | Voucher management |
| `network/` | 12 | Community features |
| `user/` | 2 | Preferences |

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Tailwind CSS |
| Backend | Next.js API Routes |
| Database | PostgreSQL 13+ |
| Cache | Redis 4.7 |
| Real-time | WebSocket (Blink) |
| Lightning | bolt11, js-lnurl |
| Identity | Nostr (nostr-tools) |
| Encryption | AES-256-GCM |

---

## External Documentation

### In Project Root

| Category | Files |
|----------|-------|
| **Deployment** | `DEPLOYMENT_*.md`, `DOCKER_DEPLOYMENT_GUIDE.md`, `QUICK_DEPLOY.md` |
| **Development** | `DEVELOPMENT_INSIGHTS.md`, `SETUP_INSTRUCTIONS.md`, `TESTING_GUIDE.md` |
| **Architecture** | `HYBRID_STORAGE_ARCHITECTURE.md`, `WEBSOCKET_IMPLEMENTATION.md` |
| **Features** | `PAYMENT_FLOW_*.md`, `TIPPING_FUNCTIONALITY.md`, `DYNAMIC_CURRENCY_SYSTEM.md` |
| **Auth** | `AUTH_EXPANSION_PLAN.md`, `NIP46_PORTAL_INTEGRATION.md` |
| **Roadmap** | `ROADMAP.md`, `PROJECT_STATUS_UPDATE_DEC_2025.md` |

### Related Projects

| Location | Content |
|----------|---------|
| `/home/kasita/Documents/BLINK/Network/docs/brief.md` | Network component specification |

---

## Getting Started

### Prerequisites

- Node.js 14+
- PostgreSQL 13+
- Redis (optional, for caching)
- Blink API key from [dashboard.blink.sv](https://dashboard.blink.sv)

### Quick Start

```bash
# Clone and install
git clone https://github.com/pretyflaco/BBTV2.git
cd BBTV2
npm install

# Configure environment
cp .env.local.example .env.local
# Edit .env.local with your secrets

# Run development server
npm run dev
```

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `JWT_SECRET` | Yes | Session signing |
| `ENCRYPTION_KEY` | Yes | API key encryption |
| `DATABASE_URL` | Yes | PostgreSQL connection |
| `REDIS_URL` | No | Redis connection |
| `BLINKPOS_API_KEY` | Yes | Voucher authentication |
| `BLINKPOS_BTC_WALLET_ID` | Yes | Voucher payments |
| `NETWORK_ENCRYPTION_KEY` | For Network | Consent encryption |

---

## Project Status

| Feature | Status |
|---------|--------|
| POS | Production |
| Dashboard | Production |
| Vouchers | Production |
| Network | MVP/Pioneer Testing |
| Nostr Auth | Development |

---

## Maintainer

**pretyflaco** - [GitHub](https://github.com/pretyflaco)

---

*Documentation generated: January 2026*
*Scan level: Deep*
*Workflow: BMAD document-project*
