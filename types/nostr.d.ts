/**
 * TypeScript type definitions for Nostr-related functionality
 * 
 * NIP-07: Browser Extension API
 * NIP-55: External Signer (Android Intent)
 */

// ============= NIP-07 Browser Extension =============

/**
 * Unsigned Nostr event
 */
interface UnsignedNostrEvent {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  pubkey?: string;
}

/**
 * Signed Nostr event
 */
interface SignedNostrEvent extends UnsignedNostrEvent {
  id: string;
  pubkey: string;
  sig: string;
}

/**
 * NIP-04 encryption/decryption methods
 */
interface Nip04Methods {
  /**
   * Encrypt a message for a recipient
   * @param recipientPubkey - Recipient's hex-encoded public key
   * @param plaintext - Message to encrypt
   */
  encrypt(recipientPubkey: string, plaintext: string): Promise<string>;
  
  /**
   * Decrypt a message from a sender
   * @param senderPubkey - Sender's hex-encoded public key
   * @param ciphertext - Encrypted message
   */
  decrypt(senderPubkey: string, ciphertext: string): Promise<string>;
}

/**
 * NIP-44 encryption/decryption methods (newer, preferred)
 */
interface Nip44Methods {
  encrypt(recipientPubkey: string, plaintext: string): Promise<string>;
  decrypt(senderPubkey: string, ciphertext: string): Promise<string>;
}

/**
 * Relay configuration
 */
interface RelayConfig {
  read: boolean;
  write: boolean;
}

/**
 * NIP-07 Nostr Browser Extension interface
 * Compatible with: keys.band, Alby, nos2x, Flamingo, etc.
 */
interface NostrExtension {
  /**
   * Get the user's public key
   * @returns Hex-encoded public key (64 characters)
   */
  getPublicKey(): Promise<string>;
  
  /**
   * Sign a Nostr event
   * @param event - Unsigned event to sign
   * @returns Signed event with id, pubkey, and sig
   */
  signEvent(event: UnsignedNostrEvent): Promise<SignedNostrEvent>;
  
  /**
   * Get user's relay list (optional)
   */
  getRelays?(): Promise<Record<string, RelayConfig>>;
  
  /**
   * NIP-04 encryption methods (optional)
   */
  nip04?: Nip04Methods;
  
  /**
   * NIP-44 encryption methods (optional, newer)
   */
  nip44?: Nip44Methods;
}

// Extend the Window interface to include nostr
declare global {
  interface Window {
    nostr?: NostrExtension;
  }
}

// ============= Auth Service Types =============

type SignInMethod = 'extension' | 'externalSigner';

interface AuthResult {
  success: boolean;
  publicKey?: string;
  method?: SignInMethod;
  error?: string;
  pending?: boolean;
}

interface StoredAuthData {
  publicKey: string | null;
  method: SignInMethod | null;
}

// ============= Profile Storage Types =============

interface EncryptedField {
  encrypted: string;
  iv: string;
  salt: string;
  hasPassword: boolean;
}

interface BlinkAccount {
  id: string;
  label: string;
  apiKey: EncryptedField;
  username?: string;
  defaultCurrency?: string;
  isActive: boolean;
  createdAt: number;
  lastUsed?: number;
}

interface NWCConnection {
  id: string;
  label: string;
  uri: EncryptedField;
  capabilities?: string[];
  isActive: boolean;
  createdAt: number;
}

interface TippingSettings {
  enabled: boolean;
  defaultPercentages: number[];
  customAmountEnabled: boolean;
  forwardToNWC: boolean;
  forwardNWCId?: string | null;
}

interface Preferences {
  defaultCurrency: string;
  darkMode: boolean;
  sounds: boolean;
  language: string;
}

interface Profile {
  id: string;
  publicKey: string;
  signInMethod: SignInMethod;
  createdAt: number;
  lastLogin?: number;
  blinkAccounts: BlinkAccount[];
  nwcConnections: NWCConnection[];
  tippingSettings: TippingSettings;
  preferences: Preferences;
}

interface ProfileExport {
  version: number;
  exportedAt: number;
  profile?: Profile;
  profiles?: Profile[];
  activeProfileId?: string;
}

// ============= NWC (NIP-47) Types =============

interface NWCInfo {
  methods: string[];
  notifications?: string[];
  encryption?: string[];
}

interface NWCPaymentResult {
  preimage: string;
  fees_paid?: number;
}

interface NWCBalanceResult {
  balance: number;
}

interface NWCInvoiceResult {
  invoice: string;
  payment_hash: string;
}

interface NWCRpcResponse<T = unknown> {
  result_type: string;
  result: T | null;
  error: { code: string; message: string } | null;
}

// Export all types
export {
  UnsignedNostrEvent,
  SignedNostrEvent,
  Nip04Methods,
  Nip44Methods,
  RelayConfig,
  NostrExtension,
  SignInMethod,
  AuthResult,
  StoredAuthData,
  EncryptedField,
  BlinkAccount,
  NWCConnection,
  TippingSettings,
  Preferences,
  Profile,
  ProfileExport,
  NWCInfo,
  NWCPaymentResult,
  NWCBalanceResult,
  NWCInvoiceResult,
  NWCRpcResponse
};

