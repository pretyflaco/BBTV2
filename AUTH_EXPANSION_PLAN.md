# Authentication Expansion Plan

## Overview

Expand authentication options beyond Nostr signers (NIP-07/NIP-55) to make the app accessible to wider audiences.

**Current State:**
- NIP-07: Browser extensions (keys.band, Alby) - Desktop only
- NIP-55: External signers (Amber) - Android only, iOS has issues
- Manual npub entry - iOS fallback (limited functionality)

**Target State:**
1. ✨ In-App Key Generation with Encrypted Backup
2. 🔐 WebAuthn / Passkeys
3. 📧 Email Magic Links

---

## Phase 1: In-App Key Generation with Encrypted Backup

### Goal
Allow users to create a Nostr identity directly in the app, protected by a password. No external signer or extension required.

### User Flow

**New User:**
1. Click "Create New Account"
2. Enter password (min 8 chars) + confirm
3. App generates Nostr keypair
4. Private key encrypted with password, stored locally
5. User is logged in with their new Nostr identity

**Returning User:**
1. Click "Sign in with Password"
2. Enter password
3. App decrypts stored private key
4. User is logged in

**Key Export (Settings):**
1. User can view/copy their nsec (after password confirmation)
2. Can import into other Nostr apps

### Technical Implementation

**Files to Modify:**
- `lib/nostr/NostrAuthService.js` - Add key generation and local signing
- `components/auth/NostrLoginForm.js` - Add create account / password login UI
- `lib/hooks/useNostrAuth.js` - Add new auth method handling
- `components/Settings/SettingsPage.js` - Add nsec export option

**New Constants:**
```javascript
const ENCRYPTED_NSEC_KEY = 'blinkpos_encrypted_nsec';
const AUTH_METHOD_GENERATED = 'generated';
```

**Key Generation:**
```javascript
// Using @noble/curves (already in package.json)
import { schnorr } from '@noble/curves/secp256k1';
import { randomBytes } from '@noble/hashes/utils';
```

**Security Considerations:**
- Private key never stored unencrypted
- Password-based encryption using PBKDF2 + AES-GCM (via CryptoUtils)
- Clear private key from memory after use
- Warn users to backup their password

---

## Phase 2: WebAuthn / Passkeys

### Goal
Allow passwordless authentication using device biometrics (Face ID, fingerprint) or hardware keys.

### User Flow

**Registration:**
1. Click "Register with Passkey"
2. Device prompts for biometric/PIN
3. Credential created and stored on device
4. Server stores public key credential
5. App generates Nostr identity linked to passkey

**Login:**
1. Click "Sign in with Passkey"
2. Device prompts for biometric/PIN
3. Server verifies credential
4. User logged in

### Technical Implementation

**New Dependencies:**
```bash
npm install @simplewebauthn/server @simplewebauthn/browser
```

**New Files:**
- `pages/api/auth/webauthn/register-options.js`
- `pages/api/auth/webauthn/register-verify.js`
- `pages/api/auth/webauthn/login-options.js`
- `pages/api/auth/webauthn/login-verify.js`
- `lib/webauthn/WebAuthnService.js`

**Database:**
```sql
CREATE TABLE webauthn_credentials (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER DEFAULT 0,
  nostr_pubkey VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Passkey-to-Nostr Mapping:**
- On first passkey registration, generate a Nostr keypair
- Encrypt nsec with a server-side key derived from credential
- Store encrypted nsec server-side (recoverable via passkey)

---

## Phase 3: Email Magic Links

### Goal
Allow users to sign in via email link, no password required.

### User Flow

**Sign In:**
1. Enter email address
2. Click "Send Magic Link"
3. Check email, click link
4. Automatically logged in
5. If first time, Nostr identity created

### Technical Implementation

**Email Provider Options:**
- Resend (recommended - simple API, generous free tier)
- SendGrid
- AWS SES
- Postmark

**New Dependencies:**
```bash
npm install resend
```

**New Files:**
- `pages/api/auth/magic-link/send.js`
- `pages/api/auth/magic-link/verify.js`
- `lib/email/EmailService.js`

**Database:**
```sql
CREATE TABLE magic_link_tokens (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  nostr_pubkey VARCHAR(64),
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE email_users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  nostr_pubkey VARCHAR(64) NOT NULL,
  encrypted_nsec TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Email-to-Nostr Mapping:**
- On first email login, generate Nostr keypair
- Encrypt nsec with server key + email hash
- Store server-side, retrievable via email verification

---

## Implementation Order

### Week 1: In-App Key Generation
- [x] Plan created
- [ ] Add keypair generation to NostrAuthService
- [ ] Add local event signing capability
- [ ] Create account / password login UI
- [ ] Test full flow
- [ ] Add nsec export in Settings

### Week 2: WebAuthn / Passkeys
- [ ] Install dependencies
- [ ] Create database table
- [ ] Implement server endpoints
- [ ] Add UI components
- [ ] Test on iOS Safari, Android Chrome, Desktop

### Week 3: Email Magic Links
- [ ] Choose and configure email provider
- [ ] Create database tables
- [ ] Implement send/verify endpoints
- [ ] Add UI components
- [ ] Test email delivery

---

## Security Notes

1. **In-App Keys**: Password strength is critical - enforce minimum requirements
2. **WebAuthn**: Use HTTPS only, configure proper RP ID
3. **Magic Links**: Short expiry (15 min), single use, rate limit sends
4. **All Methods**: Generate real Nostr identities so users can migrate to external signers later

