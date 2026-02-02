/**
 * Safe Storage Utility
 *
 * Provides safe storage operations with backup/rollback capability.
 * Use this wrapper to prevent data loss during storage operations.
 *
 * @example
 * import { safeStorage } from './safe-storage.js';
 *
 * // Safe write with automatic backup
 * await safeStorage.set({ myKey: newValue }, 'backup-myKey');
 *
 * // Rollback if something goes wrong
 * await safeStorage.rollback('backup-myKey');
 */

const BACKUP_PREFIX = '_backup_';
const MAX_BACKUPS = 5;

/**
 * Safe Storage wrapper for chrome.storage.local
 */
export const safeStorage = {
  /**
   * Get data from storage
   * @param {string|string[]} keys - Storage key(s) to retrieve
   * @returns {Promise<object>} Retrieved data
   */
  async get(keys) {
    try {
      return await chrome.storage.local.get(keys);
    } catch (error) {
      console.error('[SafeStorage] Get failed:', error);
      throw error;
    }
  },

  /**
   * Set data with automatic backup
   * @param {object} data - Data to store
   * @param {string} [backupKey] - Optional key for backup (enables rollback)
   * @returns {Promise<void>}
   */
  async set(data, backupKey) {
    try {
      // Create backup if backupKey provided
      if (backupKey) {
        const keysToBackup = Object.keys(data);
        const existingData = await chrome.storage.local.get(keysToBackup);

        if (Object.keys(existingData).length > 0) {
          const backup = {
            key: `${BACKUP_PREFIX}${backupKey}`,
            timestamp: Date.now(),
            data: existingData
          };

          await chrome.storage.local.set({ [backup.key]: backup });
          await this._cleanOldBackups(backupKey);
        }
      }

      // Perform the actual write
      await chrome.storage.local.set(data);

    } catch (error) {
      console.error('[SafeStorage] Set failed:', error);
      throw error;
    }
  },

  /**
   * Rollback to a previous backup
   * @param {string} backupKey - The backup key used in set()
   * @returns {Promise<boolean>} True if rollback succeeded
   */
  async rollback(backupKey) {
    try {
      const fullKey = `${BACKUP_PREFIX}${backupKey}`;
      const result = await chrome.storage.local.get(fullKey);
      const backup = result[fullKey];

      if (!backup || !backup.data) {
        console.warn('[SafeStorage] No backup found for:', backupKey);
        return false;
      }

      // Restore the backup data
      await chrome.storage.local.set(backup.data);

      // Remove the used backup
      await chrome.storage.local.remove(fullKey);

      console.log('[SafeStorage] Rolled back to backup from:', new Date(backup.timestamp));
      return true;

    } catch (error) {
      console.error('[SafeStorage] Rollback failed:', error);
      return false;
    }
  },

  /**
   * Remove data from storage
   * @param {string|string[]} keys - Key(s) to remove
   * @returns {Promise<void>}
   */
  async remove(keys) {
    try {
      await chrome.storage.local.remove(keys);
    } catch (error) {
      console.error('[SafeStorage] Remove failed:', error);
      throw error;
    }
  },

  /**
   * Get all backups for a key
   * @param {string} backupKey - The backup key prefix
   * @returns {Promise<Array>} Array of backup objects
   */
  async getBackups(backupKey) {
    try {
      const allData = await chrome.storage.local.get(null);
      const prefix = `${BACKUP_PREFIX}${backupKey}`;

      return Object.entries(allData)
        .filter(([key]) => key.startsWith(prefix))
        .map(([, value]) => value)
        .sort((a, b) => b.timestamp - a.timestamp);

    } catch (error) {
      console.error('[SafeStorage] Get backups failed:', error);
      return [];
    }
  },

  /**
   * Clean old backups, keeping only the most recent
   * @private
   */
  async _cleanOldBackups(backupKey) {
    try {
      const backups = await this.getBackups(backupKey);

      if (backups.length > MAX_BACKUPS) {
        const toRemove = backups
          .slice(MAX_BACKUPS)
          .map(b => b.key);

        if (toRemove.length > 0) {
          await chrome.storage.local.remove(toRemove);
        }
      }
    } catch (error) {
      console.warn('[SafeStorage] Cleanup failed:', error);
    }
  },

  /**
   * Validate data against a schema before storing
   * @param {object} data - Data to validate
   * @param {object} schema - Schema definition
   * @returns {object} Validation result { valid, errors }
   */
  validate(data, schema) {
    const errors = [];

    // Check required fields
    if (schema.required) {
      schema.required.forEach(field => {
        if (!(field in data)) {
          errors.push(`Missing required field: ${field}`);
        }
      });
    }

    // Check types
    if (schema.types) {
      Object.entries(schema.types).forEach(([field, expectedType]) => {
        if (field in data) {
          const actualType = Array.isArray(data[field]) ? 'array' : typeof data[field];
          if (actualType !== expectedType) {
            errors.push(`Field ${field}: expected ${expectedType}, got ${actualType}`);
          }
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  },

  /**
   * Merge new data with existing data (useful for partial updates)
   * @param {string} key - Storage key
   * @param {object} updates - Partial data to merge
   * @param {string} [backupKey] - Optional backup key
   * @returns {Promise<object>} The merged data
   */
  async merge(key, updates, backupKey) {
    const existing = await this.get(key);
    const currentData = existing[key] || {};

    const merged = {
      ...currentData,
      ...updates
    };

    await this.set({ [key]: merged }, backupKey);

    return merged;
  }
};

/**
 * Safe Storage wrapper for chrome.storage.sync
 */
export const safeSyncStorage = {
  async get(keys) {
    try {
      return await chrome.storage.sync.get(keys);
    } catch (error) {
      console.error('[SafeSyncStorage] Get failed:', error);
      throw error;
    }
  },

  async set(data) {
    try {
      await chrome.storage.sync.set(data);
    } catch (error) {
      console.error('[SafeSyncStorage] Set failed:', error);
      throw error;
    }
  },

  async remove(keys) {
    try {
      await chrome.storage.sync.remove(keys);
    } catch (error) {
      console.error('[SafeSyncStorage] Remove failed:', error);
      throw error;
    }
  }
};

/**
 * Safe Storage wrapper for chrome.storage.session (with local fallback)
 */
export const safeSessionStorage = {
  _useLocal: false,

  async get(keys) {
    try {
      if (this._useLocal) {
        return await chrome.storage.local.get(keys);
      }
      return await chrome.storage.session.get(keys);
    } catch (error) {
      console.warn('[SafeSessionStorage] Session storage failed, using local fallback');
      this._useLocal = true;
      return await chrome.storage.local.get(keys);
    }
  },

  async set(data) {
    try {
      if (this._useLocal) {
        return await chrome.storage.local.set(data);
      }
      return await chrome.storage.session.set(data);
    } catch (error) {
      console.warn('[SafeSessionStorage] Session storage failed, using local fallback');
      this._useLocal = true;
      return await chrome.storage.local.set(data);
    }
  },

  async remove(keys) {
    try {
      if (this._useLocal) {
        return await chrome.storage.local.remove(keys);
      }
      return await chrome.storage.session.remove(keys);
    } catch (error) {
      this._useLocal = true;
      return await chrome.storage.local.remove(keys);
    }
  }
};

export default safeStorage;
