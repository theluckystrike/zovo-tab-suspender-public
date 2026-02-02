/**
 * Enhanced Suspend All for Tab Suspender Pro
 *
 * Wraps the existing suspension logic with exclusion analysis
 * and feedback toast display.
 *
 * @module suspend-all-enhanced
 */

import { FEATURES } from '../../utils/feature-flags.js';
import {
  analyzeExclusions,
  storeLastSuspendAction
} from './exclusion-analyzer.js';
import { showToast, initToast } from './feedback-toast.js';

/**
 * Check if a URL is an internal/system page
 * @param {string} url
 * @returns {boolean}
 */
function isInternalUrl(url) {
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

/**
 * Suspend a single tab directly
 * @param {number} tabId
 * @param {string} url
 * @param {string} title
 * @param {string} favicon
 * @returns {Promise<boolean>}
 */
async function suspendTabDirect(tabId, url, title, favicon) {
  try {
    if (isInternalUrl(url) || url.includes('suspended.html')) {
      return false;
    }

    const params = new URLSearchParams({
      url: url,
      title: title || 'Suspended Tab',
      favicon: encodeURIComponent(favicon || ''),
      time: Date.now().toString()
    });

    const suspendedUrl = chrome.runtime.getURL(`suspended.html?${params.toString()}`);
    await chrome.tabs.update(tabId, { url: suspendedUrl });

    return true;
  } catch (error) {
    console.error('[SuspendAllEnhanced] Failed to suspend tab:', error);
    return false;
  }
}

/**
 * Enhanced Suspend All with exclusion feedback
 *
 * This function:
 * 1. Analyzes all tabs for exclusions first
 * 2. Suspends only the suspendable tabs
 * 3. Shows a feedback toast with results
 * 4. Stores the action for later retrieval
 *
 * @param {Object} options - Options
 * @param {number} [options.windowId] - Specific window to suspend (default: current window)
 * @param {boolean} [options.allWindows=false] - Suspend all windows
 * @param {Function} [options.onComplete] - Callback when complete (receives actual suspended count)
 * @returns {Promise<{success: boolean, count: number, report: Object}>}
 */
export async function suspendAllEnhanced(options = {}) {
  const { onComplete } = options;

  // Initialize toast (ensures container exists)
  initToast();

  try {
    // Step 1: Analyze exclusions first
    console.log('[SuspendAllEnhanced] Analyzing exclusions...');
    const report = await analyzeExclusions(options);

    console.log('[SuspendAllEnhanced] Analysis complete:', {
      total: report.total,
      suspendable: report.suspendable,
      excluded: report.excluded
    });

    // Step 2: Suspend all suspendable tabs
    let actualSuspended = 0;

    if (report.suspendableTabs.length > 0) {
      for (const tab of report.suspendableTabs) {
        try {
          // Get full tab info for suspension
          const fullTab = await chrome.tabs.get(tab.id);
          const success = await suspendTabDirect(
            fullTab.id,
            fullTab.url,
            fullTab.title,
            fullTab.favIconUrl
          );
          if (success) {
            actualSuspended++;
          }
        } catch (error) {
          // Tab may have been closed or become unavailable
          console.warn('[SuspendAllEnhanced] Failed to suspend tab:', tab.id, error.message);
        }
      }
    }

    console.log('[SuspendAllEnhanced] Suspended:', actualSuspended, 'tabs');

    // Step 3: Show feedback toast (only if feature flag enabled)
    if (FEATURES.EXCLUSION_FEEDBACK) {
      showToast(report, actualSuspended);
    }

    // Step 4: Store the action for later retrieval
    await storeLastSuspendAction(report, actualSuspended);

    // Call completion callback if provided
    if (typeof onComplete === 'function') {
      onComplete(actualSuspended);
    }

    return {
      success: true,
      count: actualSuspended,
      report
    };

  } catch (error) {
    console.error('[SuspendAllEnhanced] Operation failed:', error);

    // Fall back to basic suspension without feedback
    return await fallbackSuspendAll(options);
  }
}

/**
 * Fallback suspend all without enhanced feedback
 * Used when the enhanced version fails
 *
 * @param {Object} options
 * @returns {Promise<{success: boolean, count: number}>}
 */
async function fallbackSuspendAll(options = {}) {
  const { windowId, allWindows = false, onComplete } = options;

  try {
    const queryOptions = {};
    if (!allWindows && windowId) {
      queryOptions.windowId = windowId;
    } else if (!allWindows) {
      queryOptions.currentWindow = true;
    }
    queryOptions.active = false; // Only inactive tabs

    const tabs = await chrome.tabs.query(queryOptions);
    let count = 0;

    for (const tab of tabs) {
      if (tab.url && !isInternalUrl(tab.url) && !tab.url.includes('suspended.html')) {
        const success = await suspendTabDirect(
          tab.id,
          tab.url,
          tab.title,
          tab.favIconUrl
        );
        if (success) count++;
      }
    }

    if (typeof onComplete === 'function') {
      onComplete(count);
    }

    return { success: true, count };

  } catch (error) {
    console.error('[SuspendAllEnhanced] Fallback also failed:', error);
    return { success: false, count: 0 };
  }
}

/**
 * Get the last suspend action result
 * @returns {Promise<Object|null>}
 */
export async function getLastSuspendAction() {
  try {
    const result = await chrome.storage.local.get('last_suspend_action');
    return result.last_suspend_action || null;
  } catch {
    return null;
  }
}

/**
 * Create a wrapped version of the existing handleSuspendAll function
 * that integrates with the exclusion feedback system
 *
 * @param {Object} uiElements - UI elements to update
 * @param {HTMLElement} uiElements.suspendAllBtn - The suspend all button
 * @param {Function} uiElements.loadStats - Function to reload stats
 * @param {Function} uiElements.loadTabs - Function to reload tabs
 * @returns {Function} - Wrapped handler function
 */
export function createEnhancedSuspendAllHandler(uiElements) {
  const { suspendAllBtn, loadStats, loadTabs } = uiElements;

  return async function handleSuspendAllEnhanced() {
    // Disable button and show loading state
    if (suspendAllBtn) {
      suspendAllBtn.disabled = true;
      suspendAllBtn.textContent = 'Suspending...';
    }

    try {
      // Use enhanced suspend all
      await suspendAllEnhanced({
        onComplete: () => {
          // Reload UI after suspension
          setTimeout(() => {
            if (typeof loadStats === 'function') loadStats();
            if (typeof loadTabs === 'function') loadTabs();
          }, 500);
        }
      });

    } catch (error) {
      console.error('[SuspendAllEnhanced] Handler error:', error);
    } finally {
      // Re-enable button
      if (suspendAllBtn) {
        suspendAllBtn.disabled = false;
        suspendAllBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="6" y="4" width="4" height="16"></rect>
            <rect x="14" y="4" width="4" height="16"></rect>
          </svg>
          Suspend All
        `;
      }
    }
  };
}

export default {
  suspendAllEnhanced,
  getLastSuspendAction,
  createEnhancedSuspendAllHandler
};
