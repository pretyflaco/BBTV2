# Cross-Device Sync & Encryption Analysis

**Date:** January 29, 2026  
**Status:** Analysis Complete - Implementation Pending

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Implementation](#current-implementation)
3. [Security Concerns](#security-concerns)
4. [Nostr Signer Encryption Capabilities](#nostr-signer-encryption-capabilities)
5. [Portal App Analysis](#portal-app-analysis)
6. [Recommended Encryption Strategy](#recommended-encryption-strategy)
7. [Implementation Priorities](#implementation-priorities)
8. [Technical Specifications](#technical-specifications)

---

## Executive Summary

This document analyzes the cross-device sync architecture of the Blink POS application (BBTV2), focusing on encryption implementation and security improvements. The goal is to implement **end-to-end encryption (E2E)** so that the server cannot access sensitive user data (API keys, NWC URIs).

### Key Findings

1. **Current server-side encryption is not E2E** - Server holds decryption keys
2. **External signers (Amber) don't support encryption** - Only signing operations
3. **Client-side CryptoUtils already supports password-based encryption** - Ready for E2E
4. **Portal app supports NIP-46** - Potential for enhanced auth integration

---

## Current Implementation

### What Syncs Cross-Device

| Data Type | Synced | Encrypted | Storage Location |
|-----------|--------|-----------|------------------|
| Blink API Keys | ✅ | ✅ Server-side | `/api/user/sync` |
| NWC Connection URIs | ✅ | ✅ Server-side | `/api/user/sync` |
| Voucher Wallet API Key | ✅ | ✅ Server-side | `/api/user/sync` |
| Blink LN Address Wallets | ✅ | ❌ | `/api/user/sync` |
| npub.cash Wallets | ✅ | ❌ | `/api/user/sync` |
| UI Preferences | ✅ | ❌ | `/api/user/sync` |
| Split Payment Profiles | ✅ | ❌ | `/api/split-profiles` |
| Transaction Labels | ✅ | ❌ | `/api/user/sync` |

### Relevant Files

| File | Purpose |
|------|---------|
| `lib/auth.js` | Server-side encryption (CryptoJS AES) |
| `lib/storage/CryptoUtils.js` | Client-side encryption (AES-256-GCM) |
| `lib/nostr/NostrAuthService.js` | Nostr authentication & NIP-04 |
| `pages/api/user/sync.js` | Sync API endpoint |
| `lib/hooks/useServerSync.js` | Client sync hook |

### Server-Side Encryption (lib/auth.js)

```javascript
const CryptoJS = require('crypto-js');
const JWT_SECRET = process.env.JWT_SECRET || 'blink-balance-tracker-secret-key';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'blink-encryption-key-2025';

// Encrypt API key for storage
static encryptApiKey(apiKey) {
  return CryptoJS.AES.encrypt(apiKey, ENCRYPTION_KEY).toString();
}

// Decrypt API key for use
static decryptApiKey(encryptedKey) {
  const bytes = CryptoJS.AES.decrypt(encryptedKey, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}
```

### Client-Side Encryption (lib/storage/CryptoUtils.js)

- Uses Web Crypto API with **AES-256-GCM**
- Supports device-key encryption (automatic)
- Supports password-based encryption (PBKDF2)
- 100,000 PBKDF2 iterations
- Random IV per encryption

---

## Security Concerns

### Critical Issues

| Issue | Severity | Location | Description |
|-------|----------|----------|-------------|
| Hardcoded fallback secrets | 🔴 Critical | `lib/auth.js:5-6` | Fallback values for `JWT_SECRET` and `ENCRYPTION_KEY` |
| Server holds decryption keys | 🔴 Critical | `lib/auth.js` | Server can decrypt all API keys and NWC URIs |
| CryptoJS uses CBC mode | 🟠 High | `lib/auth.js` | CBC mode is less secure than GCM |
| Weak password hashing | 🟠 High | `lib/auth.js:68` | Uses hardcoded salt `'salt'` |
| Unencrypted sensitive data | 🟡 Medium | `sync.js` | Lightning addresses, split profiles not encrypted |

### Hardcoded Fallback Values

```javascript
// lib/auth.js:5-6 - SECURITY RISK
const JWT_SECRET = process.env.JWT_SECRET || 'blink-balance-tracker-secret-key';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'blink-encryption-key-2025';
```

**Risk:** If environment variables are not set, all instances use the same predictable keys.

### Password Hashing Issue

```javascript
// lib/auth.js:68 - WEAK IMPLEMENTATION
static hashPassword(password) {
  return crypto.pbkdf2Sync(password, 'salt', 1000, 64, 'sha512').toString('hex');
}
```

**Issues:**
- Hardcoded salt `'salt'` (should be random per user)
- Only 1000 iterations (should be 100,000+)

---

## Nostr Signer Encryption Capabilities

### Analysis Summary

| Signer Type | Implementation | Signing | NIP-04 Encrypt | NIP-44 Encrypt |
|-------------|----------------|---------|----------------|----------------|
| **NIP-07 (Browser Extensions)** | `window.nostr` | ✅ | ⚠️ Optional | ❌ |
| **NIP-55 (Amber/Android)** | URL scheme | ✅ | ❌ | ❌ |
| **NIP-46 (Nostr Connect)** | WebSocket relay | ✅ | ✅ Possible | ✅ Possible |
| **Generated Keys** | Local `@noble/curves` | ✅ | ✅ | ✅ |

### NIP-07 Browser Extensions

Browser extensions like Alby, nos2x, and Nostash implement:

```javascript
window.nostr = {
  getPublicKey(): Promise<string>,
  signEvent(event): Promise<SignedEvent>,
  // Optional - not all extensions implement these
  nip04?: {
    encrypt(pubkey, plaintext): Promise<string>,
    decrypt(pubkey, ciphertext): Promise<string>
  },
  nip44?: {
    encrypt(pubkey, plaintext): Promise<string>,
    decrypt(pubkey, ciphertext): Promise<string>
  }
}
```

**Key Finding:** `nip04` and `nip44` are optional. Not all extensions implement them.

### NIP-55 (Amber/Android)

Amber uses Android URL schemes for communication:

```
nostrsigner:<base64-event>?type=sign_event&...
```

**Supported Operations:**
- `get_public_key`
- `sign_event`
- `nip04_encrypt` / `nip04_decrypt` (some versions)
- `nip44_encrypt` / `nip44_decrypt` (some versions)

**Key Finding:** Encryption support varies by version. Cannot rely on it universally.

### NIP-46 (Nostr Connect)

NIP-46 enables remote signing via Nostr relays:

```javascript
// Client sends request
{
  "id": "<random>",
  "method": "sign_event",
  "params": [<unsigned_event>]
}

// Signer responds
{
  "id": "<same>",
  "result": "<signed_event>"
}
```

**Supported Methods:**
- `connect`
- `sign_event`
- `get_public_key`
- `nip04_encrypt` / `nip04_decrypt`
- `nip44_encrypt` / `nip44_decrypt`

**Key Finding:** NIP-46 CAN support encryption if the remote signer implements it.

### Our Current Implementation (NostrAuthService.js)

```javascript
// Lines 1007-1031 - NIP-04 for browser extensions only
async nip04Encrypt(pubkey, plaintext) {
  if (typeof window !== 'undefined' && window.nostr?.nip04?.encrypt) {
    return await window.nostr.nip04.encrypt(pubkey, plaintext);
  }
  throw new Error('NIP-04 encryption not available');
}

async nip04Decrypt(pubkey, ciphertext) {
  if (typeof window !== 'undefined' && window.nostr?.nip04?.decrypt) {
    return await window.nostr.nip04.decrypt(pubkey, ciphertext);
  }
  throw new Error('NIP-04 decryption not available');
}
```

---

## Portal App Analysis

Portal is a React Native/Expo mobile identity wallet.

### Architecture

| Component | Technology |
|-----------|------------|
| Framework | React Native / Expo |
| Core Library | `portal-app-lib` (Rust via WebAssembly) |
| Key Storage | Expo SecureStore (device secure enclave) |
| Authentication | Nostr relay-based (listens for AuthChallengeEvent) |
| NIP-46 | ✅ Supported via `LocalNip46RequestListener` |

### Key Files

- `/context/NostrServiceContext.tsx` - Main Nostr service (1341 lines)
- `/services/PortalAppManager.ts` - Portal app singleton
- Uses `portal-app-lib` Rust library for all cryptographic operations

### Portal NIP-46 Support

Portal implements a NIP-46 request listener:

```typescript
// From NostrServiceContext.tsx
const listenForNip46Request = async (callback) => {
  // Listens for NIP-46 requests on relays
  // Handles sign_event, get_public_key, etc.
}
```

### Integration Possibilities

1. **Login with Portal** - Use NIP-46 for authentication
2. **Remote Signing** - Sign transactions via Portal
3. **Encryption Requests** - Send NIP-44 encrypt/decrypt requests

**Limitation:** Portal handles crypto internally. Cannot access raw nsec.

---

## Recommended Encryption Strategy

### Hybrid Approach Based on Auth Method

Since external signers have varying encryption support, we recommend a **hybrid approach**:

| Auth Method | E2E Encryption Strategy | User Action Required |
|-------------|------------------------|---------------------|
| **Browser Extension (NIP-07)** | Use `nip04.encrypt` if available, fallback to password | None if supported |
| **Generated/Imported Keys** | Use local nsec with NIP-04/44 | None |
| **Amber (NIP-55)** | Password-based encryption | Set sync password |
| **Portal (NIP-46)** | NIP-46 encryption requests or password fallback | None if supported |

### Proposed Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Client App    │     │     Server      │     │   Storage       │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│                 │     │                 │     │                 │
│  1. User enters │     │                 │     │                 │
│     API key     │     │                 │     │                 │
│        │        │     │                 │     │                 │
│        ▼        │     │                 │     │                 │
│  2. Encrypt     │     │                 │     │                 │
│     client-side │     │                 │     │                 │
│     (E2E)       │     │                 │     │                 │
│        │        │     │                 │     │                 │
│        ▼        │────▶│  3. Receive     │────▶│  4. Store       │
│  Send encrypted │     │     encrypted   │     │     encrypted   │
│     blob        │     │     blob        │     │     blob        │
│                 │     │                 │     │                 │
│                 │     │  Server CANNOT  │     │                 │
│                 │     │  decrypt data   │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Encryption Options

#### Option A: Password-Based E2E (Recommended First Step)

**Pros:**
- Works with ALL auth methods
- User controls the key
- Simple to implement (CryptoUtils already supports it)

**Cons:**
- User must remember password
- Need password on each new device

**Implementation:**
```javascript
// Client-side before sync
const encryptedApiKey = await CryptoUtils.encryptWithPassword(apiKey, syncPassword);

// Send to server
await fetch('/api/user/sync', {
  method: 'POST',
  body: JSON.stringify({
    blinkApiAccounts: [{
      ...account,
      apiKey: encryptedApiKey // Already encrypted, server just stores it
    }]
  })
});
```

#### Option B: NIP-04/NIP-44 Based (For Supported Signers)

**Pros:**
- No additional password needed
- Uses existing Nostr key

**Cons:**
- Not supported by all signers
- NIP-04 has known weaknesses

**Implementation:**
```javascript
// Check if NIP-04 available
if (window.nostr?.nip04?.encrypt) {
  // Encrypt to self (own pubkey)
  const encrypted = await window.nostr.nip04.encrypt(myPubkey, apiKey);
}
```

#### Option C: Hybrid (Recommended Final Solution)

```javascript
async function encryptForSync(plaintext, authMethod) {
  // Try NIP-04 first for supported signers
  if (authMethod === 'nip07' && window.nostr?.nip04?.encrypt) {
    return {
      type: 'nip04',
      data: await window.nostr.nip04.encrypt(myPubkey, plaintext)
    };
  }
  
  // Fall back to password-based
  const password = await promptForSyncPassword();
  return {
    type: 'password',
    data: await CryptoUtils.encryptWithPassword(plaintext, password)
  };
}
```

---

## Implementation Priorities

### Priority 1: Security Fixes (Critical)

| Task | File | Action |
|------|------|--------|
| **1.1** Remove hardcoded secrets | `lib/auth.js:5-6` | Throw error if env vars not set |
| **1.2** Fix password hashing | `lib/auth.js:68` | Use random salt, increase iterations |
| **1.3** Migrate to AES-GCM | `lib/auth.js` | Use Node.js native crypto |

#### 1.1 Remove Hardcoded Secrets

```javascript
// BEFORE (insecure)
const JWT_SECRET = process.env.JWT_SECRET || 'blink-balance-tracker-secret-key';

// AFTER (secure)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
```

#### 1.3 Migrate to Node.js Native Crypto

```javascript
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

static encryptApiKey(apiKey) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  
  let encrypted = cipher.update(apiKey, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();
  
  return JSON.stringify({
    iv: iv.toString('base64'),
    encrypted,
    authTag: authTag.toString('base64')
  });
}
```

### Priority 2: Client-Side E2E Encryption

| Task | Description |
|------|-------------|
| **2.1** Add sync password UI | Settings page option to set encryption password |
| **2.2** Encrypt before sync | Use CryptoUtils.encryptWithPassword on client |
| **2.3** Update sync API | Server stores encrypted blobs without decryption |
| **2.4** Decrypt on load | Prompt for password on new devices |

### Priority 3: NIP-46 Integration

| Task | Description |
|------|-------------|
| **3.1** Implement NIP-46 client | Add to NostrAuthService.js |
| **3.2** Add "Connect with Portal" | Login option for Portal users |
| **3.3** Support NIP-46 encryption | Send encrypt/decrypt requests via relay |

---

## Technical Specifications

### Encrypted Data Format

```typescript
interface EncryptedSyncData {
  version: 1;
  encryptionType: 'password' | 'nip04' | 'nip44' | 'device';
  data: {
    encrypted: string;  // Base64-encoded ciphertext
    iv: string;         // Base64-encoded IV
    salt?: string;      // Base64-encoded salt (password mode)
    authTag?: string;   // Base64-encoded auth tag (GCM mode)
  };
  createdAt: string;
}
```

### API Changes for E2E

```typescript
// Current: Server decrypts and re-encrypts
POST /api/user/sync
{
  blinkApiAccounts: [{
    apiKey: "sk-live-abc123..."  // Plaintext - BAD
  }]
}

// Proposed: Client sends pre-encrypted
POST /api/user/sync
{
  blinkApiAccounts: [{
    apiKey: {
      version: 1,
      encryptionType: 'password',
      data: { encrypted: "...", iv: "...", salt: "..." }
    }
  }]
}
```

### Migration Strategy

1. **Phase 1:** Add E2E encryption as opt-in feature
2. **Phase 2:** Migrate existing users with re-encryption prompt
3. **Phase 3:** Make E2E encryption mandatory for new accounts

---

## Appendix: Code References

### Server-Side Encryption
- `lib/auth.js:30-42` - encryptApiKey/decryptApiKey

### Client-Side Encryption
- `lib/storage/CryptoUtils.js:198-256` - encryptWithPassword/decryptWithPassword

### Nostr Auth
- `lib/nostr/NostrAuthService.js:1007-1031` - nip04Encrypt/nip04Decrypt

### Sync API
- `pages/api/user/sync.js:56-68` - encryptSensitiveData/decryptSensitiveData

---

## Changelog

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-29 | Analysis | Initial document created |
