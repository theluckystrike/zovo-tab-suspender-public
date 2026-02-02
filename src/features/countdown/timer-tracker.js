/**
 * Timer Tracker Module for Countdown Indicator
 *
 * Tracks when each tab's suspension alarm will fire and provides
 * methods to query remaining time. Persists timer info to storage
 * for service worker restart recovery.
 *
 * @module timer-tracker
 */

import { FEATURES } from '../../utils/feature-flags.js';

/**
 * Storage key for countdown timer data
 * Uses chrome.storage.session with local fallback
 */
const COUNTDOWN_STORAGE_KEY = 'countdown_timers';

/**
 * Alarm name prefix (must match background.js)
 */
const ALARM_PREFIX = 'suspend-tab-';

/**
 * TimerTracker class - manages countdown timer state
 */
class TimerTracker {
  constructor() {
    this.timers = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the timer tracker by loading persisted state
   * @returns {Promise<void>}
   */
  async initialize() {
    if (!FEATURES.COUNTDOWN_INDICATOR) return;

    try {
      await this.loadFromStorage();
      this.initialized = true;
      console.log('[TimerTracker] Initialized with', this.timers.size, 'timers');
    } catch (error) {
      console.error('[TimerTracker] Initialization failed:', error);
    }
  }

  /**
   * Load timer data from storage
   * @returns {Promise<void>}
   */
  async loadFromStorage() {
    try {
      // Try session storage first
      let result = await chrome.storage.session.get(COUNTDOWN_STORAGE_KEY);
      let data = result[COUNTDOWN_STORAGE_KEY];

      // Fallback to local storage
      if (!data) {
        result = await chrome.storage.local.get(COUNTDOWN_STORAGE_KEY);
        data = result[COUNTDOWN_STORAGE_KEY];
      }

      if (data) {
        this.timers = new Map(Object.entries(data));
      }
    } catch (error) {
      console.error('[TimerTracker] Failed to load from storage:', error);
    }
  }

  /**
   * Save timer data to storage
   * @returns {Promise<void>}
   */
  async saveToStorage() {
    const data = Object.fromEntries(this.timers);

    try {
      await chrome.storage.session.set({ [COUNTDOWN_STORAGE_KEY]: data });
    } catch (error) {
      // Fallback to local storage
      try {
        await chrome.storage.local.set({ [COUNTDOWN_STORAGE_KEY]: data });
      } catch (e) {
        console.error('[TimerTracker] Failed to save to storage:', e);
      }
    }
  }

  /**
   * Track a timer start for a tab
   *
   * @param {number} tabId - The tab ID
   * @param {number} timeoutMinutes - The suspension timeout in minutes
   * @returns {Promise<void>}
   */
  async trackTimer(tabId, timeoutMinutes) {
    if (!FEATURES.COUNTDOWN_INDICATOR) return;

    const now = Date.now();
    const suspendAt = now + (timeoutMinutes * 60 * 1000);

    this.timers.set(String(tabId), {
      suspendAt,
      startedAt: now,
      timeoutMinutes
    });

    await this.saveToStorage();
    console.log(`[TimerTracker] Tracking tab ${tabId}, suspends at ${new Date(suspendAt).toISOString()}`);
  }

  /**
   * Clear timer tracking for a tab
   *
   * @param {number} tabId - The tab ID
   * @returns {Promise<void>}
   */
  async clearTimer(tabId) {
    if (!FEATURES.COUNTDOWN_INDICATOR) return;

    const hadTimer = this.timers.has(String(tabId));
    this.timers.delete(String(tabId));

    if (hadTimer) {
      await this.saveToStorage();
      console.log(`[TimerTracker] Cleared timer for tab ${tabId}`);
    }
  }

  /**
   * Get remaining time for a specific tab
   *
   * @param {number} tabId - The tab ID
   * @returns {Promise<object>} Timer info with remainingMs, suspendAt, isPaused
   */
  async getTabCountdown(tabId) {
    if (!FEATURES.COUNTDOWN_INDICATOR) {
      return { tabId, remainingMs: -1, suspendAt: null, isPaused: true };
    }

    try {
      // First try to get actual alarm data (most accurate)
      const alarmName = `${ALARM_PREFIX}${tabId}`;
      const alarm = await chrome.alarms.get(alarmName);

      if (alarm) {
        const remainingMs = Math.max(0, alarm.scheduledTime - Date.now());
        return {
          tabId,
          remainingMs,
          suspendAt: alarm.scheduledTime,
          isPaused: false
        };
      }

      // Check if tab is suspended, active, or whitelisted (paused states)
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab) {
        return { tabId, remainingMs: -1, suspendAt: null, isPaused: true };
      }

      // Check if suspended or internal page
      if (this.isSuspendedPage(tab.url) || this.isInternalPage(tab.url)) {
        return { tabId, remainingMs: -1, suspendAt: null, isPaused: true };
      }

      // Active tab doesn't have countdown
      if (tab.active) {
        return { tabId, remainingMs: -1, suspendAt: null, isPaused: true };
      }

      // Fall back to stored timer data
      const timerData = this.timers.get(String(tabId));
      if (timerData) {
        const remainingMs = Math.max(0, timerData.suspendAt - Date.now());
        return {
          tabId,
          remainingMs,
          suspendAt: timerData.suspendAt,
          isPaused: false
        };
      }

      // No timer found
      return { tabId, remainingMs: -1, suspendAt: null, isPaused: true };

    } catch (error) {
      console.error(`[TimerTracker] Error getting countdown for tab ${tabId}:`, error);
      return { tabId, remainingMs: -1, suspendAt: null, isPaused: true };
    }
  }

  /**
   * Get all active countdowns
   *
   * @returns {Promise<Array<object>>} Array of countdown info objects
   */
  async getAllCountdowns() {
    if (!FEATURES.COUNTDOWN_INDICATOR) {
      return { countdowns: [] };
    }

    const countdowns = [];

    try {
      // Get all alarms
      const alarms = await chrome.alarms.getAll();

      for (const alarm of alarms) {
        if (alarm.name.startsWith(ALARM_PREFIX)) {
          const tabId = parseInt(alarm.name.replace(ALARM_PREFIX, ''), 10);
          const remainingMs = Math.max(0, alarm.scheduledTime - Date.now());

          countdowns.push({
            tabId,
            remainingMs,
            suspendAt: alarm.scheduledTime
          });
        }
      }

      // Sort by remaining time (soonest first)
      countdowns.sort((a, b) => a.remainingMs - b.remainingMs);

    } catch (error) {
      console.error('[TimerTracker] Error getting all countdowns:', error);
    }

    return { countdowns };
  }

  /**
   * Sync stored timers with actual alarms
   * Call this periodically or after service worker restart
   *
   * @returns {Promise<void>}
   */
  async syncWithAlarms() {
    if (!FEATURES.COUNTDOWN_INDICATOR) return;

    try {
      const alarms = await chrome.alarms.getAll();
      const alarmMap = new Map();

      // Build map of current alarms
      for (const alarm of alarms) {
        if (alarm.name.startsWith(ALARM_PREFIX)) {
          const tabId = alarm.name.replace(ALARM_PREFIX, '');
          alarmMap.set(tabId, alarm.scheduledTime);
        }
      }

      // Update stored timers to match actual alarms
      const newTimers = new Map();
      for (const [tabId, suspendAt] of alarmMap) {
        const existing = this.timers.get(tabId);
        newTimers.set(tabId, {
          suspendAt,
          startedAt: existing?.startedAt || Date.now(),
          timeoutMinutes: existing?.timeoutMinutes || 30
        });
      }

      this.timers = newTimers;
      await this.saveToStorage();

      console.log('[TimerTracker] Synced with', this.timers.size, 'alarms');
    } catch (error) {
      console.error('[TimerTracker] Sync failed:', error);
    }
  }

  /**
   * Check if URL is a suspended page
   * @param {string} url - The URL to check
   * @returns {boolean}
   */
  isSuspendedPage(url) {
    if (!url) return false;
    return url.includes('suspended.html');
  }

  /**
   * Check if URL is an internal/system page
   * @param {string} url - The URL to check
   * @returns {boolean}
   */
  isInternalPage(url) {
    if (!url) return true;

    const internalPrefixes = [
      'chrome://',
      'chrome-extension://',
      'chrome-search://',
      'edge://',
      'about:',
      'file://',
      'data:',
      'blob:',
      'javascript:',
      'view-source:',
      'devtools://',
      'brave://',
      'opera://',
      'vivaldi://'
    ];

    return internalPrefixes.some(prefix => url.startsWith(prefix));
  }
}

// Create singleton instance
const timerTracker = new TimerTracker();

// Export singleton and class
export { timerTracker, TimerTracker };
export default timerTracker;
