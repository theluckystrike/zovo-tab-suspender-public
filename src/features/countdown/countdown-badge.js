/**
 * Countdown Badge Module for Countdown Indicator
 *
 * Provides formatting utilities and render functions for displaying
 * countdown timers in the popup UI. Handles warning states for
 * tabs approaching suspension.
 *
 * @module countdown-badge
 */

import { FEATURES } from '../../utils/feature-flags.js';

/**
 * Warning threshold in milliseconds (30 seconds)
 */
const WARNING_THRESHOLD_MS = 30 * 1000;

/**
 * Critical threshold in milliseconds (10 seconds)
 */
const CRITICAL_THRESHOLD_MS = 10 * 1000;

/**
 * Format remaining time as human-readable string
 *
 * @param {number} remainingMs - Remaining time in milliseconds
 * @returns {string} Formatted time (e.g., "5:23", "45s", "Paused")
 */
export function formatCountdown(remainingMs) {
  if (remainingMs < 0 || remainingMs === null || remainingMs === undefined) {
    return 'Paused';
  }

  if (remainingMs === 0) {
    return 'Now';
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);

  // Less than 60 seconds - show seconds only
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  // 60 seconds or more - show MM:SS format
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Get the warning state based on remaining time
 *
 * @param {number} remainingMs - Remaining time in milliseconds
 * @returns {string} State: 'normal', 'warning', 'critical', or 'paused'
 */
export function getCountdownState(remainingMs) {
  if (remainingMs < 0 || remainingMs === null || remainingMs === undefined) {
    return 'paused';
  }

  if (remainingMs <= CRITICAL_THRESHOLD_MS) {
    return 'critical';
  }

  if (remainingMs <= WARNING_THRESHOLD_MS) {
    return 'warning';
  }

  return 'normal';
}

/**
 * Create countdown indicator HTML element
 *
 * @param {object} countdown - Countdown data object
 * @param {number} countdown.tabId - Tab ID
 * @param {number} countdown.remainingMs - Remaining time in milliseconds
 * @param {boolean} countdown.isPaused - Whether countdown is paused
 * @returns {HTMLElement} The countdown indicator element
 */
export function createCountdownElement(countdown) {
  if (!FEATURES.COUNTDOWN_INDICATOR) {
    return null;
  }

  const { remainingMs, isPaused } = countdown;

  const container = document.createElement('div');
  container.className = 'countdown-indicator';

  const state = isPaused ? 'paused' : getCountdownState(remainingMs);
  container.classList.add(state);

  const label = document.createElement('span');
  label.className = 'countdown-label';
  label.textContent = isPaused ? 'Timer:' : 'Suspends in:';

  const time = document.createElement('span');
  time.className = 'countdown-time';
  time.textContent = formatCountdown(isPaused ? -1 : remainingMs);

  container.appendChild(label);
  container.appendChild(time);

  return container;
}

/**
 * Update an existing countdown element with new time
 *
 * @param {HTMLElement} element - The countdown container element
 * @param {number} remainingMs - New remaining time in milliseconds
 * @param {boolean} isPaused - Whether countdown is paused
 */
export function updateCountdownElement(element, remainingMs, isPaused = false) {
  if (!element) return;

  const timeSpan = element.querySelector('.countdown-time');
  const labelSpan = element.querySelector('.countdown-label');

  if (timeSpan) {
    timeSpan.textContent = formatCountdown(isPaused ? -1 : remainingMs);
  }

  if (labelSpan) {
    labelSpan.textContent = isPaused ? 'Timer:' : 'Suspends in:';
  }

  // Update state classes
  element.classList.remove('normal', 'warning', 'critical', 'paused');
  const state = isPaused ? 'paused' : getCountdownState(remainingMs);
  element.classList.add(state);
}

/**
 * Render the main countdown container for the current tab
 *
 * @param {HTMLElement} targetContainer - Container to render into
 * @param {object} countdown - Countdown data
 * @returns {HTMLElement|null} The rendered element or null
 */
export function renderCountdownContainer(targetContainer, countdown) {
  if (!FEATURES.COUNTDOWN_INDICATOR || !targetContainer) {
    return null;
  }

  // Clear existing content
  targetContainer.innerHTML = '';

  if (!countdown || countdown.remainingMs < 0) {
    // No active countdown - show paused state
    const indicator = createCountdownElement({ remainingMs: -1, isPaused: true });
    if (indicator) {
      targetContainer.appendChild(indicator);
    }
    return indicator;
  }

  const indicator = createCountdownElement(countdown);
  if (indicator) {
    targetContainer.appendChild(indicator);
  }

  return indicator;
}

/**
 * Create a countdown badge for inline display (e.g., in tab list)
 *
 * @param {number} remainingMs - Remaining time in milliseconds
 * @param {boolean} isPaused - Whether countdown is paused
 * @returns {HTMLElement} The badge element
 */
export function createCountdownBadge(remainingMs, isPaused = false) {
  if (!FEATURES.COUNTDOWN_INDICATOR) {
    return null;
  }

  const badge = document.createElement('span');
  badge.className = 'countdown-badge';

  const state = isPaused ? 'paused' : getCountdownState(remainingMs);
  badge.classList.add(state);

  badge.textContent = formatCountdown(isPaused ? -1 : remainingMs);

  return badge;
}

/**
 * CountdownManager class - manages countdown display and updates
 */
export class CountdownManager {
  constructor() {
    this.container = null;
    this.updateInterval = null;
    this.currentCountdown = null;
  }

  /**
   * Initialize the countdown manager with a container element
   *
   * @param {HTMLElement} container - The container element
   */
  init(container) {
    if (!FEATURES.COUNTDOWN_INDICATOR) return;

    this.container = container;
  }

  /**
   * Start updating the countdown display
   *
   * @param {Function} fetchCountdown - Async function to fetch countdown data
   * @param {number} intervalMs - Update interval in milliseconds (default: 1000)
   */
  startUpdates(fetchCountdown, intervalMs = 1000) {
    if (!FEATURES.COUNTDOWN_INDICATOR) return;

    this.stopUpdates();

    const update = async () => {
      try {
        const countdown = await fetchCountdown();
        this.currentCountdown = countdown;
        this.render(countdown);
      } catch (error) {
        console.error('[CountdownManager] Update error:', error);
      }
    };

    // Initial update
    update();

    // Set up interval
    this.updateInterval = setInterval(update, intervalMs);
  }

  /**
   * Stop updating the countdown display
   */
  stopUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Render countdown to the container
   *
   * @param {object} countdown - Countdown data
   */
  render(countdown) {
    if (!this.container) return;

    renderCountdownContainer(this.container, countdown);
  }

  /**
   * Destroy the manager and clean up
   */
  destroy() {
    this.stopUpdates();
    this.container = null;
    this.currentCountdown = null;
  }
}

// Create singleton instance
const countdownManager = new CountdownManager();

// Export utilities and manager
export { countdownManager };
export default countdownManager;
