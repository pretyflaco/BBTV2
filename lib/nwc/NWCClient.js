/**
 * NWCClient - Nostr Wallet Connect client implementation
 * 
 * Implements NIP-47 for communicating with lightning wallets over Nostr.
 * Supports: pay_invoice, get_balance, make_invoice, lookup_invoice
 * 
 * @see https://github.com/nostr-protocol/nips/blob/master/47.md
 */

import { nip04, nip19, finalizeEvent, getPublicKey, SimplePool } from 'nostr-tools';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { isBlinkInvoice, getNonBlinkWalletError, BLINK_NODE_PUBKEYS } from '../invoice-decoder';

/**
 * @typedef {Object} NWCUri
 * @property {string} walletPubkey - The wallet service's public key (hex)
 * @property {string[]} relays - Array of relay URLs
 * @property {string} clientSecretHex - Client's private key (hex)
 * @property {string} clientPubkey - Client's public key (hex)
 */

/**
 * @typedef {Object} NWCInfo
 * @property {string[]} methods - Supported NWC methods
 * @property {string[]} [notifications] - Supported notification types
 * @property {string[]} [encryption] - Supported encryption schemes
 */

/**
 * @typedef {Object} NWCResponse
 * @property {string} result_type - The method this response is for
 * @property {Object|null} result - The result data, or null if error
 * @property {{code: string, message: string}|null} error - Error info, or null if success
 */

class NWCClient {
  /** @type {NWCUri} */
  uri;
  
  /** @type {SimplePool} */
  pool;

  /**
   * Create an NWC client from a connection string
   * @param {string} connectionString - nostr+walletconnect:// URI
   */
  constructor(connectionString) {
    this.uri = this.parseConnectionString(connectionString);
    this.pool = new SimplePool();
  }

  /**
   * Get wallet service info (supported methods, notifications, etc.)
   * @returns {Promise<NWCInfo|null>}
   */
  async getInfo() {
    try {
      console.log('[NWCClient] Getting wallet info...');
      const filter = {
        kinds: [13194],
        authors: [this.uri.walletPubkey]
      };

      // Add timeout
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
          console.log('[NWCClient] getInfo timed out after 10s');
          resolve(null);
        }, 10000);
      });

      const getPromise = this.pool.get(this.uri.relays, filter);
      const evt = await Promise.race([getPromise, timeoutPromise]);

      if (!evt) {
        console.log('[NWCClient] No info event found');
        return null;
      }

      console.log('[NWCClient] Info event received:', evt.id?.slice(0, 8) + '...');
      
      const content = evt.content || '';
      const methods = content.trim() ? content.trim().split(/\s+/) : [];
      const tags = evt.tags || [];
      
      console.log('[NWCClient] Raw content:', content);
      console.log('[NWCClient] Parsed methods:', methods);
      
      const notificationsTag = tags.find(t => t[0] === 'notifications');
      const encryptionTag = tags.find(t => t[0] === 'encryption');
      
      const notifications = notificationsTag && notificationsTag[1]
        ? notificationsTag[1].split(/\s+/)
        : undefined;
      const encryption = encryptionTag && encryptionTag[1]
        ? encryptionTag[1].split(/\s+/)
        : undefined;

      return { methods, notifications, encryption };
    } catch (error) {
      console.error('[NWCClient] Failed to get info:', error);
      return null;
    }
  }

  /**
   * Validate an NWC connection string by fetching info
   * @param {string} connectionString 
   * @returns {Promise<{valid: boolean, info?: NWCInfo, error?: string}>}
   */
  static async validate(connectionString) {
    try {
      console.log('[NWCClient] Validating connection string...');
      const client = new NWCClient(connectionString);
      console.log('[NWCClient] Fetching wallet info from relays:', client.uri.relays);
      const info = await client.getInfo();
      
      console.log('[NWCClient] Wallet info received:', info);
      
      if (!info || !info.methods || info.methods.length === 0) {
        console.error('[NWCClient] No capabilities found');
        client.close();
        return { valid: false, error: 'Could not fetch wallet capabilities' };
      }

      console.log('[NWCClient] Wallet capabilities:', info.methods);
      console.log('[NWCClient] Has make_invoice:', info.methods.includes('make_invoice'));
      
      // Require make_invoice for Blink validation
      if (!info.methods.includes('make_invoice')) {
        console.error('[NWCClient] make_invoice not supported - cannot validate Blink wallet');
        client.close();
        return { 
          valid: false, 
          error: 'This wallet does not support invoice generation (make_invoice). Only Blink NWC wallets are supported.' 
        };
      }

      // Validate that this is a Blink wallet by generating a test invoice
      console.log('[NWCClient] Validating Blink wallet by generating test invoice...');
      const blinkValidation = await client.validateBlinkWallet();
      
      if (!blinkValidation.valid) {
        console.error('[NWCClient] Blink validation failed:', blinkValidation.error);
        client.close();
        return { valid: false, error: blinkValidation.error };
      }

      console.log('[NWCClient] Blink wallet validation successful! Node pubkey:', blinkValidation.nodePubkey);

      client.close();
      return { valid: true, info, blinkNodePubkey: blinkValidation.nodePubkey };
    } catch (error) {
      console.error('[NWCClient] Validation error:', error);
      return { valid: false, error: error.message || 'Invalid connection string' };
    }
  }

  /**
   * Validate that this NWC wallet is a Blink wallet
   * Generates a test invoice and checks the destination node pubkey
   * @returns {Promise<{valid: boolean, nodePubkey?: string, error?: string}>}
   */
  async validateBlinkWallet() {
    try {
      console.log('[NWCClient] Creating test invoice for Blink validation...');
      
      // Generate a minimal test invoice (1 sat, will expire quickly)
      const invoiceResult = await this.makeInvoice({
        amount: 1000, // 1000 millisats = 1 sat
        description: 'Blink wallet validation',
        expiry: 60 // 60 seconds expiry - minimal
      });

      if (invoiceResult.error) {
        console.error('[NWCClient] Failed to create test invoice:', invoiceResult.error);
        return { 
          valid: false, 
          error: `Failed to create test invoice: ${invoiceResult.error.message || 'Unknown error'}` 
        };
      }

      const invoice = invoiceResult.result?.invoice;
      if (!invoice) {
        console.error('[NWCClient] No invoice in response:', invoiceResult);
        return { valid: false, error: 'Wallet did not return an invoice' };
      }

      console.log('[NWCClient] Test invoice created, checking destination node...');
      
      // Check if this invoice is destined for a Blink node
      const blinkCheck = isBlinkInvoice(invoice);
      
      if (blinkCheck.error) {
        console.error('[NWCClient] Failed to decode invoice:', blinkCheck.error);
        return { valid: false, error: `Failed to decode invoice: ${blinkCheck.error}` };
      }

      if (!blinkCheck.isBlink) {
        console.warn('[NWCClient] Not a Blink wallet! Node pubkey:', blinkCheck.nodePubkey);
        return { 
          valid: false, 
          error: getNonBlinkWalletError(),
          nodePubkey: blinkCheck.nodePubkey
        };
      }

      console.log('[NWCClient] Confirmed Blink wallet, node:', blinkCheck.nodePubkey);
      return { valid: true, nodePubkey: blinkCheck.nodePubkey };
    } catch (error) {
      console.error('[NWCClient] Blink validation error:', error);
      return { valid: false, error: error.message || 'Failed to validate Blink wallet' };
    }
  }

  /**
   * Pay a lightning invoice
   * @param {string} invoice - BOLT11 invoice string
   * @returns {Promise<NWCResponse<{preimage: string, fees_paid?: number}>>}
   */
  async payInvoice(invoice) {
    return await this.sendRequest({
      method: 'pay_invoice',
      params: { invoice }
    });
  }

  /**
   * Get wallet balance
   * @returns {Promise<NWCResponse<{balance: number}>>}
   */
  async getBalance() {
    return await this.sendRequest({
      method: 'get_balance',
      params: {}
    });
  }

  /**
   * Create a lightning invoice
   * @param {Object} params
   * @param {number} [params.amount] - Amount in millisats
   * @param {string} [params.description] - Invoice description
   * @param {string} [params.description_hash] - SHA256 hash of description
   * @param {number} [params.expiry] - Expiry in seconds
   * @returns {Promise<NWCResponse<{invoice: string, payment_hash: string}>>}
   */
  async makeInvoice(params) {
    return await this.sendRequest({
      method: 'make_invoice',
      params
    });
  }

  /**
   * Look up an invoice by payment hash
   * @param {string} paymentHash - Payment hash (hex)
   * @returns {Promise<NWCResponse>}
   */
  async lookupInvoice(paymentHash) {
    return await this.sendRequest({
      method: 'lookup_invoice',
      params: { payment_hash: paymentHash }
    });
  }

  /**
   * List transactions
   * @param {Object} [params]
   * @param {number} [params.from] - Start timestamp
   * @param {number} [params.until] - End timestamp
   * @param {number} [params.limit] - Max number of transactions
   * @param {number} [params.offset] - Offset for pagination
   * @param {boolean} [params.unpaid] - Include unpaid invoices
   * @param {string} [params.type] - Filter by type ('incoming' or 'outgoing')
   * @returns {Promise<NWCResponse>}
   */
  async listTransactions(params = {}) {
    return await this.sendRequest({
      method: 'list_transactions',
      params
    });
  }

  /**
   * Send a request to the wallet service
   * @private
   * @param {{method: string, params: Object}} request 
   * @param {number} [timeoutMs=60000] 
   * @returns {Promise<NWCResponse>}
   */
  async sendRequest(request, timeoutMs = 60000) {
    const now = Math.floor(Date.now() / 1000);
    const contentJson = JSON.stringify(request);

    console.log('[NWCClient] Sending request:', request.method, 'to relays:', this.uri.relays);

    // Encrypt with NIP-04
    let ciphertext;
    try {
      ciphertext = await nip04.encrypt(
        this.uri.clientSecretHex,
        this.uri.walletPubkey,
        contentJson
      );
      console.log('[NWCClient] Message encrypted successfully');
    } catch (encryptError) {
      console.error('[NWCClient] Encryption failed:', encryptError);
      return {
        result_type: 'error',
        result: null,
        error: {
          code: 'encryption_failed',
          message: encryptError instanceof Error ? encryptError.message : 'Failed to encrypt request'
        }
      };
    }

    // Build request event (kind 23194)
    const eventTemplate = {
      kind: 23194,
      created_at: now,
      content: ciphertext,
      tags: [
        ['p', this.uri.walletPubkey],
        ['encryption', 'nip04']
      ]
    };

    const skBytes = hexToBytes(this.uri.clientSecretHex);
    const requestEvent = finalizeEvent(eventTemplate, skBytes);
    console.log('[NWCClient] Request event created:', requestEvent.id);

    // Publish to relays (all at once, like PubPay does)
    try {
      console.log('[NWCClient] Publishing to relays:', this.uri.relays);
      await this.pool.publish(this.uri.relays, requestEvent);
      console.log('[NWCClient] Published successfully');
    } catch (error) {
      console.error('[NWCClient] Publish failed:', error);
      return {
        result_type: 'error',
        result: null,
        error: {
          code: 'publish_failed',
          message: error instanceof Error ? error.message : 'Failed to publish request'
        }
      };
    }

    // Subscribe for response
    const filter = {
      kinds: [23195],
      authors: [this.uri.walletPubkey],
      '#p': [this.uri.clientPubkey],
      '#e': [requestEvent.id]
    };

    console.log('[NWCClient] Subscribing for response with filter:', {
      kinds: filter.kinds,
      authors: filter.authors.map(a => a.slice(0, 8) + '...'),
      '#p': filter['#p'].map(p => p.slice(0, 8) + '...'),
      '#e': filter['#e'].map(e => e.slice(0, 8) + '...')
    });

    return new Promise((resolve) => {
      let sub = null;
      let timeoutId = null;
      let resolved = false;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (sub && typeof sub.close === 'function') {
          try {
            sub.close();
          } catch (e) {
            // Ignore cleanup errors
          }
          sub = null;
        }
      };

      try {
        // Use subscribe() like PubPay does - passing filter directly, not in array
        sub = this.pool.subscribe(this.uri.relays, filter, {
          onevent: async (evt) => {
            console.log('[NWCClient] Received event:', evt.id.slice(0, 8) + '...');
            if (resolved) return;
            try {
              const plaintext = await nip04.decrypt(
                this.uri.clientSecretHex,
                this.uri.walletPubkey,
                evt.content
              );
              const parsed = JSON.parse(plaintext);
              console.log('[NWCClient] Decrypted response:', parsed.result_type);
              resolved = true;
              cleanup();
              resolve(parsed);
            } catch (err) {
              console.error('[NWCClient] Failed to decrypt response:', err);
            }
          },
          oneose: () => {
            console.log('[NWCClient] End of stored events, waiting for new events...');
            // End of stored events - keep waiting for new events
          },
          onclose: (reason) => {
            console.log('[NWCClient] Subscription closed:', reason);
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve({
              result_type: 'error',
              result: null,
              error: {
                code: 'subscription_closed',
                message: 'Subscription closed before receiving response'
              }
            });
          }
        });

        console.log('[NWCClient] Subscription created, waiting for response (timeout:', timeoutMs, 'ms)');

        // Set up timeout
        timeoutId = setTimeout(() => {
          if (resolved) return;
          console.log('[NWCClient] Request timed out after', timeoutMs, 'ms');
          resolved = true;
          cleanup();
          resolve({
            result_type: 'error',
            result: null,
            error: {
              code: 'timeout',
              message: 'Request timed out waiting for wallet response'
            }
          });
        }, timeoutMs);
      } catch (error) {
        console.error('[NWCClient] Failed to create subscription:', error);
        resolved = true;
        cleanup();
        resolve({
          result_type: 'error',
          result: null,
          error: {
            code: 'subscription_failed',
            message: error instanceof Error ? error.message : 'Failed to set up subscription'
          }
        });
      }
    });
  }

  /**
   * Parse NWC connection string into components
   * @private
   * @param {string} connectionString 
   * @returns {NWCUri}
   */
  parseConnectionString(connectionString) {
    // Support both URI schemes
    const normalized = connectionString
      .replace(/^nostr\+walletconnect:\/\//i, 'https://')
      .replace(/^nostrnwc:\/\//i, 'https://');

    const url = new URL(normalized);
    
    // Extract wallet pubkey (can be in hostname or path)
    const candidateFromHost = (url.hostname || '').trim();
    const candidateFromPath = (url.pathname || '').replace(/^\/+/, '').trim();
    const walletPubkey = candidateFromHost || candidateFromPath;

    // Collect relays
    const relayParams = url.searchParams.getAll('relay');
    const relays = [];
    for (const rp of relayParams) {
      const decoded = decodeURIComponent(rp);
      decoded.split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .forEach(r => relays.push(r));
    }

    // Get secret (can be hex or nsec)
    let secret = url.searchParams.get('secret') || '';
    secret = secret.trim();
    
    let clientSecretHex;
    if (secret.startsWith('nsec')) {
      const decoded = nip19.decode(secret);
      clientSecretHex = bytesToHex(decoded.data);
    } else {
      clientSecretHex = secret;
    }

    if (!walletPubkey || !clientSecretHex || relays.length === 0) {
      throw new Error('Invalid NWC connection string: missing required fields');
    }

    const clientPubkey = getPublicKey(hexToBytes(clientSecretHex));

    return { walletPubkey, relays, clientSecretHex, clientPubkey };
  }

  /**
   * Get a display name for the wallet (truncated pubkey)
   * @returns {string}
   */
  getDisplayName() {
    const pk = this.uri.walletPubkey;
    return `${pk.slice(0, 8)}...${pk.slice(-8)}`;
  }

  /**
   * Get the wallet's public key
   * @returns {string}
   */
  getWalletPubkey() {
    return this.uri.walletPubkey;
  }

  /**
   * Get the relay URLs
   * @returns {string[]}
   */
  getRelays() {
    return [...this.uri.relays];
  }

  /**
   * Close the connection pool
   */
  close() {
    try {
      this.pool.close(this.uri.relays);
    } catch (e) {
      // Ignore
    }
  }
}

export default NWCClient;

