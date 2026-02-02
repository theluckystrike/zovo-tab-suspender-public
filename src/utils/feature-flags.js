/**
 * Feature Flags for Tab Suspender Pro
 *
 * Allows enabling/disabling features without code changes.
 * Use feature flags to safely roll out new features and provide
 * quick rollback capability if issues are discovered.
 *
 * @example
 * import { FEATURES, isFeatureEnabled } from './feature-flags.js';
 *
 * if (FEATURES.COUNTDOWN_INDICATOR) {
 *   // Countdown indicator code
 * }
 *
 * // Or use the async version for storage-based flags
 * if (await isFeatureEnabled('COUNTDOWN_INDICATOR')) {
 *   // Feature code
 * }
 */

/**
 * Feature flag definitions
 *
 * Set to `true` to enable, `false` to disable.
 * These are compile-time defaults that can be overridden via storage.
 */
export const FEATURES = {
  /**
   * Task 1: Per-tab countdown indicator
   * Shows "suspends in X:XX" for each tab
   */
  COUNTDOWN_INDICATOR: true,

  /**
   * Task 2: Dashboard statistics sync
   * Real-time sync between popup and dashboard stats
   */
  DASHBOARD_SYNC: true,

  /**
   * Task 3: Exclusion feedback on Suspend All
   * Shows toast with breakdown of excluded tabs
   */
  EXCLUSION_FEEDBACK: true,

  /**
   * Debug mode - enables verbose logging
   */
  DEBUG_MODE: false,

  /**
   * Analytics tracking (if implemented)
   */
  ANALYTICS: false
};

/**
 * Storage key for feature flag overrides
 */
const FEATURE_FLAGS_STORAGE_KEY = 'feature_flags_override';

/**
 * Check if a feature is enabled (with storage override support)
 *
 * Priority: storage override > default value
 *
 * @param {string} featureName - Name of the feature flag
 * @returns {Promise<boolean>} Whether the feature is enabled
 */
export async function isFeatureEnabled(featureName) {
  // Check if feature exists
  if (!(featureName in FEATURES)) {
    console.warn(`[FeatureFlags] Unknown feature: ${featureName}`);
    return false;
  }

  try {
    // Check for storage override
    const result = await chrome.storage.local.get(FEATURE_FLAGS_STORAGE_KEY);
    const overrides = result[FEATURE_FLAGS_STORAGE_KEY] || {};

    if (featureName in overrides) {
      return overrides[featureName];
    }
  } catch (error) {
    // Storage not available (e.g., in tests), use default
  }

  // Return default value
  return FEATURES[featureName];
}

/**
 * Check if a feature is enabled (synchronous version)
 * Uses only the default values, no storage check.
 *
 * @param {string} featureName - Name of the feature flag
 * @returns {boolean} Whether the feature is enabled
 */
export function isFeatureEnabledSync(featureName) {
  return FEATURES[featureName] ?? false;
}

/**
 * Override a feature flag (persisted to storage)
 *
 * @param {string} featureName - Name of the feature flag
 * @param {boolean} enabled - Whether to enable the feature
 * @returns {Promise<void>}
 */
export async function setFeatureEnabled(featureName, enabled) {
  if (!(featureName in FEATURES)) {
    console.warn(`[FeatureFlags] Unknown feature: ${featureName}`);
    return;
  }

  try {
    const result = await chrome.storage.local.get(FEATURE_FLAGS_STORAGE_KEY);
    const overrides = result[FEATURE_FLAGS_STORAGE_KEY] || {};

    overrides[featureName] = enabled;

    await chrome.storage.local.set({ [FEATURE_FLAGS_STORAGE_KEY]: overrides });

    console.log(`[FeatureFlags] ${featureName} set to ${enabled}`);
  } catch (error) {
    console.error('[FeatureFlags] Failed to save override:', error);
  }
}

/**
 * Clear all feature flag overrides (reset to defaults)
 *
 * @returns {Promise<void>}
 */
export async function resetFeatureFlags() {
  try {
    await chrome.storage.local.remove(FEATURE_FLAGS_STORAGE_KEY);
    console.log('[FeatureFlags] All overrides cleared');
  } catch (error) {
    console.error('[FeatureFlags] Failed to reset:', error);
  }
}

/**
 * Get all feature flags with their current effective values
 *
 * @returns {Promise<object>} Object with feature names and boolean values
 */
export async function getAllFeatureFlags() {
  const flags = { ...FEATURES };

  try {
    const result = await chrome.storage.local.get(FEATURE_FLAGS_STORAGE_KEY);
    const overrides = result[FEATURE_FLAGS_STORAGE_KEY] || {};

    // Apply overrides
    Object.entries(overrides).forEach(([key, value]) => {
      if (key in flags) {
        flags[key] = value;
      }
    });
  } catch (error) {
    // Return defaults on error
  }

  return flags;
}

/**
 * Feature guard decorator for functions
 *
 * @param {string} featureName - Feature flag to check
 * @param {Function} fn - Function to wrap
 * @param {*} fallback - Return value if feature disabled (default: undefined)
 * @returns {Function} Wrapped function that checks feature flag
 *
 * @example
 * const showCountdown = withFeatureFlag('COUNTDOWN_INDICATOR', (tabId) => {
 *   // Show countdown for tab
 * });
 */
export function withFeatureFlag(featureName, fn, fallback = undefined) {
  return async function (...args) {
    if (await isFeatureEnabled(featureName)) {
      return fn.apply(this, args);
    }
    return fallback;
  };
}

/**
 * Synchronous feature guard decorator
 *
 * @param {string} featureName - Feature flag to check
 * @param {Function} fn - Function to wrap
 * @param {*} fallback - Return value if feature disabled
 * @returns {Function} Wrapped function
 */
export function withFeatureFlagSync(featureName, fn, fallback = undefined) {
  return function (...args) {
    if (isFeatureEnabledSync(featureName)) {
      return fn.apply(this, args);
    }
    return fallback;
  };
}

/**
 * Log current feature flag state (for debugging)
 */
export async function logFeatureFlags() {
  const flags = await getAllFeatureFlags();
  console.log('[FeatureFlags] Current state:');
  Object.entries(flags).forEach(([name, enabled]) => {
    console.log(`  ${name}: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  });
}

/**
 * Feature flag listener - calls callback when flags change
 *
 * @param {Function} callback - Called with updated flags object
 * @returns {Function} Cleanup function to remove listener
 */
export function onFeatureFlagsChange(callback) {
  const listener = (changes, area) => {
    if (area === 'local' && changes[FEATURE_FLAGS_STORAGE_KEY]) {
      getAllFeatureFlags().then(callback);
    }
  };

  chrome.storage.onChanged.addListener(listener);

  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

// Export default for convenience
export default FEATURES;
