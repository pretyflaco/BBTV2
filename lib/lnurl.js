/**
 * LNURL Utilities for Lightning Address payments
 * 
 * Provides LNURL-pay resolution and npub.cash address validation.
 * Used for sending tips and forwarding payments to npub.cash addresses.
 */

import { nip19 } from 'nostr-tools';

/**
 * Parse a Lightning address into its LNURL-pay endpoint
 * @param {string} address - Lightning address (e.g., "user@domain.com")
 * @returns {{ localpart: string, domain: string, lnurlEndpoint: string }}
 */
export function parseLightningAddress(address) {
  if (!address || typeof address !== 'string') {
    throw new Error('Invalid Lightning address: address is required');
  }

  const parts = address.split('@');
  if (parts.length !== 2) {
    throw new Error(`Invalid Lightning address format: ${address}`);
  }

  const [localpart, domain] = parts;
  
  if (!localpart || !domain) {
    throw new Error(`Invalid Lightning address: missing local part or domain`);
  }

  // Construct the LNURL-pay endpoint (LUD-16)
  const lnurlEndpoint = `https://${domain}/.well-known/lnurlp/${localpart}`;

  return {
    localpart,
    domain,
    lnurlEndpoint
  };
}

/**
 * Check if an address is an npub.cash Lightning address
 * @param {string} address - Lightning address to check
 * @returns {boolean}
 */
export function isNpubCashAddress(address) {
  if (!address || typeof address !== 'string') {
    return false;
  }
  
  return address.toLowerCase().endsWith('@npub.cash');
}

/**
 * Validate an npub string using nostr-tools
 * @param {string} npub - The npub to validate (e.g., "npub1abc...")
 * @returns {{ valid: boolean, pubkey?: string, error?: string }}
 */
export function validateNpub(npub) {
  if (!npub || typeof npub !== 'string') {
    return { valid: false, error: 'npub is required' };
  }

  if (!npub.startsWith('npub1')) {
    return { valid: false, error: 'npub must start with npub1' };
  }

  try {
    const decoded = nip19.decode(npub);
    if (decoded.type !== 'npub') {
      return { valid: false, error: 'Invalid npub encoding' };
    }
    return { valid: true, pubkey: decoded.data };
  } catch (error) {
    return { valid: false, error: `Invalid npub format: ${error.message}` };
  }
}

/**
 * Validate an npub.cash address
 * Checks format and validates npub if present
 * @param {string} address - npub.cash address (e.g., "npub1xxx@npub.cash" or "username@npub.cash")
 * @returns {{ valid: boolean, localpart?: string, isNpub?: boolean, pubkey?: string, error?: string }}
 */
export function validateNpubCashAddress(address) {
  if (!isNpubCashAddress(address)) {
    return { valid: false, error: 'Address must end with @npub.cash' };
  }

  const { localpart } = parseLightningAddress(address);
  
  // Check if the local part is an npub
  const isNpub = localpart.startsWith('npub1');
  
  if (isNpub) {
    const npubValidation = validateNpub(localpart);
    if (!npubValidation.valid) {
      return { valid: false, error: npubValidation.error };
    }
    return {
      valid: true,
      localpart,
      isNpub: true,
      pubkey: npubValidation.pubkey
    };
  }

  // Username-based address (requires registration on npub.cash)
  // We can't validate existence without probing the endpoint
  if (localpart.length < 1) {
    return { valid: false, error: 'Username cannot be empty' };
  }

  return {
    valid: true,
    localpart,
    isNpub: false
  };
}

/**
 * Fetch LNURL-pay metadata from endpoint
 * @param {string} lnurlEndpoint - The LNURL endpoint URL
 * @returns {Promise<object>} LNURL-pay metadata
 */
export async function fetchLnurlPayMetadata(lnurlEndpoint) {
  const response = await fetch(lnurlEndpoint, {
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`LNURL endpoint returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  // Validate it's a pay request
  if (data.tag !== 'payRequest') {
    throw new Error(`Invalid LNURL tag: expected 'payRequest', got '${data.tag}'`);
  }

  // Validate required fields
  if (!data.callback) {
    throw new Error('LNURL response missing callback URL');
  }

  if (typeof data.minSendable !== 'number' || typeof data.maxSendable !== 'number') {
    throw new Error('LNURL response missing min/max sendable amounts');
  }

  return {
    callback: data.callback,
    minSendable: data.minSendable,  // in millisatoshis
    maxSendable: data.maxSendable,  // in millisatoshis
    metadata: data.metadata,
    commentAllowed: data.commentAllowed || 0,
    allowsNostr: data.allowsNostr || false,
    nostrPubkey: data.nostrPubkey
  };
}

/**
 * Request an invoice from LNURL-pay callback
 * @param {string} callbackUrl - The LNURL callback URL
 * @param {number} amountMsats - Amount in millisatoshis
 * @param {string} [comment] - Optional comment/memo
 * @returns {Promise<{ paymentRequest: string, paymentHash?: string }>}
 */
export async function requestInvoiceFromCallback(callbackUrl, amountMsats, comment = '') {
  // Build callback URL with amount
  const url = new URL(callbackUrl);
  url.searchParams.set('amount', amountMsats.toString());
  
  if (comment) {
    url.searchParams.set('comment', comment);
  }

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`LNURL callback returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status === 'ERROR') {
    throw new Error(`LNURL error: ${data.reason || 'Unknown error'}`);
  }

  if (!data.pr) {
    throw new Error('LNURL callback did not return a payment request');
  }

  return {
    paymentRequest: data.pr,
    paymentHash: data.paymentHash,
    successAction: data.successAction
  };
}

/**
 * Get invoice from Lightning address via LNURL-pay
 * Complete flow: resolve address -> fetch metadata -> request invoice
 * 
 * @param {string} lightningAddress - Lightning address (e.g., "npub1xxx@npub.cash")
 * @param {number} amountSats - Amount in satoshis
 * @param {string} [memo] - Optional memo/comment
 * @returns {Promise<{ paymentRequest: string, paymentHash?: string, metadata: object }>}
 */
export async function getInvoiceFromLightningAddress(lightningAddress, amountSats, memo = '') {
  // Parse the address
  const { lnurlEndpoint } = parseLightningAddress(lightningAddress);

  // Fetch LNURL-pay metadata
  const lnurlData = await fetchLnurlPayMetadata(lnurlEndpoint);

  // Convert sats to millisats
  const amountMsats = amountSats * 1000;

  // Validate amount is within bounds
  if (amountMsats < lnurlData.minSendable) {
    throw new Error(`Amount ${amountSats} sats is below minimum ${Math.ceil(lnurlData.minSendable / 1000)} sats`);
  }

  if (amountMsats > lnurlData.maxSendable) {
    throw new Error(`Amount ${amountSats} sats exceeds maximum ${Math.floor(lnurlData.maxSendable / 1000)} sats`);
  }

  // Truncate comment if necessary
  let comment = memo;
  if (lnurlData.commentAllowed > 0 && memo.length > lnurlData.commentAllowed) {
    comment = memo.substring(0, lnurlData.commentAllowed);
  } else if (lnurlData.commentAllowed === 0) {
    comment = ''; // Comments not allowed
  }

  // Request invoice
  const invoiceData = await requestInvoiceFromCallback(
    lnurlData.callback,
    amountMsats,
    comment
  );

  return {
    paymentRequest: invoiceData.paymentRequest,
    paymentHash: invoiceData.paymentHash,
    successAction: invoiceData.successAction,
    metadata: lnurlData
  };
}

/**
 * Probe an npub.cash address to verify it exists/responds
 * @param {string} address - npub.cash address
 * @returns {Promise<{ valid: boolean, minSats?: number, maxSats?: number, error?: string }>}
 */
export async function probeNpubCashAddress(address) {
  try {
    const validation = validateNpubCashAddress(address);
    if (!validation.valid) {
      return { valid: false, error: validation.error };
    }

    const { lnurlEndpoint } = parseLightningAddress(address);
    const metadata = await fetchLnurlPayMetadata(lnurlEndpoint);

    return {
      valid: true,
      minSats: Math.ceil(metadata.minSendable / 1000),
      maxSats: Math.floor(metadata.maxSendable / 1000),
      allowsNostr: metadata.allowsNostr
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

export default {
  parseLightningAddress,
  isNpubCashAddress,
  validateNpub,
  validateNpubCashAddress,
  fetchLnurlPayMetadata,
  requestInvoiceFromCallback,
  getInvoiceFromLightningAddress,
  probeNpubCashAddress
};

