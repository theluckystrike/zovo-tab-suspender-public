/**
 * Dashboard Provider - Real-time Stats Provider for Dashboard UI
 *
 * Task 2: Dashboard Sync
 * Subscribes to stats updates and provides real-time data to dashboard.
 *
 * @module dashboard-provider
 */

import { FEATURES } from '../../utils/feature-flags.js';

/**
 * DashboardProvider class - manages dashboard stats synchronization
 */
export class DashboardProvider {
  constructor() {
    this.lastUpdated = null;
    this.isSyncing = false;
    this.onStatsUpdate = null;
    this.onSyncStatusChange = null;
    this.messageListener = null;
  }

  /**
   * Initialize the provider and start listening for updates
   *
   * @param {Object} callbacks - Callback functions for updates
   * @param {Function} callbacks.onStatsUpdate - Called when stats are updated
   * @param {Function} callbacks.onSyncStatusChange - Called when sync status changes
   */
  initialize(callbacks = {}) {
    if (!FEATURES.DASHBOARD_SYNC) {
      console.log('[DashboardProvider] Feature disabled');
      return;
    }

    this.onStatsUpdate = callbacks.onStatsUpdate;
    this.onSyncStatusChange = callbacks.onSyncStatusChange;

    // Set up message listener for broadcasts
    this.messageListener = (message, sender, sendResponse) => {
      if (message.type === 'STATS_UPDATED') {
        this.handleStatsUpdate(message);
        sendResponse({ received: true });
      }
      return false; // Don't keep channel open
    };

    chrome.runtime.onMessage.addListener(this.messageListener);
    console.log('[DashboardProvider] Initialized, listening for updates');
  }

  /**
   * Handle incoming stats update broadcast
   *
   * @param {Object} message - The STATS_UPDATED message
   */
  handleStatsUpdate(message) {
    this.lastUpdated = message.timestamp;
    this.isSyncing = false;

    if (this.onSyncStatusChange) {
      this.onSyncStatusChange({ syncing: false, lastUpdated: this.lastUpdated });
    }

    if (this.onStatsUpdate) {
      this.onStatsUpdate(message.stats, message.timestamp);
    }

    console.log('[DashboardProvider] Stats updated, version:', message.version);
  }

  /**
   * Manually refresh stats
   *
   * @returns {Promise<Object>} The refreshed stats
   */
  async refresh() {
    this.isSyncing = true;

    if (this.onSyncStatusChange) {
      this.onSyncStatusChange({ syncing: true, lastUpdated: this.lastUpdated });
    }

    try {
      // Request fresh stats from background
      const stats = await chrome.runtime.sendMessage({ type: 'GET_STATS' });

      this.lastUpdated = Date.now();
      this.isSyncing = false;

      if (this.onSyncStatusChange) {
        this.onSyncStatusChange({ syncing: false, lastUpdated: this.lastUpdated });
      }

      if (this.onStatsUpdate && stats && !stats.error) {
        this.onStatsUpdate(stats, this.lastUpdated);
      }

      return stats;
    } catch (error) {
      console.error('[DashboardProvider] Refresh failed:', error);
      this.isSyncing = false;

      if (this.onSyncStatusChange) {
        this.onSyncStatusChange({ syncing: false, lastUpdated: this.lastUpdated, error: error.message });
      }

      throw error;
    }
  }

  /**
   * Get time since last update as human-readable string
   *
   * @returns {string} Human-readable time string (e.g., "2 minutes ago")
   */
  getLastUpdatedText() {
    if (!this.lastUpdated) {
      return 'Never';
    }

    const seconds = Math.floor((Date.now() - this.lastUpdated) / 1000);

    if (seconds < 5) {
      return 'Just now';
    }
    if (seconds < 60) {
      return `${seconds} seconds ago`;
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    }

    const days = Math.floor(hours / 24);
    return days === 1 ? '1 day ago' : `${days} days ago`;
  }

  /**
   * Get the last update timestamp
   *
   * @returns {number|null} Timestamp or null if never updated
   */
  getLastUpdatedTimestamp() {
    return this.lastUpdated;
  }

  /**
   * Check if currently syncing
   *
   * @returns {boolean} True if sync in progress
   */
  isSyncInProgress() {
    return this.isSyncing;
  }

  /**
   * Clean up listeners
   * Call this when dashboard is being closed/destroyed
   */
  destroy() {
    if (this.messageListener) {
      chrome.runtime.onMessage.removeListener(this.messageListener);
      this.messageListener = null;
    }
    console.log('[DashboardProvider] Destroyed');
  }
}

/**
 * Create and initialize a dashboard provider
 *
 * @param {Object} callbacks - Callback functions
 * @returns {DashboardProvider} Initialized provider instance
 */
export function createDashboardProvider(callbacks = {}) {
  const provider = new DashboardProvider();
  provider.initialize(callbacks);
  return provider;
}

/**
 * Format "last updated" timestamp for display
 *
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted string
 */
export function formatLastUpdated(timestamp) {
  if (!timestamp) return 'Never';

  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return new Date(timestamp).toLocaleDateString();
}

export default DashboardProvider;
