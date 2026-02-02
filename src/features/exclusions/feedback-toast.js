/**
 * Feedback Toast Component for Tab Suspender Pro
 *
 * Shows a toast notification at the bottom of the popup with
 * feedback about suspension results, including exclusion details.
 *
 * Features:
 * - Main message: "Suspended X tabs - Y excluded"
 * - Expandable details showing breakdown by reason
 * - Auto-dismisses after 5 seconds (unless details expanded)
 * - Close button
 * - Keyboard accessible
 *
 * @module feedback-toast
 */

import { FEATURES } from '../../utils/feature-flags.js';
import { EXCLUSION_REASONS, getNonEmptyReasons } from './exclusion-analyzer.js';

/**
 * Toast configuration
 */
const TOAST_CONFIG = {
  autoHideDelay: 5000, // 5 seconds
  animationDuration: 300, // ms
  maxVisibleReasons: 5
};

/**
 * Toast state
 */
let toastState = {
  isVisible: false,
  isExpanded: false,
  autoHideTimer: null,
  container: null
};

/**
 * Create the toast container element
 * @returns {HTMLElement}
 */
function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'exclusion-toast';
  container.className = 'exclusion-toast';
  container.setAttribute('role', 'alert');
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-atomic', 'true');
  container.innerHTML = `
    <div class="toast-content">
      <div class="toast-header">
        <span class="toast-message" id="exclusion-message"></span>
        <button class="toast-close" id="exclusion-toast-close" aria-label="Close notification" tabindex="0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="toast-details-container">
        <button class="toast-details-btn" id="exclusion-details-toggle" aria-expanded="false" tabindex="0">
          <span class="details-btn-text">Show details</span>
          <svg class="details-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <div class="toast-details hidden" id="exclusion-details" aria-hidden="true">
          <div class="exclusion-reasons-list" id="exclusion-reasons-list"></div>
        </div>
      </div>
    </div>
  `;

  return container;
}

/**
 * Get or create the toast container
 * @returns {HTMLElement}
 */
function getToastContainer() {
  if (toastState.container && document.body.contains(toastState.container)) {
    return toastState.container;
  }

  // Check if container already exists in DOM
  let container = document.getElementById('exclusion-toast');
  if (!container) {
    container = createToastContainer();
    document.body.appendChild(container);
  }

  toastState.container = container;
  attachEventListeners(container);

  return container;
}

/**
 * Attach event listeners to toast elements
 * @param {HTMLElement} container
 */
function attachEventListeners(container) {
  // Close button
  const closeBtn = container.querySelector('#exclusion-toast-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', hideToast);
    closeBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        hideToast();
      }
    });
  }

  // Details toggle button
  const toggleBtn = container.querySelector('#exclusion-details-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleDetails);
    toggleBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleDetails();
      }
    });
  }

  // Keyboard navigation
  container.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideToast();
    }
  });
}

/**
 * Toggle the details section
 */
function toggleDetails() {
  const container = getToastContainer();
  const details = container.querySelector('#exclusion-details');
  const toggleBtn = container.querySelector('#exclusion-details-toggle');
  const btnText = toggleBtn.querySelector('.details-btn-text');

  toastState.isExpanded = !toastState.isExpanded;

  if (toastState.isExpanded) {
    details.classList.remove('hidden');
    details.setAttribute('aria-hidden', 'false');
    toggleBtn.setAttribute('aria-expanded', 'true');
    btnText.textContent = 'Hide details';
    container.classList.add('expanded');

    // Cancel auto-hide when expanded
    cancelAutoHide();
  } else {
    details.classList.add('hidden');
    details.setAttribute('aria-hidden', 'true');
    toggleBtn.setAttribute('aria-expanded', 'false');
    btnText.textContent = 'Show details';
    container.classList.remove('expanded');

    // Restart auto-hide when collapsed
    startAutoHide();
  }
}

/**
 * Render the exclusion reasons list
 * @param {Array} reasons - Non-empty reasons from getNonEmptyReasons()
 */
function renderReasonsList(reasons) {
  const container = getToastContainer();
  const list = container.querySelector('#exclusion-reasons-list');

  if (!list) return;

  list.innerHTML = reasons
    .slice(0, TOAST_CONFIG.maxVisibleReasons)
    .map(({ key, reason, count, tabs }) => {
      const tabTitles = tabs
        .slice(0, 3)
        .map(t => escapeHtml(truncate(t.title, 30)))
        .join(', ');

      const moreCount = tabs.length > 3 ? tabs.length - 3 : 0;
      const moreText = moreCount > 0 ? ` +${moreCount} more` : '';

      return `
        <div class="exclusion-reason" data-reason="${key}">
          <span class="reason-icon" aria-hidden="true">${reason.icon}</span>
          <span class="reason-label">${reason.label}</span>
          <span class="reason-count">${count}</span>
          <div class="reason-tabs" title="${escapeHtml(tabs.map(t => t.title).join(', '))}">
            ${tabTitles}${moreText}
          </div>
        </div>
      `;
    })
    .join('');
}

/**
 * Start the auto-hide timer
 */
function startAutoHide() {
  cancelAutoHide();

  if (!toastState.isExpanded) {
    toastState.autoHideTimer = setTimeout(() => {
      hideToast();
    }, TOAST_CONFIG.autoHideDelay);
  }
}

/**
 * Cancel the auto-hide timer
 */
function cancelAutoHide() {
  if (toastState.autoHideTimer) {
    clearTimeout(toastState.autoHideTimer);
    toastState.autoHideTimer = null;
  }
}

/**
 * Show the feedback toast with exclusion report
 *
 * @param {Object} report - Exclusion report from analyzeExclusions()
 * @param {number} actualSuspended - Actual number of tabs suspended
 */
export function showToast(report, actualSuspended) {
  // Feature flag check
  if (!FEATURES.EXCLUSION_FEEDBACK) {
    return;
  }

  try {
    const container = getToastContainer();
    const messageEl = container.querySelector('#exclusion-message');
    const detailsContainer = container.querySelector('.toast-details-container');

    // Build message
    const suspendedText = actualSuspended === 1
      ? '1 tab suspended'
      : `${actualSuspended} tabs suspended`;

    const excludedCount = report.excluded;
    const excludedText = excludedCount > 0
      ? ` · ${excludedCount} excluded`
      : '';

    messageEl.textContent = suspendedText + excludedText;

    // Show/hide details button based on exclusions
    const nonEmptyReasons = getNonEmptyReasons(report);
    const hasExclusions = nonEmptyReasons.length > 0;

    if (hasExclusions) {
      detailsContainer.style.display = 'block';
      renderReasonsList(nonEmptyReasons);
    } else {
      detailsContainer.style.display = 'none';
    }

    // Reset expanded state
    toastState.isExpanded = false;
    const details = container.querySelector('#exclusion-details');
    const toggleBtn = container.querySelector('#exclusion-details-toggle');
    const btnText = toggleBtn?.querySelector('.details-btn-text');

    if (details) {
      details.classList.add('hidden');
      details.setAttribute('aria-hidden', 'true');
    }
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
    if (btnText) {
      btnText.textContent = 'Show details';
    }
    container.classList.remove('expanded');

    // Show the toast with animation
    toastState.isVisible = true;
    container.classList.remove('fadeout');
    container.classList.add('visible');

    // Start auto-hide timer
    startAutoHide();

    // Focus the close button for accessibility
    const closeBtn = container.querySelector('#exclusion-toast-close');
    if (closeBtn) {
      closeBtn.focus();
    }

    console.log('[FeedbackToast] Shown:', { actualSuspended, excluded: excludedCount });

  } catch (error) {
    console.error('[FeedbackToast] Failed to show toast:', error);
  }
}

/**
 * Hide the feedback toast
 */
export function hideToast() {
  cancelAutoHide();

  const container = toastState.container || document.getElementById('exclusion-toast');
  if (!container) return;

  container.classList.add('fadeout');
  container.classList.remove('visible');

  toastState.isVisible = false;
  toastState.isExpanded = false;

  console.log('[FeedbackToast] Hidden');
}

/**
 * Check if the toast is currently visible
 * @returns {boolean}
 */
export function isToastVisible() {
  return toastState.isVisible;
}

/**
 * Utility: Escape HTML to prevent XSS
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Utility: Truncate text with ellipsis
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
function truncate(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Initialize the toast component
 * Call this on popup load to ensure the container exists
 */
export function initToast() {
  if (!FEATURES.EXCLUSION_FEEDBACK) {
    return;
  }

  getToastContainer();
  console.log('[FeedbackToast] Initialized');
}

/**
 * Cleanup the toast component
 */
export function destroyToast() {
  cancelAutoHide();

  if (toastState.container && document.body.contains(toastState.container)) {
    document.body.removeChild(toastState.container);
  }

  toastState = {
    isVisible: false,
    isExpanded: false,
    autoHideTimer: null,
    container: null
  };
}

export default {
  showToast,
  hideToast,
  isToastVisible,
  initToast,
  destroyToast
};
