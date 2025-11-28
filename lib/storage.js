const fs = require('fs').promises;
const path = require('path');
const AuthManager = require('./auth');

class StorageManager {
  constructor() {
    this.storageDir = path.join(process.cwd(), '.data');
    this.ensureDataDir();
  }

  async ensureDataDir() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create data directory:', error);
    }
  }

  // Get user-specific storage path
  getUserStoragePath(userId) {
    const hashedId = require('crypto')
      .createHash('sha256')
      .update(userId)
      .digest('hex')
      .substring(0, 16);
    
    return path.join(this.storageDir, `user_${hashedId}.json`);
  }

  // Save user data (API keys, preferences)
  async saveUserData(userId, data) {
    try {
      console.log('[StorageManager] Saving data for user:', userId);
      const filePath = this.getUserStoragePath(userId);
      console.log('[StorageManager] File path:', filePath);
      
      const encryptedData = {
        ...data,
        apiKey: data.apiKey ? AuthManager.encryptApiKey(data.apiKey) : null,
        lastUpdated: Date.now()
      };
      
      console.log('[StorageManager] Writing file...');
      await fs.writeFile(filePath, JSON.stringify(encryptedData, null, 2));
      console.log('[StorageManager] ✓ File written successfully');
      return true;
    } catch (error) {
      console.error('[StorageManager] Failed to save user data:', error);
      return false;
    }
  }

  // Load user data
  async loadUserData(userId) {
    try {
      const filePath = this.getUserStoragePath(userId);
      const fileContent = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(fileContent);
      
      // Decrypt API key
      if (data.apiKey) {
        data.apiKey = AuthManager.decryptApiKey(data.apiKey);
      }
      
      return data;
    } catch (error) {
      // File doesn't exist or other error
      return null;
    }
  }

  // Delete user data
  async deleteUserData(userId) {
    try {
      const filePath = this.getUserStoragePath(userId);
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  // List all users (for admin purposes)
  async listUsers() {
    try {
      const files = await fs.readdir(this.storageDir);
      return files
        .filter(file => file.startsWith('user_') && file.endsWith('.json'))
        .map(file => file.replace('user_', '').replace('.json', ''));
    } catch (error) {
      return [];
    }
  }
}

module.exports = new StorageManager();
