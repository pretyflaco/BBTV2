# Nostr Authentication Testing Documentation

This document catalogs all testing sessions, logs, and findings related to Nostr authentication across different platforms, signers, and environments.

---

## Table of Contents
1. [Overview](#overview)
2. [Test Matrix](#test-matrix)
3. [Test Sessions](#test-sessions)
4. [Known Issues](#known-issues)
5. [Solutions Implemented](#solutions-implemented)

---

## Overview

### Authentication Flow (Challenge-Based for External Signers)
The Blink POS app uses a two-step challenge-based authentication flow for external signers like Amber:

1. **Step 1: Get Pubkey**
   - App requests challenge from server (`/api/auth/challenge`)
   - App redirects to signer via `nostrsigner:?type=get_public_key&callbackUrl=...`
   - Signer returns pubkey concatenated to callback URL
   - URL format: `?nostr_return=challenge{64-char-hex-pubkey}`

2. **Step 2: Sign Challenge**
   - App builds challenge event (kind 22242) with the pubkey
   - App redirects to signer via `nostrsigner:{event-json}?type=sign_event&callbackUrl=...`
   - Signer returns signed event concatenated to callback URL
   - URL format: `?nostr_return=signed{url-encoded-json-event}`

3. **Step 3: Verify with Server**
   - App extracts signed event from URL
   - App sends to `/api/auth/verify-ownership`
   - Server verifies signature and establishes session

### Service Worker Versions
- `v10-revert-amber-to-working` - Reverted to simple caching, removed SW interception
- `v11-pwa-signer-nav-fix` - Added PWA-compatible navigation helper

---

## Test Matrix

| Platform | Environment | Signer | Status | Notes |
|----------|-------------|--------|--------|-------|
| Android | Browser (Chrome) | Amber | ✅ WORKING | See Test Session 001 |
| Android | PWA (Installed) | Amber | ⏳ PENDING | Needs testing |
| iOS | Browser (Safari) | Nostash | ⏳ PENDING | Not tested yet |
| iOS | PWA (Installed) | Nostash | ⏳ PENDING | Not tested yet |
| Desktop | Browser (Chrome) | keys.band | ✅ WORKING | Extension-based, no redirect |
| Desktop | Browser (Chrome) | Alby | ✅ WORKING | Extension-based, no redirect |

---

## Test Sessions

### Test Session 001
**Date:** 2026-02-01  
**Platform:** Android  
**Environment:** Mobile Browser (Chrome)  
**Signer:** Amber  
**SW Version:** `v11-pwa-signer-nav-fix`  
**Result:** ✅ SUCCESS

#### Test Flow
1. User taps "Sign in with Amber"
2. Challenge fetched from server
3. Redirect to Amber for pubkey (Step 1)
4. Return with pubkey in URL: `?nostr_return=challenge4ffb87a9...`
5. Multiple `[useNostrAuth] Handling pending challenge flow...` calls (6 times)
6. User manually taps "Sign in with Amber" again
7. Flow detects `awaitingSignedChallenge` state
8. Redirect to Amber for challenge signing (Step 2)
9. Return with signed event: `?nostr_return=signed{...json...}`
10. Server verification succeeds
11. Session established, user logged in

#### Key Observations
1. **PWA mode was FALSE** - This was browser testing, not PWA
2. **Step 1 worked automatically** on return from Amber
3. **Step 2 required manual button tap** - The automatic flow didn't trigger Step 2 redirect
4. **Multiple `Handling pending challenge flow...` calls** - Suggests race condition or re-renders
5. **Final success** - Challenge verified, session established, profile loaded

#### Console Logs (Tab 1 - Filtered for Auth)
```
[NostrLoginForm] handleExternalSignerSignIn called
[NostrLoginForm] Calling signInWithExternalSigner...
[NostrAuthService] signInWithExternalSignerChallenge() called
[NostrAuthService] Pending flow: none
[NostrAuthService] Starting challenge-based sign-in...
[NostrAuthService] Return URL: https://track.twentyone.ist/signin?nostr_return=challenge&pubkey=
[NostrAuthService] Fetching challenge from server...
[NostrAuthService] Challenge result: success
[NostrAuthService] Stored challenge flow data
[NostrAuthService] Opening signer URL: nostrsigner:?type=get_public_key&callbackUrl=...
[NostrAuthService] Full callback URL: https://track.twentyone.ist/signin?nostr_return=challenge&pubkey=
[NostrAuthService] navigateToSignerUrl (signInWithExternalSignerChallenge-getPubkey), PWA mode: false
[NostrAuthService] URL (first 100 chars): nostrsigner:?type=get_public_key&callbackUrl=...
[NostrAuthService] Trying window.location.href assignment...
[NostrAuthService] location.href assigned
[NostrLoginForm] signInWithExternalSigner result: {success: true, pending: true}
[NostrLoginForm] Redirect pending, waiting...

--- RETURN FROM AMBER (Step 1) ---
Service Worker: Fetching from network .../signin?nostr_return=challenge4ffb87a974bbb52fcac737b79c295c047d91aced8923b0b858df7cad2281157f

[useNostrAuth] Handling pending challenge flow...
[useNostrAuth] Handling pending challenge flow...
[useNostrAuth] Handling pending challenge flow...
[useNostrAuth] Handling pending challenge flow...
[useNostrAuth] Handling pending challenge flow...
[useNostrAuth] Handling pending challenge flow...

--- USER MANUALLY TAPPED SIGN IN AGAIN ---
[NostrLoginForm] handleExternalSignerSignIn called
[NostrLoginForm] Calling signInWithExternalSigner...
[NostrAuthService] signInWithExternalSignerChallenge() called
[NostrAuthService] Pending flow: awaitingSignedChallenge
[NostrAuthService] Returning from challenge signing...
[useNostrAuth] Handling pending challenge flow...
[NostrLoginForm] signInWithExternalSigner result: {success: false, error: 'Not a signed challenge return'}
[NostrLoginForm] Sign-in failed: Not a signed challenge return

--- AFTER DEBUG PANEL CLEAR AND RETRY ---
[NostrAuthService] Challenge result: success
[NostrAuthService] Stored challenge flow data
[NostrAuthService] navigateToSignerUrl (signInWithExternalSignerChallenge-getPubkey), PWA mode: false
[NostrAuthService] Trying window.location.href assignment...
[NostrAuthService] location.href assigned

--- RETURN FROM AMBER (Step 1 again) ---
[useNostrAuth] Handling pending challenge flow...
[useNostrAuth] Handling pending challenge flow...
[useNostrAuth] Handling pending challenge flow...
[useNostrAuth] Handling pending challenge flow...

--- RETURN FROM AMBER (Step 2 - signed event) ---
Service Worker: Fetching from network .../signin?nostr_return=signed%7B%22id%22%3A%22d7b224585ab3c9c07bd03b21aab78989f7526258e0878c9522525be2968c42ba%22%2C%22pubkey%22%3A%224ffb87a974bbb52fcac737b79c295c047d91aced8923b0b858df7cad2281157f%22%2C...

[useNostrAuth] Handling pending challenge flow...
[NostrAuthService] Extracted signed event from concatenated nostr_return
[NostrAuthService] Got signed challenge event, verifying with server...
[NostrAuthService] ✓ Challenge verified, session established!
[useNostrAuth] Fetching Nostr profile for: 4ffb87a9...
[useNostrAuth] External signer: Session established, syncing data...
[useNWC] User changed from undefined to 4ffb87a9
[useNostrAuth] ✓ Synced Blink account from server (NIP-98)
[useNostrAuth] ✓ Fetched Nostr profile: El Flaco
```

#### Issues Identified
1. **Step 2 not auto-triggered**: After returning from Step 1, the app shows "Handling pending challenge flow" but doesn't automatically redirect to Amber for Step 2
2. **Race condition**: Multiple calls to `Handling pending challenge flow...` suggest component re-renders are triggering the check multiple times
3. **Manual intervention required**: User had to tap the button again to trigger Step 2

#### URL Formats Observed
- Step 1 return: `?nostr_return=challenge4ffb87a974bbb52fcac737b79c295c047d91aced8923b0b858df7cad2281157f`
- Step 2 return: `?nostr_return=signed{url-encoded-json}`

---

## Known Issues

### Issue 1: Step 2 Auto-Redirect Not Working (Browser)
**Status:** IDENTIFIED  
**Environment:** Android Browser  
**Description:** After returning from Amber with pubkey (Step 1), the app doesn't automatically redirect to Amber for challenge signing (Step 2). User has to manually tap the sign-in button again.

**Root Cause (Suspected):** 
- `handleChallengeFlowReturn()` is being called but may be hitting a condition that prevents Step 2 redirect
- Multiple re-renders may be interfering with the flow
- The URL params are being cleaned before the Step 2 redirect can happen

**Evidence:**
- Console shows `[useNostrAuth] Handling pending challenge flow...` 6 times
- But no `[NostrAuthService] ✓ Got pubkey:` log appears
- No `[NostrAuthService] Redirecting to signer for challenge signature...` log appears

### Issue 2: PWA Navigation Blocking (Step 2)
**Status:** FIX IMPLEMENTED, NEEDS TESTING  
**Environment:** Android PWA (Installed)  
**Description:** In PWA standalone mode, `window.location.href` assignment is blocked for the Step 2 redirect.

**Error:** `Navigation is blocked: nostrsigner:...`

**Fix Implemented:** Added `navigateToSignerUrl()` helper that tries multiple navigation methods:
1. Anchor element with `target="_blank"` (breaks out of PWA webview)
2. `window.open()`
3. `window.location.href` (original method)
4. `window.location.assign()`

---

## Solutions Implemented

### Solution 1: PWA Navigation Helper
**Commit:** `caffa97`  
**File:** `lib/nostr/NostrAuthService.js`

Added `navigateToSignerUrl()` function that tries multiple navigation methods for custom URL schemes in PWA mode.

```javascript
async function navigateToSignerUrl(url, context = 'unknown') {
  const inPWA = isPWAMode();
  
  // Method 1: Anchor element with target="_blank"
  if (inPWA) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.click();
  }
  
  // Method 2: window.open()
  // Method 3: window.location.href
  // Method 4: window.location.assign()
}
```

### Solution 2: Debug Panel
**Commit:** `e33410d`  
**File:** `components/auth/NostrLoginForm.js`

Added hidden debug panel (tap logo 5 times) with:
- Clear Auth State button
- Clear ALL Data button
- Current state display (URL, localStorage values, PWA detection)

---

## Next Steps

1. **Test PWA mode** - Install PWA and test full flow to verify navigation fix
2. **Fix Step 2 auto-redirect** - Investigate why `handleChallengeFlowReturn()` isn't triggering the Step 2 redirect automatically
3. **Add more logging** - Add logs in `handleChallengeFlowReturn()` to trace the exact code path
4. **Test iOS** - Test with Nostash extension on iOS Safari

---

## Debug Commands

### Browser Console
```javascript
// Show current challenge flow state
NostrAuthService.debugChallengeFlow()

// Clear stuck challenge flow
NostrAuthService.clearChallengeFlow()

// Check localStorage
JSON.parse(localStorage.getItem('blinkpos_challenge_flow'))
```

### Debug Panel
Tap the Blink logo 5 times on the sign-in page to open the debug panel.
