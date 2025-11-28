/**
 * MigrationService - Handles migration of legacy API key users to Nostr auth
 * 
 * Migration flow:
 * 1. Legacy user is authenticated with API key
 * 2. User initiates migration by signing in with Nostr
 * 3. System links the Nostr identity to their existing Blink account
 * 4. Credentials are migrated to Nostr profile storage
 * 5. User can now sign in with Nostr and access their Blink account
 */

class MigrationService {
  static MIGRATION_STATE_KEY = 'blinkpos_migration_state';

  /**
   * Check if current session is a legacy (API key) session
   */
  static isLegacySession() {
    // Check for auth-token cookie existence
    if (typeof document === 'undefined') return false;
    return document.cookie.includes('auth-token=');
  }

  /**
   * Start migration process
   * Stores the current legacy session info for later use
   */
  static startMigration(legacyUsername) {
    if (typeof localStorage === 'undefined') return false;
    
    const migrationState = {
      legacyUsername,
      startedAt: Date.now(),
      status: 'pending'
    };
    
    localStorage.setItem(this.MIGRATION_STATE_KEY, JSON.stringify(migrationState));
    return true;
  }

  /**
   * Check if there's a pending migration
   */
  static getPendingMigration() {
    if (typeof localStorage === 'undefined') return null;
    
    try {
      const state = localStorage.getItem(this.MIGRATION_STATE_KEY);
      if (!state) return null;
      
      const migrationState = JSON.parse(state);
      
      // Migration expires after 1 hour
      if (Date.now() - migrationState.startedAt > 60 * 60 * 1000) {
        this.clearMigration();
        return null;
      }
      
      return migrationState;
    } catch (error) {
      console.error('Failed to get migration state:', error);
      return null;
    }
  }

  /**
   * Complete migration - called after Nostr sign-in
   * Links the Nostr identity to the legacy account
   */
  static async completeMigration(nostrPublicKey) {
    const pending = this.getPendingMigration();
    if (!pending) {
      return { success: false, error: 'No pending migration' };
    }

    try {
      // Call migration API to transfer credentials
      const response = await fetch('/api/auth/migrate-to-nostr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          nostrPublicKey,
          legacyUsername: pending.legacyUsername
        })
      });

      const data = await response.json();

      if (response.ok) {
        // Update migration state
        const updatedState = {
          ...pending,
          status: 'completed',
          completedAt: Date.now(),
          nostrPublicKey
        };
        localStorage.setItem(this.MIGRATION_STATE_KEY, JSON.stringify(updatedState));
        
        return { 
          success: true, 
          apiKey: data.apiKey,
          blinkUsername: data.blinkUsername,
          preferences: data.preferences
        };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      console.error('Migration failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear migration state
   */
  static clearMigration() {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(this.MIGRATION_STATE_KEY);
  }

  /**
   * Check if user has already migrated
   */
  static async checkMigrationStatus(nostrPublicKey) {
    try {
      const response = await fetch(`/api/auth/migration-status?publicKey=${nostrPublicKey}`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        return data;
      }
      return { migrated: false };
    } catch (error) {
      console.error('Failed to check migration status:', error);
      return { migrated: false };
    }
  }
}

module.exports = MigrationService;

