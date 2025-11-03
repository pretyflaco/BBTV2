# BlinkPOS Project Roadmap

**Version:** 1.0  
**Last Updated:** October 26, 2025  
**Status:** Strategic Planning

---

## Vision Statement

BlinkPOS will evolve from a Blink-exclusive POS system into a **flexible, protocol-agnostic payment platform** that supports:
- Multiple wallet types (Blink, self-custodial Lightning wallets via NWC)
- Multiple recipient types (Blink users, Lightning Addresses, Nostr npubs)
- Multiple use cases (retail POS, vouchers, agent commission splits)
- Bitcoin-first commerce at scale

---

## Current State (Phase 0)

### ✅ Implemented Features
- Blink-exclusive POS system
- Lightning invoices for customer payments
- Intraledger forwarding (zero-fee, instant) for:
  - Merchant payments
  - Tip splitting to Blink users
- WebSocket-based payment detection
- Multi-currency display support
- File-based tip metadata storage

### ⚠️ Current Limitations
- **Blink-only**: Merchants must have Blink accounts
- **Blink-only recipients**: Tips only to `@blink.sv` users
- **Centralized**: Single custodian dependency
- **Storage**: File-based system doesn't scale

### 🎯 Immediate Priority
**Complete Hybrid Storage Architecture** (Redis + PostgreSQL)
- Target: Q4 2025 / Q1 2026
- Prerequisite for all future features
- See: `HYBRID_STORAGE_ARCHITECTURE.md`

---

## Technology Foundation: Nostr Wallet Connect (NWC)

### What is NWC?

**Nostr Wallet Connect** (NIP-47) is an emerging protocol that allows applications to connect to Lightning wallets via Nostr relays.

**Key Concepts:**
```
App (BlinkPOS) ←→ Nostr Relay ←→ User's Wallet (any Lightning wallet)
```

**How it works:**
1. User generates NWC connection string from their wallet
2. Connection string contains:
   - Nostr relay URL
   - Pubkey for communication
   - Secret for authentication
   - Optional: spending limits, permissions
3. App connects to relay and sends payment requests
4. Wallet responds via same relay channel

**Supported Wallets (2025):**
- Alby
- Mutiny Wallet
- Blink (in progress)
- Coinos
- LNbits
- Many others adding support

### Why NWC Matters for BlinkPOS

| Benefit | Impact |
|---------|--------|
| **Wallet Flexibility** | Merchants can use ANY Lightning wallet, not just Blink |
| **Decentralization** | Reduces single-custodian dependency |
| **Budget Control** | Users can set spending limits per connection |
| **Self-Custody** | Merchants can use self-custodial wallets |
| **Privacy** | Nostr relays don't see payment details (encrypted) |
| **Interoperability** | One protocol works across dozens of wallets |

### NWC Protocol Capabilities

**Supported Commands:**
- `pay_invoice` - Pay a Lightning invoice
- `make_invoice` - Generate an invoice
- `lookup_invoice` - Check invoice status
- `get_balance` - Query wallet balance
- `get_info` - Get wallet information
- `list_transactions` - Query transaction history

**Permissions Model:**
- Wallets can grant limited permissions
- Apps can't access more than granted
- Example: "Can pay up to 100,000 sats per day"

---

## Development Roadmap

## Phase 1: Foundation (Q1-Q2 2026)

### 1.1 Hybrid Storage Migration ⚡ HIGH PRIORITY
**Status:** Architecture designed, ready for implementation  
**Timeline:** 8-10 weeks  
**Dependencies:** None

**Deliverables:**
- [ ] Redis client implementation
- [ ] PostgreSQL client implementation
- [ ] Hybrid tip store (replaces file storage)
- [ ] Migration script from file to hybrid
- [ ] Health monitoring endpoints
- [ ] Documentation and runbooks

**Success Criteria:**
- 99.9%+ uptime
- <1ms read/write latency (Redis)
- Zero data loss during migration
- Support for horizontal scaling

**See:** `HYBRID_STORAGE_ARCHITECTURE.md`, `HYBRID_STORAGE_QUICKSTART.md`

---

### 1.2 Persistent Authentication & Session Management ⚡ HIGH PRIORITY
**Status:** Planning  
**Timeline:** 4-6 weeks  
**Dependencies:** Hybrid storage (for credential storage)

**Problem:** Users currently must re-enter API keys, Blink usernames, and other credentials every session. This is:
- Inconvenient (poor UX)
- Error-prone (typos, wrong credentials)
- Time-consuming (especially for NWC connection strings)
- Discourages feature exploration

**Solution:** Implement multiple authentication methods for flexibility and security.

**Authentication Methods:**

1. **Nostr-Native Authentication (NIP-46)** 🔐 RECOMMENDED
   - Sign in with Nostr key management apps
   - Desktop: [keys.band](https://keys.band/) browser extension
   - Mobile: [Amber](https://github.com/greenart7c3/Amber) Android app
   - No password needed - cryptographic signing
   - Privacy-preserving

2. **Traditional Username/Password**
   - For users without Nostr keys
   - Argon2id hashing
   - Encrypted credential storage

**Architecture:**
```javascript
// Authentication flow options:

// Option 1: Nostr NIP-46 Sign-in (Recommended)
1. User clicks "Sign in with Nostr"
2. BlinkPOS generates challenge (random string)
3. User signs challenge with keys.band/Amber
4. BlinkPOS verifies signature against npub
5. Session established with JWT token
6. All saved settings/wallets loaded

// Option 2: Traditional Login
1. User enters username/password
2. System verifies credentials
3. Retrieves encrypted data from database
4. Session established with JWT token
5. All saved settings/wallets available
```

**Database Schema:**
```sql
CREATE TABLE user_profiles (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255),
    
    -- Nostr authentication (NIP-46)
    npub VARCHAR(64) UNIQUE,  -- Nostr public key (bech32 encoded)
    nostr_verified BOOLEAN DEFAULT false,
    
    -- Traditional authentication (optional, for non-Nostr users)
    password_hash TEXT,  -- Argon2id hash (nullable if using Nostr auth)
    salt TEXT,
    
    -- Encryption
    master_key_encrypted TEXT NOT NULL,  -- User's master key (encrypted)
    
    -- Authentication method
    auth_method VARCHAR(20) DEFAULT 'password',  -- 'nostr', 'password', 'both'
    
    -- Session management
    last_login TIMESTAMP,
    session_token TEXT,
    session_expires_at TIMESTAMP,
    
    -- Settings
    default_display_currency VARCHAR(10) DEFAULT 'BTC',
    sound_enabled BOOLEAN DEFAULT true,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Ensure at least one auth method
    CONSTRAINT check_auth_method CHECK (
        (password_hash IS NOT NULL AND salt IS NOT NULL) OR 
        (npub IS NOT NULL AND nostr_verified = true)
    )
);

CREATE TABLE nostr_auth_challenges (
    id BIGSERIAL PRIMARY KEY,
    challenge TEXT UNIQUE NOT NULL,  -- Random string to sign
    npub VARCHAR(64) NOT NULL,
    
    -- Verification
    signature TEXT,  -- User's signature of the challenge
    verified BOOLEAN DEFAULT false,
    
    -- Expiry
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '5 minutes',
    used BOOLEAN DEFAULT false,
    
    INDEX idx_challenge (challenge),
    INDEX idx_npub (npub),
    INDEX idx_expires (expires_at)
);

CREATE TABLE user_wallets (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES user_profiles(id) ON DELETE CASCADE,
    
    -- Wallet identification
    wallet_name VARCHAR(100) NOT NULL,  -- e.g., "My Blink Account", "Alby Wallet"
    wallet_type VARCHAR(20) NOT NULL,   -- 'blink', 'nwc', 'lightning_address'
    is_default BOOLEAN DEFAULT false,
    
    -- Blink credentials (encrypted)
    blink_api_key_encrypted TEXT,
    blink_wallet_id_encrypted TEXT,
    blink_username VARCHAR(50),
    
    -- NWC credentials (encrypted)
    nwc_connection_string_encrypted TEXT,
    nwc_relay_url TEXT,
    nwc_pubkey TEXT,
    
    -- Metadata
    last_used TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(user_id, wallet_name)
);

CREATE TABLE saved_tip_recipients (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES user_profiles(id) ON DELETE CASCADE,
    
    -- Recipient info
    recipient_name VARCHAR(100) NOT NULL,  -- Display name, e.g., "John (Cashier)"
    recipient_type VARCHAR(20) NOT NULL,   -- 'blink', 'lightning_address', 'npub'
    
    -- Contact details
    blink_username VARCHAR(50),
    lightning_address VARCHAR(255),
    npub TEXT,
    
    -- Settings
    default_tip_percent DECIMAL(5,2),  -- Default tip % for this person
    is_favorite BOOLEAN DEFAULT false,
    
    -- Usage tracking
    tips_sent_count INTEGER DEFAULT 0,
    total_tips_amount BIGINT DEFAULT 0,
    last_tipped TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(user_id, recipient_name)
);
```

**UI Features:**

**Login Screen:**
```
┌─────────────────────────────────────┐
│         BlinkPOS Login              │
│                                     │
│  Recommended:                       │
│  ┌───────────────────────────────┐  │
│  │  🔑 Sign in with Nostr       │  │
│  │  (keys.band / Amber)          │  │
│  └───────────────────────────────┘  │
│                                     │
│  ─────────── OR ────────────        │
│                                     │
│  Username: [____________]           │
│  Password: [____________]           │
│                                     │
│  [ ] Remember me                    │
│                                     │
│  [      Log In      ]               │
│  [  Create Account  ]               │
│                                     │
│  Forgot password?                   │
└─────────────────────────────────────┘
```

**Nostr Sign-In Flow (Desktop - keys.band):**
```
┌─────────────────────────────────────┐
│    Sign in with Nostr               │
│                                     │
│  Waiting for signature...           │
│                                     │
│  ┌───────────────────────────────┐  │
│  │                               │  │
│  │   [QR Code for mobile]        │  │
│  │                               │  │
│  └───────────────────────────────┘  │
│                                     │
│  Or use your keys.band extension    │
│  to sign the challenge              │
│                                     │
│  Challenge: f3a7b2c9d4e8...         │
│                                     │
│  [    Cancel    ]                   │
└─────────────────────────────────────┘
```

**Nostr Sign-In Flow (Mobile - Amber):**
```
User clicks "Sign in with Nostr"
→ BlinkPOS opens Amber with intent
→ Amber shows: "Sign challenge for BlinkPOS?"
→ User approves in Amber
→ Returns to BlinkPOS, logged in
```

**Wallet Selector:**
```
┌─────────────────────────────────────┐
│      Select Merchant Wallet         │
│                                     │
│  ● My Blink Account (Default)       │
│    └─ Balance: 125,430 sats         │
│                                     │
│  ○ Alby Wallet (NWC)                │
│    └─ Balance: 50,000 sats          │
│                                     │
│  ○ Self-Custodial Node (NWC)        │
│    └─ Connected via NWC             │
│                                     │
│  [+ Add New Wallet]                 │
└─────────────────────────────────────┘
```

**Tip Recipient Selector:**
```
┌─────────────────────────────────────┐
│      Select Tip Recipient           │
│                                     │
│  Favorites:                         │
│  ⭐ John (Cashier) - @john_blink    │
│  ⭐ Sarah (Server) - sarah@ln.com   │
│                                     │
│  Recent:                            │
│  👤 Mike (Barista) - npub1...       │
│  👤 Lisa (Manager) - @lisa_blink    │
│                                     │
│  [+ Add New Recipient]              │
│  [ Split Among Team ]               │
└─────────────────────────────────────┘
```

**Implementation:**
```javascript
// lib/auth-manager.js
import { hash, verify } from 'argon2';
import { randomBytes } from 'crypto';
import { nip19, verifySignature, getPublicKey } from 'nostr-tools';

class AuthManager {
  
  // ========================================
  // NOSTR AUTHENTICATION (NIP-46)
  // ========================================
  
  async initiateNostrSignIn() {
    // Generate random challenge
    const challenge = randomBytes(32).toString('hex');
    
    // Store challenge in database
    await db.query(`
      INSERT INTO nostr_auth_challenges (challenge, npub, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '5 minutes')
    `, [challenge, null]); // npub filled in later
    
    return {
      challenge,
      message: `Sign in to BlinkPOS\n\nChallenge: ${challenge}\nTimestamp: ${Date.now()}`
    };
  }
  
  async verifyNostrSignature(challenge, signature, npub) {
    // Fetch challenge from database
    const result = await db.query(`
      SELECT * FROM nostr_auth_challenges 
      WHERE challenge = $1 
        AND used = false 
        AND expires_at > NOW()
    `, [challenge]);
    
    if (!result.rows.length) {
      throw new Error('Invalid or expired challenge');
    }
    
    // Decode npub to hex pubkey
    const { data: pubkeyHex } = nip19.decode(npub);
    
    // Verify signature
    const messageToSign = `Sign in to BlinkPOS\n\nChallenge: ${challenge}\nTimestamp: ${result.rows[0].created_at.getTime()}`;
    
    const isValid = verifySignature({
      pubkey: pubkeyHex,
      sig: signature,
      content: messageToSign,
      kind: 27235, // NIP-46 auth event kind
      created_at: Math.floor(result.rows[0].created_at.getTime() / 1000),
      tags: []
    });
    
    if (!isValid) {
      throw new Error('Invalid signature');
    }
    
    // Mark challenge as used
    await db.query(`
      UPDATE nostr_auth_challenges 
      SET used = true, verified = true, signature = $1, npub = $2
      WHERE challenge = $3
    `, [signature, npub, challenge]);
    
    // Check if user exists
    let user = await db.query(`
      SELECT * FROM user_profiles WHERE npub = $1
    `, [npub]);
    
    // If not, create account
    if (!user.rows.length) {
      const username = `nostr_${pubkeyHex.substring(0, 8)}`;
      const masterKey = randomBytes(32);
      const masterKeyEncrypted = await this.encryptWithNostrKey(
        masterKey,
        pubkeyHex
      );
      
      await db.query(`
        INSERT INTO user_profiles 
          (username, npub, master_key_encrypted, auth_method, nostr_verified)
        VALUES ($1, $2, $3, 'nostr', true)
      `, [username, npub, masterKeyEncrypted]);
      
      user = await db.query(`
        SELECT * FROM user_profiles WHERE npub = $1
      `, [npub]);
    }
    
    // Generate session token
    const sessionToken = jwt.sign(
      { userId: user.rows[0].id, npub, authMethod: 'nostr' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Update session
    await db.query(`
      UPDATE user_profiles 
      SET session_token = $1, 
          session_expires_at = NOW() + INTERVAL '7 days',
          last_login = NOW()
      WHERE id = $2
    `, [sessionToken, user.rows[0].id]);
    
    return { 
      sessionToken, 
      userId: user.rows[0].id,
      username: user.rows[0].username,
      npub
    };
  }
  
  // Integration with keys.band (browser extension)
  async signInWithKeysband() {
    const { challenge, message } = await this.initiateNostrSignIn();
    
    // Call keys.band extension via NIP-07
    if (typeof window.nostr !== 'undefined') {
      const pubkey = await window.nostr.getPublicKey();
      const npub = nip19.npubEncode(pubkey);
      
      const signedEvent = await window.nostr.signEvent({
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: message
      });
      
      return await this.verifyNostrSignature(
        challenge, 
        signedEvent.sig, 
        npub
      );
    } else {
      throw new Error('keys.band extension not found');
    }
  }
  
  // Integration with Amber (Android)
  async signInWithAmber() {
    const { challenge, message } = await this.initiateNostrSignIn();
    
    // On Android, use intent to open Amber
    const intent = `intent://sign?${new URLSearchParams({
      message: message,
      challenge: challenge,
      returnTo: 'blinkpos://auth/callback'
    })}#Intent;scheme=nostrsigner;package=com.greenart7c3.nostrsigner;end`;
    
    // This would be handled by Android WebView or React Native
    window.location.href = intent;
    
    // Amber will return to callback with signature
    return { challenge, pending: true };
  }
  
  // ========================================
  // TRADITIONAL PASSWORD AUTHENTICATION
  // ========================================
  
  async register(username, password, email) {
    // Generate salt
    const salt = randomBytes(32).toString('hex');
    
    // Hash password with Argon2id
    const passwordHash = await hash(password, {
      type: 2, // Argon2id
      memoryCost: 2048,
      timeCost: 4,
      parallelism: 2,
      salt: Buffer.from(salt, 'hex')
    });
    
    // Generate master key for encrypting user's credentials
    const masterKey = randomBytes(32);
    const masterKeyEncrypted = await this.encryptWithPassword(
      masterKey,
      password
    );
    
    // Store in database
    await db.query(`
      INSERT INTO user_profiles 
        (username, email, password_hash, salt, master_key_encrypted, auth_method)
      VALUES ($1, $2, $3, $4, $5, 'password')
    `, [username, email, passwordHash, salt, masterKeyEncrypted]);
    
    return { success: true, username };
  }
  
  async login(username, password) {
    // Fetch user
    const user = await db.query(`
      SELECT * FROM user_profiles WHERE username = $1
    `, [username]);
    
    if (!user.rows.length) {
      throw new Error('Invalid username or password');
    }
    
    // Verify password
    const valid = await verify(user.rows[0].password_hash, password);
    
    if (!valid) {
      throw new Error('Invalid username or password');
    }
    
    // Generate session token
    const sessionToken = jwt.sign(
      { userId: user.rows[0].id, username, authMethod: 'password' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Update session
    await db.query(`
      UPDATE user_profiles 
      SET session_token = $1, 
          session_expires_at = NOW() + INTERVAL '7 days',
          last_login = NOW()
      WHERE id = $2
    `, [sessionToken, user.rows[0].id]);
    
    return { 
      sessionToken, 
      userId: user.rows[0].id,
      username 
    };
  }
  
  async getUserWallets(userId) {
    const wallets = await db.query(`
      SELECT 
        id, wallet_name, wallet_type, is_default,
        blink_username, nwc_relay_url, nwc_pubkey
      FROM user_wallets 
      WHERE user_id = $1
      ORDER BY is_default DESC, last_used DESC
    `, [userId]);
    
    // Decrypt credentials for active session
    return wallets.rows.map(wallet => ({
      ...wallet,
      credentials: this.decryptWalletCredentials(wallet)
    }));
  }
  
  async getSavedTipRecipients(userId) {
    const recipients = await db.query(`
      SELECT * FROM saved_tip_recipients
      WHERE user_id = $1
      ORDER BY is_favorite DESC, last_tipped DESC
    `, [userId]);
    
    return recipients.rows;
  }
}
```

**Deliverables:**
- [ ] **Nostr authentication (NIP-46)** ⭐ Priority
  - [ ] Challenge generation and verification
  - [ ] keys.band integration (desktop)
  - [ ] Amber integration (Android)
  - [ ] NIP-07 browser extension support
  - [ ] QR code for mobile signing
  - [ ] Auto-account creation for new npubs
- [ ] Traditional password authentication
  - [ ] User registration/login
  - [ ] Password hashing (Argon2id)
  - [ ] Password reset flow
- [ ] Session management (JWT tokens)
- [ ] Encrypted credential storage
- [ ] Wallet management UI
- [ ] Saved recipient management
- [ ] Quick-select dropdowns
- [ ] "Remember me" functionality

**Benefits:**
- ✅ **Nostr-native authentication** (no passwords needed!)
- ✅ **Privacy-preserving** (cryptographic signing)
- ✅ **Better security** (keys never leave key manager)
- ✅ **Seamless UX** (one-click sign-in on desktop, intent on mobile)
- ✅ Users log in once, credentials persist
- ✅ Switch between wallets with dropdown
- ✅ Quick-select favorite tip recipients
- ✅ No more re-entering API keys
- ✅ No more typing NWC connection strings
- ✅ Multi-device support (cloud-synced)

**Supported Key Managers:**
- **Desktop:** [keys.band](https://keys.band/) browser extension (Chrome, Firefox, Brave)
- **Mobile:** [Amber](https://github.com/greenart7c3/Amber) for Android (NIP-55 support)
- **Future:** nos2x, Alby extension, other NIP-07 signers

---

### 1.3 Payment Abstraction Layer
**Status:** Planning  
**Timeline:** 4-6 weeks  
**Dependencies:** Hybrid storage complete

**Objective:** Create a unified interface for different payment types.

**Architecture:**
```javascript
// Abstraction layer
class PaymentRouter {
  async forwardPayment(payment, destination) {
    if (destination.type === 'blink') {
      return await this.blinkIntraledger(payment, destination);
    } else if (destination.type === 'lightning_address') {
      return await this.lightningAddress(payment, destination);
    } else if (destination.type === 'nwc') {
      return await this.nwcPayment(payment, destination);
    } else if (destination.type === 'cashu_token') {
      return await this.cashuToken(payment, destination);
    }
  }
}
```

**Deliverables:**
- [ ] Payment router abstraction
- [ ] Destination type registry
- [ ] Fee calculation logic
- [ ] Fallback mechanisms
- [ ] Transaction logging

**Benefits:**
- Easy to add new payment types
- Consistent error handling
- Unified monitoring
- Clear upgrade path

---

## Phase 2: NWC Integration (Q2-Q3 2026)

### 2.1 NWC Client Library
**Status:** Research  
**Timeline:** 6-8 weeks  
**Dependencies:** Payment abstraction layer

**Objective:** Enable BlinkPOS to connect to any NWC-enabled wallet.

**Implementation:**
```javascript
// lib/nwc-client.js
import { nip04, nip47 } from 'nostr-tools';

class NWCClient {
  constructor(connectionString) {
    // Parse: nostr+walletconnect://pubkey?relay=...&secret=...
    this.config = parseNWCString(connectionString);
    this.relay = connectToRelay(this.config.relay);
  }

  async payInvoice(bolt11, amount) {
    const request = {
      method: 'pay_invoice',
      params: {
        invoice: bolt11,
        amount: amount // optional, for zero-amount invoices
      }
    };

    const encrypted = await nip04.encrypt(
      this.config.secret,
      this.config.walletPubkey,
      JSON.stringify(request)
    );

    // Send to relay and wait for response
    const response = await this.sendAndWait(encrypted);
    return parseNWCResponse(response);
  }

  async createInvoice(amount, memo) {
    const request = {
      method: 'make_invoice',
      params: {
        amount: amount,
        description: memo
      }
    };
    // ... similar flow
  }
}
```

**Deliverables:**
- [ ] NWC connection string parser
- [ ] Nostr relay integration
- [ ] NIP-04 encryption/decryption
- [ ] NIP-47 command handlers
- [ ] Connection status monitoring
- [ ] Error handling and retries

---

### 2.2 Multi-Wallet Merchant Support
**Status:** Planning  
**Timeline:** 8-10 weeks  
**Dependencies:** NWC client library

**Objective:** Allow merchants to use ANY Lightning wallet via NWC.

**User Flow:**
```
1. Merchant opens BlinkPOS settings
2. Chooses "Connect External Wallet"
3. Options:
   - "I have a Blink account" → Current flow (intraledger)
   - "I have a Lightning wallet" → NWC connection
4. For NWC:
   - Shows instructions for generating connection string
   - Links to supported wallets
   - Paste connection string
   - Test connection
   - Save and use
```

**Architecture Changes:**
```javascript
// User profile now includes wallet config
{
  username: "merchant123",
  walletType: "nwc" | "blink",
  
  // For Blink
  blinkApiKey: "...",
  blinkWalletId: "...",
  
  // For NWC
  nwcConnectionString: "nostr+walletconnect://...",
  nwcPermissions: ["pay_invoice", "make_invoice"],
  nwcSpendingLimit: 1000000, // sats per day
}
```

**Deliverables:**
- [ ] Wallet type selection UI
- [ ] NWC connection string input
- [ ] Connection testing
- [ ] Wallet switching
- [ ] Balance display for NWC wallets
- [ ] Transaction history sync

**Benefits:**
- Merchants can use self-custodial wallets
- No forced Blink account requirement
- Support for hardware wallet integration
- User owns their keys

---

## Phase 3: Multi-Destination Tips (Q3-Q4 2026)

### 3.1 Lightning Address Support
**Status:** Planning  
**Timeline:** 4-6 weeks  
**Dependencies:** Payment router, NWC integration

**Objective:** Allow tips to any Lightning Address, not just Blink users.

**Implementation:**
```javascript
// lib/lightning-address.js
class LightningAddressClient {
  async payToAddress(address, amount, memo) {
    // address format: user@domain.com
    const [user, domain] = address.split('@');
    
    // Step 1: Fetch LNURL metadata
    const lnurlData = await fetch(`https://${domain}/.well-known/lnurlp/${user}`);
    
    // Step 2: Check if amount is within limits
    if (amount < lnurlData.minSendable || amount > lnurlData.maxSendable) {
      throw new Error('Amount out of range');
    }
    
    // Step 3: Request invoice
    const invoiceResponse = await fetch(lnurlData.callback, {
      params: { amount: amount * 1000, comment: memo }
    });
    
    // Step 4: Pay invoice via payment router
    return await paymentRouter.payInvoice(invoiceResponse.pr);
  }
}
```

**UI Changes:**
```
Tip Recipient Configuration:
  [ ] Blink User (@blink.sv)
      Username: [pretyflaco]
  
  [ ] Lightning Address
      Address: [staff@restaurant.com]
  
  [ ] Nostr Profile (npub)
      npub: [npub1...]
```

**Deliverables:**
- [ ] LNURL-pay client
- [ ] Lightning Address validation
- [ ] Invoice request handling
- [ ] Error handling for unavailable addresses
- [ ] Fallback mechanisms

**Fee Impact:**
- Blink → Blink: $0 (intraledger)
- Blink → External LN Address: ~1-5 sats (routing fees)
- NWC wallet → Any destination: depends on wallet's routing

---

### 3.2 Nostr Profile (npub) Support
**Status:** Research  
**Timeline:** 6-8 weeks  
**Dependencies:** Lightning Address support

**Objective:** Send tips to Nostr profiles (looks up Lightning Address from profile).

**How it works:**
```
1. User enters npub1...
2. BlinkPOS queries Nostr relays for profile
3. Extracts "lud16" field (Lightning Address)
4. Falls back to "lud06" field (LNURL) if lud16 not present
5. Proceeds with Lightning Address payment
```

**Implementation:**
```javascript
// lib/nostr-profile.js
import { SimplePool, nip19 } from 'nostr-tools';

class NostrProfileClient {
  async getLightningAddress(npub) {
    const { data: pubkey } = nip19.decode(npub);
    
    const pool = new SimplePool();
    const relays = [
      'wss://relay.damus.io',
      'wss://relay.nostr.band',
      'wss://nos.lol'
    ];
    
    const profile = await pool.get(relays, {
      kinds: [0], // metadata
      authors: [pubkey]
    });
    
    if (!profile) throw new Error('Profile not found');
    
    const metadata = JSON.parse(profile.content);
    
    // Prefer lud16 (Lightning Address)
    if (metadata.lud16) return metadata.lud16;
    
    // Fallback to lud06 (LNURL)
    if (metadata.lud06) return decodeLNURL(metadata.lud06);
    
    throw new Error('No Lightning payment method in profile');
  }
}
```

**Deliverables:**
- [ ] Nostr relay pool management
- [ ] Profile metadata parsing
- [ ] npub/nprofile validation
- [ ] Lightning Address extraction
- [ ] Caching for performance
- [ ] UI for npub entry

---

## Phase 4: Voucher System (Q4 2026 - Q1 2027)

### 4.1 Bitcoin Voucher Sales
**Status:** Planning  
**Timeline:** 10-12 weeks  
**Dependencies:** Hybrid storage, payment router

**Use Case:**
> Customer comes to agent with cash/mobile money. Agent creates a bitcoin voucher (redeemable code/token) and gives to customer. Customer can redeem later for actual bitcoin.

**Why This Is Perfect for Cashu:**
- Bearer tokens (vouchers are transferable)
- Offline redemption possible
- Privacy (no KYC for small amounts)
- Simple UX (scan QR code to redeem)

**Architecture:**
```
Customer (Cash) → Agent → BlinkPOS
                            ↓
                     Creates Cashu Token
                            ↓
                    Backed by Lightning
                            ↓
             Voucher (QR code + string)
                            ↓
                       Customer
                            ↓
                    Redeems Anytime
                            ↓
             Lightning wallet / Cashu wallet
```

**Implementation:**
```javascript
// pages/api/vouchers/create.js
import CashuClient from '../../lib/cashu-client';

async function createVoucher(req, res) {
  const { amountSats, currency, fiatAmount } = req.body;
  
  // Step 1: Agent pays via their wallet
  // (Could be Blink intraledger or NWC payment)
  
  // Step 2: Mint Cashu token
  const cashu = new CashuClient(process.env.CASHU_MINT_URL);
  const token = await cashu.mintToken(amountSats, {
    memo: `Bitcoin Voucher - ${currency} ${fiatAmount}`
  });
  
  // Step 3: Store voucher in database
  await db.query(`
    INSERT INTO vouchers (token, amount, currency, fiat_amount, agent_id, status)
    VALUES ($1, $2, $3, $4, $5, 'active')
  `, [token, amountSats, currency, fiatAmount, req.user.id]);
  
  // Step 4: Generate QR code and return
  return res.json({
    token: token,
    qrCode: generateQR(token),
    amount: amountSats,
    redemptionUrl: `https://pos.blink.sv/redeem/${token}`
  });
}
```

**Database Schema:**
```sql
CREATE TABLE vouchers (
    id BIGSERIAL PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    amount BIGINT NOT NULL,
    currency VARCHAR(10),
    fiat_amount DECIMAL(20,2),
    
    -- Agent info
    agent_id VARCHAR(100) NOT NULL,
    agent_commission BIGINT, -- in sats
    
    -- Status tracking
    status VARCHAR(20) DEFAULT 'active',
    -- active, redeemed, expired, cancelled
    
    created_at TIMESTAMP DEFAULT NOW(),
    redeemed_at TIMESTAMP,
    redeemed_by VARCHAR(100),
    expires_at TIMESTAMP,
    
    -- Metadata
    notes TEXT,
    metadata JSONB,
    
    INDEX idx_token (token),
    INDEX idx_agent (agent_id),
    INDEX idx_status (status)
);
```

**Deliverables:**
- [ ] Cashu mint integration
- [ ] Voucher creation API
- [ ] Voucher redemption API
- [ ] QR code generation
- [ ] Expiry management
- [ ] Agent commission tracking
- [ ] Voucher UI (create, list, manage)

**Benefits:**
- Cash-to-bitcoin onramp
- No bank account needed
- Works in areas with poor internet
- Privacy-preserving
- Agent network scalability

---

### 4.2 Agent Commission Splits
**Status:** Planning  
**Timeline:** 8-10 weeks  
**Dependencies:** Voucher system, payment router

**Use Case:**
> SIM card reseller agents sell SIM cards and collect payment in bitcoin. Upon customer payment, agent commission is automatically split and sent to agent's wallet.

**Flow:**
```
Customer → Pays for SIM card via Lightning
            ↓
    BlinkPOS receives payment
            ↓
      ┌─────┴─────┐
      ↓           ↓
  Base Amount  Commission
      ↓           ↓
  Company      Agent Wallet
  Treasury    (instant payment)
```

**Implementation:**
```javascript
// Enhanced payment split logic
async function processAgentSale(payment, agentConfig) {
  const { totalAmount, productId } = payment;
  const { agentId, commissionRate } = agentConfig;
  
  // Calculate split
  const commissionAmount = Math.floor(totalAmount * commissionRate);
  const companyAmount = totalAmount - commissionAmount;
  
  // Store split metadata
  await db.query(`
    INSERT INTO agent_sales (
      payment_hash, agent_id, product_id,
      total_amount, commission_amount, company_amount
    ) VALUES ($1, $2, $3, $4, $5, $6)
  `, [payment.hash, agentId, productId, totalAmount, commissionAmount, companyAmount]);
  
  // Execute payments in parallel
  const [companyPayment, agentPayment] = await Promise.all([
    paymentRouter.forwardPayment({
      amount: companyAmount,
      destination: { type: 'blink', walletId: process.env.COMPANY_WALLET_ID }
    }),
    paymentRouter.forwardPayment({
      amount: commissionAmount,
      destination: getAgentDestination(agentId) // Could be Blink, NWC, or Lightning Address
    })
  ]);
  
  return { companyPayment, agentPayment };
}
```

**Database Schema:**
```sql
CREATE TABLE agent_sales (
    id BIGSERIAL PRIMARY KEY,
    payment_hash VARCHAR(64) NOT NULL,
    agent_id VARCHAR(100) NOT NULL,
    product_id VARCHAR(100),
    
    -- Amounts
    total_amount BIGINT NOT NULL,
    commission_amount BIGINT NOT NULL,
    company_amount BIGINT NOT NULL,
    commission_rate DECIMAL(5,4), -- e.g., 0.15 for 15%
    
    -- Agent payment destination
    agent_wallet_type VARCHAR(20), -- blink, nwc, lightning_address
    agent_wallet_address TEXT,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending',
    company_payment_hash VARCHAR(64),
    agent_payment_hash VARCHAR(64),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP,
    
    INDEX idx_agent (agent_id),
    INDEX idx_payment_hash (payment_hash),
    INDEX idx_created_at (created_at DESC)
);

CREATE TABLE agents (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    
    -- Commission settings
    default_commission_rate DECIMAL(5,4),
    
    -- Payment preferences
    preferred_payment_method VARCHAR(20),
    blink_username VARCHAR(50),
    lightning_address VARCHAR(255),
    nwc_connection_string TEXT,
    npub TEXT,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Stats
    total_sales_count INTEGER DEFAULT 0,
    total_sales_volume BIGINT DEFAULT 0,
    total_commissions_earned BIGINT DEFAULT 0
);
```

**Deliverables:**
- [ ] Agent management system
- [ ] Commission rate configuration
- [ ] Automatic split calculation
- [ ] Multi-destination agent payments
- [ ] Agent dashboard (sales, commissions)
- [ ] Company treasury management
- [ ] Reporting and analytics

---

## Phase 5: Advanced Features (2027+)

### 5.1 Multi-Recipient Tip Splitting 💡 NEW
**Status:** Planning  
**Timeline:** 6-8 weeks  
**Dependencies:** Payment router, persistent authentication

**Use Case:** Split a single tip among multiple team members.

**Example Scenarios:**
- Restaurant: Split tip between server, busser, and kitchen staff
- Retail: Split between sales associate and manager
- Service team: Distribute among all present staff
- Equal or custom percentages

**User Flow:**
```
1. Customer amount: $20
2. Add 15% tip: $3.00
3. Click "Split Among Team"
4. Select recipients:
   ☑ John (Server) - 50%
   ☑ Sarah (Busser) - 30%
   ☑ Kitchen Staff - 20%
5. Preview split:
   - Base to merchant: $20.00
   - John receives: $1.50 (50% of $3)
   - Sarah receives: $0.90 (30% of $3)
   - Kitchen receives: $0.60 (20% of $3)
6. Create invoice
```

**Implementation:**
```javascript
// Enhanced tip splitting
async function processTipSplit(payment, tipSplit) {
  const { totalAmount, baseAmount, tipAmount } = payment;
  const { recipients } = tipSplit; // Array of {recipient, percentage}
  
  // Validate percentages sum to 100
  const totalPercent = recipients.reduce((sum, r) => sum + r.percentage, 0);
  if (totalPercent !== 100) {
    throw new Error('Split percentages must sum to 100%');
  }
  
  // Forward base amount to merchant
  await paymentRouter.forwardPayment({
    amount: baseAmount,
    destination: merchantWallet
  });
  
  // Split tip among recipients
  const tipPayments = recipients.map(async (recipient) => {
    const recipientAmount = Math.floor(tipAmount * recipient.percentage / 100);
    
    // Store split record
    await db.query(`
      INSERT INTO tip_splits 
        (payment_hash, recipient_id, amount, percentage)
      VALUES ($1, $2, $3, $4)
    `, [payment.hash, recipient.id, recipientAmount, recipient.percentage]);
    
    // Send payment
    return await paymentRouter.forwardPayment({
      amount: recipientAmount,
      destination: recipient.destination,
      memo: `Tip split (${recipient.percentage}%): ${payment.memo}`
    });
  });
  
  // Execute all tip payments in parallel
  const results = await Promise.allSettled(tipPayments);
  
  return {
    basePayment: { success: true },
    tipPayments: results
  };
}
```

**Database Schema:**
```sql
CREATE TABLE tip_split_groups (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES user_profiles(id),
    group_name VARCHAR(100) NOT NULL,  -- e.g., "Evening Shift Team"
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    last_used TIMESTAMP,
    use_count INTEGER DEFAULT 0,
    
    UNIQUE(user_id, group_name)
);

CREATE TABLE tip_split_members (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT REFERENCES tip_split_groups(id) ON DELETE CASCADE,
    recipient_id BIGINT REFERENCES saved_tip_recipients(id),
    
    default_percentage DECIMAL(5,2) NOT NULL,
    display_order INTEGER DEFAULT 0,
    
    UNIQUE(group_id, recipient_id)
);

CREATE TABLE tip_splits (
    id BIGSERIAL PRIMARY KEY,
    payment_hash VARCHAR(64) NOT NULL,
    recipient_id BIGINT REFERENCES saved_tip_recipients(id),
    
    amount BIGINT NOT NULL,
    percentage DECIMAL(5,2) NOT NULL,
    
    status VARCHAR(20) DEFAULT 'pending',
    payment_hash_result VARCHAR(64),
    
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP,
    
    INDEX idx_payment_hash_splits (payment_hash)
);
```

**UI Features:**

**Saved Split Groups:**
```
┌─────────────────────────────────────┐
│       Tip Split Configuration       │
│                                     │
│  Saved Groups:                      │
│                                     │
│  📋 Day Shift Team                  │
│     ├─ John (Server) - 40%          │
│     ├─ Sarah (Busser) - 30%         │
│     └─ Kitchen - 30%                │
│                                     │
│  📋 Evening Shift Team              │
│     ├─ Mike (Server) - 50%          │
│     └─ Kitchen - 50%                │
│                                     │
│  [+ Create New Group]               │
│  [ Custom Split ]                   │
└─────────────────────────────────────┘
```

**Custom Split UI:**
```
┌─────────────────────────────────────┐
│       Custom Tip Split              │
│                                     │
│  Total Tip: $3.00 (₿ 5,000 sats)   │
│                                     │
│  Recipients:                        │
│                                     │
│  👤 John (Server)                   │
│     [50]% = $1.50 (2,500 sats)     │
│     [Remove]                        │
│                                     │
│  👤 Sarah (Busser)                  │
│     [30]% = $0.90 (1,500 sats)     │
│     [Remove]                        │
│                                     │
│  👤 Kitchen Staff                   │
│     [20]% = $0.60 (1,000 sats)     │
│     [Remove]                        │
│                                     │
│  Total: 100% ✓                      │
│                                     │
│  [+ Add Recipient]                  │
│  [ Split Equally ]                  │
│  [ Save as Group ]                  │
│  [    Continue    ]                 │
└─────────────────────────────────────┘
```

**Advanced Features:**
- **Equal Split Button:** Automatically divides 100% equally
- **Rounding Handling:** Ensure satoshis sum correctly (largest recipient gets remainder)
- **Minimum Amounts:** Warn if any recipient gets < 100 sats
- **Failed Payment Handling:** Retry or return to tip pool
- **Reporting:** Show each team member their daily tip total

**Deliverables:**
- [ ] Multi-recipient tip split logic
- [ ] Saved split group management
- [ ] Custom split UI
- [ ] Percentage validation
- [ ] Parallel payment execution
- [ ] Split transaction logging
- [ ] Team member tip reports
- [ ] Rounding and edge case handling

**Benefits:**
- ✅ Fair tip distribution
- ✅ Saved team configurations
- ✅ Flexible custom splits
- ✅ Transparent for all parties
- ✅ Reduced manual work

---

### 5.2 Batch Payment Optimization
**Timeline:** Q2 2027

When using non-intraledger destinations, implement batching for efficiency:
- Pool small tips throughout the day
- Batch settle once daily
- Reduce overall Lightning fees

**When batching makes sense:**
- External Lightning Addresses (fees per payment)
- Cashu voucher settlements
- Cross-mint/cross-custodian transfers

**When batching doesn't help:**
- Blink intraledger (already zero fee)
- Instant settlement required

---

### 5.3 Multi-Currency Vouchers
**Timeline:** Q3 2027

Extend voucher system to support:
- Stable sats (synthetic USD)
- Multiple currency denominations
- Fiat-pegged Cashu tokens (if mints support)

---

### 5.4 Subscription Payments
**Timeline:** Q4 2027

Using NWC's budget/permission model:
- Recurring payments
- Pre-authorized spending
- Usage-based billing
- Integration with Lightning Service Providers

---

### 5.5 Biometric Authentication
**Timeline:** Q1 2028

Enhance security and convenience:
- Fingerprint login
- Face ID support
- Hardware security key (YubiKey, etc.)
- Reduces password fatigue

---

### 5.6 Hardware Wallet Integration
**Timeline:** 2028

Via NWC:
- Connect BlinkPOS to hardware Lightning signers
- Cold storage for treasury
- Multi-sig support

---

## Technology Decision Matrix

### When to Use What

| Use Case | Recommended Tech | Reasoning |
|----------|-----------------|-----------|
| **Merchant receives POS payment** | Blink / NWC wallet | User choice, both work |
| **Forward to Blink merchant** | Blink intraledger | Zero fee, instant |
| **Forward to external wallet** | Lightning payment | Standard interoperability |
| **Tip to @blink.sv user** | Blink intraledger | Zero fee, instant |
| **Tip to Lightning Address** | Lightning payment | ~1-5 sats fee |
| **Tip to npub** | Resolve to LN Address → Lightning | Standard method |
| **Bitcoin vouchers** | **Cashu tokens** | Bearer tokens, offline, perfect fit |
| **Agent commissions to Blink** | Blink intraledger | Zero fee, instant |
| **Agent commissions to external** | Lightning / NWC | Flexibility |
| **Customer pays** | Lightning invoice | Universal compatibility |

---

## Revised Cashu Assessment

### ❌ NOT Recommended For:
- POS tips to Blink users (intraledger is better)
- Merchant payments within Blink ecosystem (intraledger is better)
- Any scenario where instant, zero-fee intraledger is available

### ✅ HIGHLY Recommended For:
- **Bitcoin vouchers** (bearer tokens, transferable, redeemable offline)
- Gift cards
- Promotional codes
- Any "claim later" payment scenario

### 🤔 Consider For:
- Batch settlements to external recipients (aggregate daily)
- Privacy-focused tips (where blind signatures add value)
- Offline transaction scenarios

---

## Implementation Priorities

### Must-Have (2026)
1. ✅ Hybrid Storage (Redis + Postgres)
2. ✅ **Persistent Authentication** (new - saves credentials, wallets)
3. ✅ Payment Abstraction Layer
4. ✅ NWC Integration
5. ✅ Lightning Address tips

### Should-Have (2026-2027)
6. 🟡 **Multi-recipient tip splitting** (new - split among team)
7. 🟡 Nostr npub tips
8. 🟡 Cashu voucher system
9. 🟡 Agent commission splits

### Nice-to-Have (2027+)
10. 🔵 Batch payment optimization
11. 🔵 Multi-currency vouchers
12. 🔵 Subscription payments
13. 🔵 Biometric authentication
14. 🔵 Hardware wallet integration

---

## Success Metrics

### Phase 1 (Foundation)
- [ ] Hybrid storage handles 10,000+ payments/day
- [ ] Zero data loss
- [ ] <1ms read latency
- [ ] 99.9%+ uptime
- [ ] 100+ users with persistent accounts
- [ ] <5 seconds login to transaction time

### Phase 2 (NWC)
- [ ] 3+ wallet types supported (Blink, Alby, Mutiny, etc.)
- [ ] 100+ merchants using non-Blink wallets
- [ ] NWC payment success rate >95%
- [ ] 500+ saved tip recipients across all users
- [ ] Multi-recipient splits working

### Phase 3 (Multi-Destination)
- [ ] Lightning Address tips working
- [ ] 50+ different recipient domains
- [ ] npub resolution working
- [ ] Team tip splits used by 50+ merchants

### Phase 4 (Vouchers)
- [ ] 1,000+ vouchers created
- [ ] 90%+ redemption rate
- [ ] Agent network of 50+ agents
- [ ] $10k+ in voucher volume

---

## Risk Mitigation

### Technical Risks
| Risk | Mitigation |
|------|------------|
| NWC wallet disconnection | Retry logic, fallback to regular Lightning |
| Cashu mint failure | Multiple mint support, automatic failover |
| Lightning routing failures | Alternative routes, fee optimization |
| Database performance | Redis caching, query optimization |

### Business Risks
| Risk | Mitigation |
|------|------------|
| Low NWC adoption | Keep Blink as primary, NWC as optional |
| Regulatory issues with vouchers | Legal review, compliance framework |
| Agent fraud | KYC for agents, transaction limits |
| Mint trust issues | Use reputable mints, regular audits |

### User Experience Risks
| Risk | Mitigation |
|------|------------|
| NWC complexity | Clear documentation, video tutorials |
| Voucher confusion | Simple UI, clear instructions |
| Payment failures | Comprehensive error messages, support |

---

## Open Questions / Research Needed

1. **NWC Maturity**: How mature is Blink's NWC implementation? Timeline?
2. **Cashu Mints**: Which mints are reputable for production use?
3. **Regulatory**: What are the legal implications of running a voucher system?
4. **Agent KYC**: Do agents need KYC? Threshold amounts?
5. **Fee Structure**: How to communicate fees to users (Blink free, Lightning not)?
6. **Offline Support**: Can we make BlinkPOS work offline with NWC?

---

## Resources & References

### Nostr Authentication
- **NIP-46 (Nostr Connect):** https://github.com/nostr-protocol/nips/blob/master/46.md
- **NIP-07 (Browser Extension):** https://github.com/nostr-protocol/nips/blob/master/07.md
- **NIP-55 (Android Signer):** https://github.com/nostr-protocol/nips/blob/master/55.md
- **keys.band:** https://keys.band/ - Browser extension for Nostr key management
- **Amber:** https://github.com/greenart7c3/Amber - Android Nostr event signer

### NWC (Wallet Connect)
- NIP-47 Specification: https://github.com/nostr-protocol/nips/blob/master/47.md
- Alby NWC Guide: https://guides.getalby.com/user-guide/v/alby-account-and-browser-extension/alby-hub/nwc
- NWC Dev Portal: https://nwc.dev

### Cashu
- Cashu Protocol: https://github.com/cashubtc/nuts
- Cashu.space: https://cashu.space
- Cashu TS SDK: https://github.com/cashubtc/cashu-ts

### Lightning
- Lightning Address: https://lightningaddress.com
- LNURL Spec: https://github.com/lnurl/luds
- Blink API Docs: https://dev.blink.sv

### Nostr Protocol
- Nostr Protocol: https://nostr.com
- NIPs Repository: https://github.com/nostr-protocol/nips
- nostr-tools: https://github.com/nbd-wtf/nostr-tools

---

## Next Steps

### Immediate (This Quarter)
1. ✅ Complete hybrid storage implementation
2. ✅ Design payment abstraction layer
3. ✅ **Design persistent authentication system** (new)
4. 🔄 Begin NWC research and prototyping
5. 🔄 Evaluate Cashu mints for voucher system
6. 🔄 Legal review of voucher requirements

### Next Quarter
1. **Implement user authentication & credential management** (new)
2. Implement payment router
3. Build NWC client library
4. Add Lightning Address support
5. **Design multi-recipient tip splitting** (new)
6. Begin voucher system design

### Ongoing
- Monitor NWC ecosystem evolution
- Track Blink's NWC implementation progress
- Evaluate user feedback and adjust priorities
- Security audits and penetration testing

---

**Last Updated:** October 26, 2025  
**Next Review:** End of Q1 2026  
**Owner:** BlinkPOS Development Team  
**Status:** Living document - will evolve as ecosystem matures

