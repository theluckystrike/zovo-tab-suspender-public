/**
 * Stats Manager - Centralized Statistics Management
 *
 * Task 2: Dashboard Sync
 * Provides single source of truth for statistics and broadcasts updates.
 *
 * @module stats-manager
 */

import { FEATURES } from '../../utils/feature-flags.js';

/**
 * Storage key for stats metadata (last update tracking)
 */
const STATS_METADATA_KEY = 'stats_metadata';

/**
 * StatsManager class - handles statistics broadcasting and synchronization
 */
export class StatsManager {
  constructor() {
    this.version = 0;
    this.lastBroadcast = 0;
    this.minBroadcastInterval = 500; // Minimum ms between broadcasts to prevent spam
  }

  /**
   * Initialize the stats manager
   * Should be called once on background script startup
   */
  async initialize() {
    if (!FEATURES.DASHBOARD_SYNC) return;

    // Load existing metadata
    try {
      const result = await chrome.storage.local.get(STATS_METADATA_KEY);
      if (result[STATS_METADATA_KEY]) {
        this.version = result[STATS_METADATA_KEY].version || 0;
      }
    } catch (error) {
      console.warn('[StatsManager] Failed to load metadata:', error);
    }

    console.log('[StatsManager] Initialized, version:', this.version);
  }

  /**
   * Broadcast stats update to all listeners (popup, dashboard, etc.)
   *
   * @param {Object} stats - The stats object from getStats()
   * @returns {Promise<void>}
   */
  async broadcastStatsUpdate(stats) {
    if (!FEATURES.DASHBOARD_SYNC) return;

    const now = Date.now();

    // Throttle broadcasts to prevent spam during bulk operations
    if (now - this.lastBroadcast < this.minBroadcastInterval) {
      return;
    }

    this.lastBroadcast = now;
    this.version++;

    // Update metadata in storage
    const metadata = {
      lastUpdated: now,
      version: this.version
    };

    try {
      await chrome.storage.local.set({ [STATS_METADATA_KEY]: metadata });
    } catch (error) {
      console.warn('[StatsManager] Failed to save metadata:', error);
    }

    // Broadcast to all extension pages
    const message = {
      type: 'STATS_UPDATED',
      stats: stats,
      timestamp: now,
      version: this.version
    };

    try {
      await chrome.runtime.sendMessage(message);
      console.log('[StatsManager] Broadcast STATS_UPDATED, version:', this.version);
    } catch (error) {
      // This error is expected when no listeners are active (popup/dashboard closed)
      // Silently ignore - this is normal behavior
    }
  }

  /**
   * Get the current stats metadata
   *
   * @returns {Promise<Object>} Metadata with lastUpdated and version
   */
  async getMetadata() {
    try {
      const result = await chrome.storage.local.get(STATS_METADATA_KEY);
      return result[STATS_METADATA_KEY] || { lastUpdated: 0, version: 0 };
    } catch (error) {
      console.warn('[StatsManager] Failed to get metadata:', error);
      return { lastUpdated: 0, version: 0 };
    }
  }

  /**
   * Force a stats refresh broadcast
   * Called when UI explicitly requests a refresh
   *
   * @param {Function} getStatsFn - Function to call to get current stats
   * @returns {Promise<Object>} The stats object
   */
  async forceRefresh(getStatsFn) {
    if (!FEATURES.DASHBOARD_SYNC) {
      return await getStatsFn();
    }

    this.lastBroadcast = 0; // Reset throttle
    const stats = await getStatsFn();
    await this.broadcastStatsUpdate(stats);
    return stats;
  }
}

/**
 * Singleton instance for use across the extension
 */
export const statsManager = new StatsManager();

/**
 * Helper function to broadcast stats update
 * Convenience wrapper for use in background.js
 *
 * @param {Object} stats - Stats object to broadcast
 */
export async function broadcastStatsUpdate(stats) {
  await statsManager.broadcastStatsUpdate(stats);
}

/**
 * Initialize stats manager
 * Call this from background.js on startup
 */
export async function initializeStatsManager() {
  await statsManager.initialize();
}

export default statsManager;
