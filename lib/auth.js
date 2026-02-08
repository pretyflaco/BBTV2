const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const CryptoJS = require('crypto-js');
const { getApiUrl } = require('./config/api');

const JWT_SECRET = process.env.JWT_SECRET || 'blink-balance-tracker-secret-key';

// Helper to get encryption key at runtime (not captured at module load time)
function getEncryptionKey() {
  return process.env.ENCRYPTION_KEY || 'blink-encryption-key-2025';
}

class AuthManager {
  // Generate secure user session
  static generateSession(username) {
    const payload = {
      username,
      id: crypto.randomUUID(),
      created: Date.now()
    };
    
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
  }

  // Verify user session
  static verifySession(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return null;
    }
  }

  // Encrypt API key for storage
  static encryptApiKey(apiKey) {
    const key = getEncryptionKey();
    return CryptoJS.AES.encrypt(apiKey, key).toString();
  }

  // Decrypt API key for use
  static decryptApiKey(encryptedKey) {
    try {
      const key = getEncryptionKey();
      const bytes = CryptoJS.AES.decrypt(encryptedKey, key);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      return null;
    }
  }

  // Validate Blink API key
  static async validateBlinkApiKey(apiKey) {
    try {
      const response = await fetch(getApiUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey
        },
        body: JSON.stringify({
          query: 'query { me { id username } }'
        })
      });

      const data = await response.json();
      return !data.errors && data.data?.me?.id;
    } catch (error) {
      console.error('API validation error:', error);
      return false;
    }
  }

  // Hash password for storage (if we add user accounts later)
  static hashPassword(password) {
    return crypto.pbkdf2Sync(password, 'salt', 1000, 64, 'sha512').toString('hex');
  }
}

module.exports = AuthManager;
