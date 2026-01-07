# BBTV2 Project Overview

## Executive Summary

**Blink Bitcoin Terminal V2 (BBTV2)** is a Bitcoin Lightning Point of Sale and circular economy management platform built with Next.js. It provides merchants and community leaders with tools to accept Bitcoin payments, manage transactions, create vouchers, and track circular economy health metrics.

## Project Identity

| Attribute | Value |
|-----------|-------|
| **Name** | Blink POS / BBTV2 |
| **Type** | Web Application |
| **Framework** | Next.js 12.3.4 |
| **License** | AGPL-3.0 |
| **Repository** | https://github.com/pretyflaco/BBTV2 |

## Core Features

### Completed Features

1. **Point of Sale (POS)**
   - Lightning invoice generation
   - Real-time payment detection via WebSocket
   - Multi-currency support (BTC sats + fiat display)
   - Payment celebration animations
   - Cart/item management

2. **Dashboard**
   - Wallet balance display (BTC/USD)
   - Transaction history with filtering
   - CSV export functionality
   - Real-time updates

3. **Voucher System**
   - Create Bitcoin vouchers with QR codes
   - LNURL-withdraw support
   - PDF generation for printing
   - Commission options

4. **Tip Splitting**
   - Configure tip recipients
   - Automatic payment forwarding
   - Support for Blink usernames, Lightning Addresses, NWC

5. **Network (Circular Economy Dashboard)**
   - Community discovery and leaderboard
   - Membership management with approval workflow
   - Opt-in data sharing for metrics
   - Closed-loop ratio tracking
   - Geographic heatmap visualization

6. **Authentication**
   - Blink API key authentication
   - Nostr (npub) login support
   - JWT sessions with encrypted storage
   - Migration path from API key to Nostr

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, Tailwind CSS 3 |
| **Backend** | Next.js API Routes |
| **Database** | PostgreSQL 13+ |
| **Cache** | Redis 4.7 |
| **Real-time** | WebSocket (Blink subscription) |
| **Lightning** | bolt11, js-lnurl, Blink GraphQL API |
| **Identity** | Nostr (nostr-tools), JWT |
| **Encryption** | AES-256-GCM |
| **PDF** | @react-pdf/renderer |

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                    Client Browser                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐│
│  │Dashboard│ │   POS   │ │ Voucher │ │   Network   ││
│  └────┬────┘ └────┬────┘ └────┬────┘ └──────┬──────┘│
└───────┼──────────┼─────────┼────────────────┼───────┘
        │          │         │                │
        ▼          ▼         ▼                ▼
┌──────────────────────────────────────────────────────┐
│              Next.js API Routes (50 endpoints)       │
│  /api/auth/* /api/blink/* /api/voucher/* /api/network/*│
└───────┬──────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────┐
│                  Business Logic (lib/)               │
│  blink-api.js │ hooks/ │ network/ │ nostr/ │ nwc/   │
└───────┬───────────────────────┬──────────────────────┘
        │                       │
        ▼                       ▼
┌───────────────┐     ┌─────────────────────┐
│   PostgreSQL  │     │   External Services │
│   - users     │     │   - Blink API       │
│   - sessions  │     │   - Nostr Relays    │
│   - communities│    │   - Lightning Net   │
│   - memberships│    └─────────────────────┘
│   - metrics   │
└───────────────┘
```

## Target Users

1. **Merchants** - Small/medium businesses accepting Bitcoin payments
2. **Community Leaders** - Organizers of Bitcoin circular economies
3. **Community Members** - Participants in circular economy networks

## Key Differentiators

- **Blink-Native**: Built for Blink wallet ecosystem
- **Circular Economy Focus**: Unique metrics for closed-loop Bitcoin commerce
- **Privacy-First**: Encrypted API key storage, consent-based data sharing
- **Open Source**: AGPL-3.0 license ensures community benefits

## Project Status

- **Core POS**: Production ready
- **Dashboard**: Production ready
- **Voucher System**: Production ready
- **Network Component**: MVP complete, in pioneer testing
- **Nostr Auth**: In development

---

*Last Updated: January 2026*
