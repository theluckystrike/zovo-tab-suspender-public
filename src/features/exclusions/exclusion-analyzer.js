/**
 * Exclusion Analyzer for Tab Suspender Pro
 *
 * Analyzes all tabs and categorizes exclusions BEFORE suspending.
 * Returns a comprehensive report with counts and tab details for each exclusion reason.
 *
 * @module exclusion-analyzer
 */

import { FEATURES } from '../../utils/feature-flags.js';

/**
 * Exclusion reasons with labels and icons
 */
export const EXCLUSION_REASONS = {
  whitelist: { label: 'Whitelisted', icon: '✓', priority: 1 },
  pinned: { label: 'Pinned', icon: '📌', priority: 2 },
  audio: { label: 'Playing audio', icon: '🔊', priority: 3 },
  forms: { label: 'Unsaved forms', icon: '📝', priority: 4 },
  active: { label: 'Active tab', icon: '👁', priority: 5 },
  alreadySuspended: { label: 'Already suspended', icon: '💤', priority: 6 },
  systemPages: { label: 'System pages', icon: '⚙️', priority: 7 }
};

/**
 * Internal page prefixes that are never suspended
 */
const INTERNAL_PREFIXES = [
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

/**
 * Check if a URL is an internal/system page
 * @param {string} url - The URL to check
 * @returns {boolean}
 */
function isSystemPage(url) {
  if (!url) return true;
  return INTERNAL_PREFIXES.some(prefix => url.startsWith(prefix));
}

/**
 * Check if a URL is a suspended page
 * @param {string} url - The URL to check
 * @returns {boolean}
 */
function isSuspendedPage(url) {
  if (!url) return false;
  return url.includes('suspended.html');
}

/**
 * Check if a URL is whitelisted
 * @param {string} url - The URL to check
 * @param {string[]} whitelistedDomains - List of whitelisted domains
 * @returns {boolean}
 */
function isWhitelisted(url, whitelistedDomains) {
  if (!url || !whitelistedDomains || whitelistedDomains.length === 0) {
    return false;
  }

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    return whitelistedDomains.some(domain => {
      const d = domain.toLowerCase();
      return hostname === d || hostname.endsWith('.' + d);
    });
  } catch {
    return false;
  }
}

/**
 * Get the exclusion reason for a single tab
 *
 * @param {chrome.tabs.Tab} tab - The tab to analyze
 * @param {Object} settings - Current settings
 * @param {Object} options - Additional options
 * @param {Object} options.formStatus - Map of tabId -> hasUnsavedForms
 * @returns {string|null} - Exclusion reason key or null if can be suspended
 */
export function getExclusionReason(tab, settings, options = {}) {
  const { formStatus = {} } = options;

  // Check in priority order (most specific first)

  // Already suspended - highest priority
  if (isSuspendedPage(tab.url)) {
    return 'alreadySuspended';
  }

  // Active tab
  if (tab.active && settings.neverSuspendActiveTab !== false) {
    return 'active';
  }

  // System/internal pages
  if (isSystemPage(tab.url)) {
    return 'systemPages';
  }

  // Pinned tabs (if setting enabled)
  if (tab.pinned && !settings.suspendPinnedTabs) {
    return 'pinned';
  }

  // Playing audio (if setting enabled)
  if (tab.audible && settings.neverSuspendAudio !== false) {
    return 'audio';
  }

  // Whitelisted domain
  if (isWhitelisted(tab.url, settings.whitelistedDomains)) {
    return 'whitelist';
  }

  // Unsaved forms
  if (formStatus[tab.id] === true) {
    return 'forms';
  }

  // No exclusion - can be suspended
  return null;
}

/**
 * Exclusion report structure
 * @typedef {Object} ExclusionReport
 * @property {number} total - Total number of tabs analyzed
 * @property {number} suspendable - Number of tabs that can be suspended
 * @property {number} excluded - Number of tabs excluded from suspension
 * @property {Object} byReason - Breakdown by exclusion reason
 * @property {Object} byReason.whitelist - Whitelisted tabs
 * @property {Object} byReason.pinned - Pinned tabs
 * @property {Object} byReason.audio - Tabs playing audio
 * @property {Object} byReason.forms - Tabs with unsaved forms
 * @property {Object} byReason.active - Active tabs
 * @property {Object} byReason.alreadySuspended - Already suspended tabs
 * @property {Object} byReason.systemPages - System/internal pages
 */

/**
 * Analyze all tabs in the current window and categorize exclusions
 *
 * @param {Object} options - Analysis options
 * @param {number} [options.windowId] - Specific window to analyze (default: current window)
 * @param {boolean} [options.allWindows=false] - Analyze all windows
 * @returns {Promise<ExclusionReport>} - Detailed exclusion report
 */
export async function analyzeExclusions(options = {}) {
  // Feature flag check
  if (!FEATURES.EXCLUSION_FEEDBACK) {
    return createEmptyReport();
  }

  const { windowId, allWindows = false } = options;

  try {
    // Get settings
    const settingsResult = await chrome.storage.sync.get('tabSuspenderSettings');
    const settings = settingsResult.tabSuspenderSettings || {
      suspensionTimeout: 30,
      autoUnsuspendOnFocus: true,
      suspendPinnedTabs: false,
      whitelistedDomains: ['mail.google.com', 'calendar.google.com', 'docs.google.com'],
      neverSuspendAudio: true,
      neverSuspendActiveTab: true
    };

    // Get form status from storage
    let formStatus = {};
    try {
      const formResult = await chrome.storage.session.get('tabFormStatus');
      formStatus = formResult.tabFormStatus || {};
    } catch {
      // Fallback to local storage
      const formResult = await chrome.storage.local.get('tabFormStatus');
      formStatus = formResult.tabFormStatus || {};
    }

    // Query tabs
    const queryOptions = {};
    if (!allWindows && windowId) {
      queryOptions.windowId = windowId;
    } else if (!allWindows) {
      queryOptions.currentWindow = true;
    }

    const tabs = await chrome.tabs.query(queryOptions);

    // Initialize report
    const report = createEmptyReport();
    report.total = tabs.length;

    // Analyze each tab
    for (const tab of tabs) {
      const reason = getExclusionReason(tab, settings, { formStatus });

      if (reason) {
        // Tab is excluded
        report.excluded++;
        report.byReason[reason].count++;
        report.byReason[reason].tabs.push({
          id: tab.id,
          title: tab.title || 'Untitled',
          url: tab.url || '',
          favIconUrl: tab.favIconUrl || ''
        });
      } else {
        // Tab can be suspended
        report.suspendable++;
        report.suspendableTabs.push({
          id: tab.id,
          title: tab.title || 'Untitled',
          url: tab.url || '',
          favIconUrl: tab.favIconUrl || ''
        });
      }
    }

    return report;

  } catch (error) {
    console.error('[ExclusionAnalyzer] Analysis failed:', error);
    return createEmptyReport();
  }
}

/**
 * Create an empty exclusion report
 * @returns {ExclusionReport}
 */
function createEmptyReport() {
  return {
    total: 0,
    suspendable: 0,
    excluded: 0,
    suspendableTabs: [],
    byReason: {
      whitelist: { count: 0, tabs: [] },
      pinned: { count: 0, tabs: [] },
      audio: { count: 0, tabs: [] },
      forms: { count: 0, tabs: [] },
      active: { count: 0, tabs: [] },
      alreadySuspended: { count: 0, tabs: [] },
      systemPages: { count: 0, tabs: [] }
    }
  };
}

/**
 * Get a summary string for the exclusion report
 *
 * @param {ExclusionReport} report - The exclusion report
 * @returns {string} - Human readable summary
 */
export function getReportSummary(report) {
  if (report.suspendable === 0 && report.excluded === 0) {
    return 'No tabs to analyze';
  }

  const parts = [];

  if (report.suspendable > 0) {
    parts.push(`${report.suspendable} ${report.suspendable === 1 ? 'tab' : 'tabs'} suspended`);
  }

  if (report.excluded > 0) {
    parts.push(`${report.excluded} excluded`);
  }

  return parts.join(' · ');
}

/**
 * Get non-empty exclusion reasons sorted by count (descending)
 *
 * @param {ExclusionReport} report - The exclusion report
 * @returns {Array<{key: string, reason: Object, count: number, tabs: Array}>}
 */
export function getNonEmptyReasons(report) {
  return Object.entries(report.byReason)
    .filter(([_, data]) => data.count > 0)
    .map(([key, data]) => ({
      key,
      reason: EXCLUSION_REASONS[key],
      count: data.count,
      tabs: data.tabs
    }))
    .sort((a, b) => {
      // Sort by priority first, then by count
      const priorityDiff = a.reason.priority - b.reason.priority;
      if (priorityDiff !== 0) return priorityDiff;
      return b.count - a.count;
    });
}

/**
 * Store the last suspend action result
 *
 * @param {ExclusionReport} report - The exclusion report
 * @param {number} actualSuspended - Actual number of tabs suspended
 * @returns {Promise<void>}
 */
export async function storeLastSuspendAction(report, actualSuspended) {
  try {
    const action = {
      timestamp: Date.now(),
      totalTabs: report.total,
      suspendedCount: actualSuspended,
      excludedReasons: {
        whitelist: report.byReason.whitelist.count,
        pinned: report.byReason.pinned.count,
        audio: report.byReason.audio.count,
        forms: report.byReason.forms.count,
        active: report.byReason.active.count,
        alreadySuspended: report.byReason.alreadySuspended.count,
        systemPages: report.byReason.systemPages.count
      },
      excludedTabs: []
    };

    // Collect first 10 excluded tabs for details
    let count = 0;
    const maxTabs = 10;

    for (const [reason, data] of Object.entries(report.byReason)) {
      for (const tab of data.tabs) {
        if (count >= maxTabs) break;
        action.excludedTabs.push({
          id: tab.id,
          title: tab.title,
          reason
        });
        count++;
      }
      if (count >= maxTabs) break;
    }

    await chrome.storage.local.set({ last_suspend_action: action });
    console.log('[ExclusionAnalyzer] Stored last suspend action:', action);

  } catch (error) {
    console.error('[ExclusionAnalyzer] Failed to store action:', error);
  }
}

export default {
  EXCLUSION_REASONS,
  getExclusionReason,
  analyzeExclusions,
  getReportSummary,
  getNonEmptyReasons,
  storeLastSuspendAction
};
