/**
 * ProfileStorage - Manages user profiles with encrypted credential storage
 * 
 * Each profile is associated with a Nostr public key and contains:
 * - Blink API accounts (encrypted)
 * - NWC connections (encrypted)
 * - Tipping settings
 * - UI preferences
 */

import CryptoUtils from './CryptoUtils.js';

const PROFILES_STORAGE_KEY = 'blinkpos_profiles';
const ACTIVE_PROFILE_KEY = 'blinkpos_active_profile';

/**
 * @typedef {Object} EncryptedField
 * @property {string} encrypted
 * @property {string} iv
 * @property {string} salt
 * @property {boolean} hasPassword
 */

/**
 * @typedef {Object} BlinkAccount
 * @property {string} id
 * @property {string} label
 * @property {EncryptedField} apiKey - Encrypted API key
 * @property {string} [username] - Blink username (fetched from API)
 * @property {string} [defaultCurrency]
 * @property {boolean} isActive
 * @property {number} createdAt
 * @property {number} [lastUsed]
 */

/**
 * @typedef {Object} NWCConnection
 * @property {string} id
 * @property {string} label
 * @property {EncryptedField} uri - Encrypted NWC connection string
 * @property {string[]} [capabilities] - Supported methods
 * @property {boolean} isActive
 * @property {number} createdAt
 */

/**
 * @typedef {Object} TippingSettings
 * @property {boolean} enabled
 * @property {number[]} defaultPercentages
 * @property {boolean} customAmountEnabled
 * @property {boolean} forwardToNWC
 * @property {string} [forwardNWCId]
 */

/**
 * @typedef {Object} Preferences
 * @property {string} defaultCurrency
 * @property {boolean} darkMode
 * @property {boolean} sounds
 * @property {string} language
 * @property {string} numberFormat - Number format preference ('auto', 'comma-period', 'period-comma', 'space-comma')
 */

/**
 * @typedef {Object} Profile
 * @property {string} id
 * @property {string} publicKey - Nostr hex pubkey
 * @property {string} signInMethod - 'extension' or 'externalSigner'
 * @property {number} createdAt
 * @property {number} [lastLogin]
 * @property {BlinkAccount[]} blinkAccounts
 * @property {NWCConnection[]} nwcConnections
 * @property {TippingSettings} tippingSettings
 * @property {Preferences} preferences
 */

class ProfileStorage {
  /**
   * Get all stored profiles
   * @returns {Profile[]}
   */
  static getProfiles() {
    if (typeof localStorage === 'undefined') return [];
    
    try {
      const stored = localStorage.getItem(PROFILES_STORAGE_KEY);
      if (!stored) return [];
      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to parse profiles:', error);
      return [];
    }
  }

  /**
   * Save profiles to storage
   * @param {Profile[]} profiles
   */
  static saveProfiles(profiles) {
    if (typeof localStorage === 'undefined') return;
    
    try {
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
    } catch (error) {
      console.error('Failed to save profiles:', error);
      throw new Error('Failed to save profiles to storage');
    }
  }

  /**
   * Get profile by public key
   * @param {string} publicKey
   * @returns {Profile|null}
   */
  static getProfileByPublicKey(publicKey) {
    if (!publicKey) return null;
    const profiles = this.getProfiles();
    // Normalize to lowercase for comparison (profiles store lowercase)
    const normalizedKey = publicKey.toLowerCase();
    return profiles.find(p => p.publicKey === normalizedKey) || null;
  }
  
  /**
   * Alias for getProfileByPublicKey (used in some places)
   * @param {string} publicKey
   * @returns {Profile|null}
   */
  static loadProfile(publicKey) {
    return this.getProfileByPublicKey(publicKey);
  }

  /**
   * Get profile by ID
   * @param {string} id
   * @returns {Profile|null}
   */
  static getProfileById(id) {
    const profiles = this.getProfiles();
    return profiles.find(p => p.id === id) || null;
  }

  /**
   * Get active profile ID
   * @returns {string|null}
   */
  static getActiveProfileId() {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(ACTIVE_PROFILE_KEY);
  }

  /**
   * Set active profile
   * @param {string} profileId
   */
  static setActiveProfile(profileId) {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(ACTIVE_PROFILE_KEY, profileId);
  }

  /**
   * Get active profile
   * @returns {Profile|null}
   */
  static getActiveProfile() {
    const activeId = this.getActiveProfileId();
    if (!activeId) return null;
    return this.getProfileById(activeId);
  }

  /**
   * Create a new profile
   * @param {string} publicKey - Nostr hex pubkey
   * @param {string} signInMethod - 'extension' or 'externalSigner'
   * @returns {Profile}
   */
  static createProfile(publicKey, signInMethod) {
    // Check if profile already exists
    const existing = this.getProfileByPublicKey(publicKey);
    if (existing) {
      // Update last login and return existing
      existing.lastLogin = Date.now();
      existing.signInMethod = signInMethod;
      this.updateProfile(existing);
      return existing;
    }

    const profile = {
      id: CryptoUtils.generateId(),
      publicKey: publicKey.toLowerCase(),
      signInMethod,
      createdAt: Date.now(),
      lastLogin: Date.now(),
      blinkAccounts: [],
      nwcConnections: [],
      tippingSettings: {
        enabled: true,
        defaultPercentages: [10, 15, 20],
        customAmountEnabled: true,
        forwardToNWC: false,
        forwardNWCId: null
      },
      preferences: {
        defaultCurrency: 'BTC',
        darkMode: true,
        sounds: true,
        language: 'en',
        numberFormat: 'auto'  // Use browser locale by default
      }
    };

    const profiles = this.getProfiles();
    profiles.push(profile);
    this.saveProfiles(profiles);
    this.setActiveProfile(profile.id);

    return profile;
  }

  /**
   * Update an existing profile
   * @param {Profile} profile
   */
  static updateProfile(profile) {
    const profiles = this.getProfiles();
    const index = profiles.findIndex(p => p.id === profile.id);
    
    if (index === -1) {
      throw new Error('Profile not found');
    }

    profiles[index] = profile;
    this.saveProfiles(profiles);
  }

  /**
   * Delete a profile
   * @param {string} profileId
   */
  static deleteProfile(profileId) {
    const profiles = this.getProfiles();
    const filtered = profiles.filter(p => p.id !== profileId);
    this.saveProfiles(filtered);

    // Clear active profile if it was the deleted one
    if (this.getActiveProfileId() === profileId) {
      localStorage.removeItem(ACTIVE_PROFILE_KEY);
    }
  }

  // ============= Blink Account Management =============

  /**
   * Add a Blink account to a profile
   * @param {string} profileId
   * @param {string} label
   * @param {string} apiKey
   * @param {string} [username]
   * @param {string} [defaultCurrency]
   * @returns {Promise<BlinkAccount>}
   */
  static async addBlinkAccount(profileId, label, apiKey, username, defaultCurrency) {
    const profile = this.getProfileById(profileId);
    if (!profile) throw new Error('Profile not found');

    // Encrypt the API key
    const encryptedApiKey = await CryptoUtils.encryptWithDeviceKey(apiKey);

    const account = {
      id: CryptoUtils.generateId(),
      label,
      apiKey: encryptedApiKey,
      username,
      defaultCurrency,
      isActive: profile.blinkAccounts.length === 0, // First account is active
      createdAt: Date.now(),
      lastUsed: null
    };

    profile.blinkAccounts.push(account);
    this.updateProfile(profile);

    return account;
  }

  /**
   * Add a Blink account via Lightning Address (no API key)
   * @param {string} profileId
   * @param {Object} data - Account data
   * @param {string} data.label - User-defined label
   * @param {string} data.username - Blink username
   * @param {string} data.walletId - Wallet ID from Blink API
   * @param {string} data.walletCurrency - BTC or USD
   * @param {string} data.lightningAddress - Full lightning address (username@blink.sv)
   * @returns {Promise<BlinkAccount>}
   */
  static async addBlinkLnAddressAccount(profileId, { label, username, walletId, walletCurrency, lightningAddress }) {
    const profile = this.getProfileById(profileId);
    if (!profile) throw new Error('Profile not found');

    const account = {
      id: CryptoUtils.generateId(),
      type: 'ln-address', // Distinguishes from API key accounts
      label,
      username,
      walletId,
      walletCurrency,
      lightningAddress,
      defaultCurrency: walletCurrency === 'USD' ? 'USD' : 'BTC',
      isActive: profile.blinkAccounts.length === 0, // First account is active
      createdAt: Date.now(),
      lastUsed: null
    };

    profile.blinkAccounts.push(account);
    this.updateProfile(profile);

    return account;
  }

  /**
   * Add npub.cash wallet to profile
   * npub.cash wallets receive payments as Cashu ecash tokens
   * @param {string} profileId
   * @param {Object} params
   * @param {string} params.lightningAddress - Full npub.cash address (e.g., "npub1xxx@npub.cash")
   * @param {string} params.label - User-friendly label
   * @returns {Object} The created wallet object
   */
  static async addNpubCashAccount(profileId, { lightningAddress, label }) {
    const profile = this.getProfileById(profileId);
    if (!profile) throw new Error('Profile not found');

    // Check for duplicate Lightning Address
    const normalizedAddress = lightningAddress.toLowerCase().trim();
    const existingByAddress = profile.blinkAccounts.find(
      a => a.type === 'npub-cash' && a.lightningAddress?.toLowerCase() === normalizedAddress
    );
    if (existingByAddress) {
      throw new Error('This npub.cash address is already connected');
    }

    // Check for duplicate label among npub.cash wallets
    const normalizedLabel = label?.trim();
    if (normalizedLabel) {
      const existingByLabel = profile.blinkAccounts.find(
        a => a.type === 'npub-cash' && a.label?.toLowerCase() === normalizedLabel.toLowerCase()
      );
      if (existingByLabel) {
        throw new Error('A wallet with this label already exists');
      }
    }

    // Parse the Lightning Address
    const [localpart] = lightningAddress.split('@');
    const isNpub = localpart.startsWith('npub1');

    const wallet = {
      id: CryptoUtils.generateId(),
      type: 'npub-cash', // Distinguishes from other wallet types
      label: normalizedLabel || lightningAddress,
      lightningAddress: normalizedAddress, // Full address like "npub1xxx@npub.cash"
      localpart, // Part before @ (npub or username)
      isNpub, // true if localpart is an npub
      defaultCurrency: 'BTC', // npub.cash always uses sats
      isActive: profile.blinkAccounts.length === 0, // First wallet is active
      createdAt: Date.now(),
      lastUsed: null
    };

    profile.blinkAccounts.push(wallet);
    this.updateProfile(profile);

    return wallet;
  }

  /**
   * Get decrypted API key for a Blink account
   * @param {string} profileId
   * @param {string} accountId
   * @returns {Promise<string>}
   */
  static async getBlinkApiKey(profileId, accountId) {
    const profile = this.getProfileById(profileId);
    if (!profile) throw new Error('Profile not found');

    const account = profile.blinkAccounts.find(a => a.id === accountId);
    if (!account) throw new Error('Account not found');
    
    // Lightning Address accounts don't have API keys
    if (account.type === 'ln-address') {
      return null;
    }

    return await CryptoUtils.decryptWithDeviceKey(account.apiKey);
  }

  /**
   * Get decrypted API key for the active Blink account
   * @param {string} [profileId]
   * @returns {Promise<string|null>}
   */
  static async getActiveBlinkApiKey(profileId) {
    const profile = profileId ? this.getProfileById(profileId) : this.getActiveProfile();
    if (!profile) return null;

    const activeAccount = profile.blinkAccounts.find(a => a.isActive);
    if (!activeAccount) return null;
    
    // Lightning Address accounts don't have API keys
    if (activeAccount.type === 'ln-address') {
      return null;
    }

    return await CryptoUtils.decryptWithDeviceKey(activeAccount.apiKey);
  }

  /**
   * Set active Blink account
   * @param {string} profileId
   * @param {string} accountId
   */
  static setActiveBlinkAccount(profileId, accountId) {
    const profile = this.getProfileById(profileId);
    if (!profile) throw new Error('Profile not found');

    profile.blinkAccounts = profile.blinkAccounts.map(account => ({
      ...account,
      isActive: account.id === accountId,
      lastUsed: account.id === accountId ? Date.now() : account.lastUsed
    }));

    this.updateProfile(profile);
  }

  /**
   * Update a Blink account
   * @param {string} profileId
   * @param {string} accountId
   * @param {Partial<BlinkAccount>} updates
   */
  static async updateBlinkAccount(profileId, accountId, updates) {
    const profile = this.getProfileById(profileId);
    if (!profile) throw new Error('Profile not found');

    const accountIndex = profile.blinkAccounts.findIndex(a => a.id === accountId);
    if (accountIndex === -1) throw new Error('Account not found');

    // If updating API key, encrypt it
    if (updates.apiKey && typeof updates.apiKey === 'string') {
      updates.apiKey = await CryptoUtils.encryptWithDeviceKey(updates.apiKey);
    }

    profile.blinkAccounts[accountIndex] = {
      ...profile.blinkAccounts[accountIndex],
      ...updates
    };

    this.updateProfile(profile);
  }

  /**
   * Remove a Blink account
   * @param {string} profileId
   * @param {string} accountId
   */
  static removeBlinkAccount(profileId, accountId) {
    const profile = this.getProfileById(profileId);
    if (!profile) throw new Error('Profile not found');

    const wasActive = profile.blinkAccounts.find(a => a.id === accountId)?.isActive;
    profile.blinkAccounts = profile.blinkAccounts.filter(a => a.id !== accountId);

    // If removed account was active, make first remaining account active
    if (wasActive && profile.blinkAccounts.length > 0) {
      profile.blinkAccounts[0].isActive = true;
    }

    this.updateProfile(profile);
  }

  // ============= NWC Connection Management =============

  /**
   * Add an NWC connection to a profile
   * @param {string} profileId
   * @param {string} label
   * @param {string} uri - NWC connection string
   * @param {string[]} [capabilities]
   * @returns {Promise<NWCConnection>}
   */
  static async addNWCConnection(profileId, label, uri, capabilities = []) {
    const profile = this.getProfileById(profileId);
    if (!profile) throw new Error('Profile not found');

    // Encrypt the URI
    const encryptedUri = await CryptoUtils.encryptWithDeviceKey(uri);

    const connection = {
      id: CryptoUtils.generateId(),
      label,
      uri: encryptedUri,
      capabilities,
      isActive: profile.nwcConnections.length === 0,
      createdAt: Date.now()
    };

    profile.nwcConnections.push(connection);
    this.updateProfile(profile);

    return connection;
  }

  /**
   * Get decrypted NWC URI
   * @param {string} profileId
   * @param {string} connectionId
   * @returns {Promise<string>}
   */
  static async getNWCUri(profileId, connectionId) {
    const profile = this.getProfileById(profileId);
    if (!profile) throw new Error('Profile not found');

    const connection = profile.nwcConnections.find(c => c.id === connectionId);
    if (!connection) throw new Error('Connection not found');

    return await CryptoUtils.decryptWithDeviceKey(connection.uri);
  }

  /**
   * Get active NWC connection URI
   * @param {string} [profileId]
   * @returns {Promise<string|null>}
   */
  static async getActiveNWCUri(profileId) {
    const profile = profileId ? this.getProfileById(profileId) : this.getActiveProfile();
    if (!profile) return null;

    const activeConnection = profile.nwcConnections.find(c => c.isActive);
    if (!activeConnection) return null;

    return await CryptoUtils.decryptWithDeviceKey(activeConnection.uri);
  }

  /**
   * Set active NWC connection
   * @param {string} profileId
   * @param {string} connectionId
   */
  static setActiveNWCConnection(profileId, connectionId) {
    const profile = this.getProfileById(profileId);
    if (!profile) throw new Error('Profile not found');

    profile.nwcConnections = profile.nwcConnections.map(conn => ({
      ...conn,
      isActive: conn.id === connectionId
    }));

    this.updateProfile(profile);
  }

  /**
   * Remove an NWC connection
   * @param {string} profileId
   * @param {string} connectionId
   */
  static removeNWCConnection(profileId, connectionId) {
    const profile = this.getProfileById(profileId);
    if (!profile) throw new Error('Profile not found');

    const wasActive = profile.nwcConnections.find(c => c.id === connectionId)?.isActive;
    profile.nwcConnections = profile.nwcConnections.filter(c => c.id !== connectionId);

    // If removed was active, make first remaining active
    if (wasActive && profile.nwcConnections.length > 0) {
      profile.nwcConnections[0].isActive = true;
    }

    // Clear forward settings if this was the forwarding target
    if (profile.tippingSettings.forwardNWCId === connectionId) {
      profile.tippingSettings.forwardToNWC = false;
      profile.tippingSettings.forwardNWCId = null;
    }

    this.updateProfile(profile);
  }

  // ============= Settings Management =============

  /**
   * Update tipping settings
   * @param {string} profileId
   * @param {Partial<TippingSettings>} settings
   */
  static updateTippingSettings(profileId, settings) {
    const profile = this.getProfileById(profileId);
    if (!profile) throw new Error('Profile not found');

    profile.tippingSettings = {
      ...profile.tippingSettings,
      ...settings
    };

    this.updateProfile(profile);
  }

  /**
   * Update preferences
   * @param {string} profileId
   * @param {Partial<Preferences>} preferences
   */
  static updatePreferences(profileId, preferences) {
    const profile = this.getProfileById(profileId);
    if (!profile) throw new Error('Profile not found');

    profile.preferences = {
      ...profile.preferences,
      ...preferences
    };

    this.updateProfile(profile);
  }

  // ============= Export/Import =============

  /**
   * Export profile data (for backup)
   * Note: Encrypted fields remain encrypted
   * @param {string} profileId
   * @returns {Object}
   */
  static exportProfile(profileId) {
    const profile = this.getProfileById(profileId);
    if (!profile) throw new Error('Profile not found');

    return {
      version: 1,
      exportedAt: Date.now(),
      profile: {
        ...profile,
        // Remove device-specific encryption markers
        // User will need to re-add accounts on new device
      }
    };
  }

  /**
   * Export all profiles
   * @returns {Object}
   */
  static exportAllProfiles() {
    const profiles = this.getProfiles();
    
    return {
      version: 1,
      exportedAt: Date.now(),
      profiles,
      activeProfileId: this.getActiveProfileId()
    };
  }

  /**
   * Import profiles from backup
   * Note: Credentials will need to be re-added as they're device-encrypted
   * @param {Object} data
   * @param {boolean} [merge=true] - Merge with existing or replace
   */
  static importProfiles(data, merge = true) {
    if (data.version !== 1) {
      throw new Error('Unsupported backup version');
    }

    const importedProfiles = data.profiles || [data.profile].filter(Boolean);
    
    if (merge) {
      const existing = this.getProfiles();
      
      importedProfiles.forEach(imported => {
        const normalizedImportKey = (imported.publicKey || '').toLowerCase();
        const existingIndex = existing.findIndex(e => e.publicKey === normalizedImportKey);
        
        if (existingIndex >= 0) {
          // Merge: keep existing encrypted data, update settings
          existing[existingIndex] = {
            ...existing[existingIndex],
            tippingSettings: imported.tippingSettings,
            preferences: imported.preferences,
            // Keep existing blinkAccounts and nwcConnections
          };
        } else {
          // Add new profile (without credentials - they need re-adding)
          existing.push({
            ...imported,
            blinkAccounts: [],
            nwcConnections: [],
            id: CryptoUtils.generateId()
          });
        }
      });

      this.saveProfiles(existing);
    } else {
      // Replace all (credentials will be lost)
      const cleaned = importedProfiles.map(p => ({
        ...p,
        blinkAccounts: [],
        nwcConnections: [],
        id: CryptoUtils.generateId()
      }));
      
      this.saveProfiles(cleaned);
    }

    // Restore active profile if it exists
    if (data.activeProfileId) {
      const profiles = this.getProfiles();
      const importedActiveKey = (data.profiles || []).find(dp => dp.id === data.activeProfileId)?.publicKey?.toLowerCase();
      const activeProfile = profiles.find(p => 
        p.publicKey === importedActiveKey
      );
      if (activeProfile) {
        this.setActiveProfile(activeProfile.id);
      }
    }
  }

  // ============= Utility Methods =============

  /**
   * Check if user has any profiles
   * @returns {boolean}
   */
  static hasProfiles() {
    return this.getProfiles().length > 0;
  }

  /**
   * Get active Blink account info (without decrypting API key)
   * @returns {BlinkAccount|null}
   */
  static getActiveBlinkAccount() {
    const profile = this.getActiveProfile();
    if (!profile) return null;
    return profile.blinkAccounts.find(a => a.isActive) || null;
  }

  /**
   * Get active NWC connection info (without decrypting URI)
   * @returns {NWCConnection|null}
   */
  static getActiveNWCConnection() {
    const profile = this.getActiveProfile();
    if (!profile) return null;
    return profile.nwcConnections.find(c => c.isActive) || null;
  }

  /**
   * Clear all profiles and data
   */
  static clearAll() {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(PROFILES_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_PROFILE_KEY);
  }

  /**
   * Get storage size in bytes
   * @returns {number}
   */
  static getStorageSize() {
    if (typeof localStorage === 'undefined') return 0;
    
    const profiles = localStorage.getItem(PROFILES_STORAGE_KEY) || '';
    return profiles.length * 2; // Rough estimate (UTF-16)
  }
}

// For ES modules
export default ProfileStorage;
export { ProfileStorage };

