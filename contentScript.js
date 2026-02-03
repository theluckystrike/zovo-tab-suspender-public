/**
 * Tab Suspender Pro - Content Script
 *
 * Runs on web pages to detect activity and capture state
 */

(function () {
    // Global flag to track if extension context is still valid
    // Once set to false, all chrome API calls will be skipped
    let contextValid = true;

    // Reference to the MutationObserver for cleanup
    let observer = null;

    // Helper function to check if extension context is still valid
    function isContextValid() {
        if (!contextValid) {
            return false;
        }
        try {
            const valid = chrome.runtime?.id !== undefined;
            if (!valid) {
                contextValid = false;
            }
            return valid;
        } catch (e) {
            // Any error checking context means context is invalid
            contextValid = false;
            return false;
        }
    }

    // Mark context as invalid and clean up resources
    function invalidateContext() {
        if (!contextValid) return; // Already invalidated
        contextValid = false;
        // Disconnect observer if it exists
        if (observer) {
            try {
                observer.disconnect();
            } catch (e) {
                // Silently ignore - observer may already be disconnected
            }
            observer = null;
        }
    }

    // Safe wrapper for chrome.runtime.sendMessage that handles context invalidation
    async function safeSendMessage(message) {
        if (!contextValid) {
            return undefined;
        }
        if (!isContextValid()) {
            return undefined;
        }
        try {
            return await chrome.runtime.sendMessage(message);
        } catch (e) {
            // Context invalidated - extension was reloaded/updated
            // This is expected behavior, so we silently invalidate and return
            if (e.message?.includes('Extension context invalidated') ||
                e.message?.includes('message port closed') ||
                e.message?.includes('Receiving end does not exist')) {
                invalidateContext();
                return undefined;
            }
            // For any other unexpected error, also invalidate to be safe
            invalidateContext();
            return undefined;
        }
    }

    // Track user activity
    let lastActivity = Date.now();
    let hasUnsavedForms = false;

    // Activity events to track (removed mousemove - too noisy, fires 30-60x/second)
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];

    // Debounce settings - only notify background once per 30 seconds
    const ACTIVITY_DEBOUNCE_MS = 30000;
    let lastActivityNotification = 0;

    // Update activity timestamp (debounced to prevent message flooding)
    function updateActivity() {
        // Skip if context is invalid
        if (!contextValid) return;

        lastActivity = Date.now();

        // Only send message if 30+ seconds since last notification
        if (lastActivity - lastActivityNotification >= ACTIVITY_DEBOUNCE_MS) {
            lastActivityNotification = lastActivity;
            safeSendMessage({
                type: 'TAB_ACTIVITY',
                timestamp: lastActivity
            });
        }
    }

    // Check for unsaved form data
    function checkFormChanges() {
        // Skip if context is invalid
        if (!contextValid) return;

        // NOTE: contenteditable elements (Gmail, Notion) are intentionally excluded
        // They caused too many false positives (any pre-existing content = "unsaved")
        const inputs = document.querySelectorAll('input, textarea, select');
        let changed = false;

        inputs.forEach(input => {
            // Skip password, file, hidden, and disabled inputs
            if (input.type === 'password' || input.type === 'file' ||
                input.type === 'hidden' || input.disabled) return;

            if (input.type === 'checkbox' || input.type === 'radio') {
                if (input.checked !== input.defaultChecked) changed = true;
            } else {
                if (input.value !== input.defaultValue) changed = true;
            }
        });

        if (changed !== hasUnsavedForms) {
            hasUnsavedForms = changed;
            safeSendMessage({
                type: 'FORM_STATUS',
                hasUnsavedForms: changed
            });
        }
    }

    // Get current scroll position
    function getScrollPosition() {
        return {
            x: window.scrollX,
            y: window.scrollY
        };
    }

    // Get form data for preservation
    function getFormData() {
        const forms = {};
        const inputs = document.querySelectorAll('input, textarea, select');

        inputs.forEach((input, idx) => {
            if (input.type === 'password' || input.type === 'file') return;

            const id = input.id || input.name || `field_${idx}`;
            forms[id] = {
                value: input.value,
                type: input.type,
                checked: input.checked,
                tagName: input.tagName.toLowerCase()
            };
        });

        return forms;
    }

    // Restore form data
    function restoreFormData(formData) {
        Object.entries(formData).forEach(([id, data]) => {
            let el = document.getElementById(id);
            if (!el) el = document.querySelector(`[name="${id}"]`);
            if (!el && id.startsWith('field_')) {
                const idx = parseInt(id.replace('field_', ''));
                const inputs = document.querySelectorAll('input, textarea, select');
                el = inputs[idx];
            }

            if (el) {
                if (data.type === 'checkbox' || data.type === 'radio') {
                    el.checked = data.checked;
                } else {
                    el.value = data.value;
                }
            }
        });
    }

    // Restore scroll position
    function restoreScrollPosition(x, y) {
        window.scrollTo(x, y);
    }

    // Listen for messages from background - wrapped in try-catch for context invalidation
    try {
        if (contextValid && chrome.runtime?.onMessage) {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                // Skip processing if context has been invalidated
                if (!contextValid) {
                    return false;
                }

                try {
                    switch (message.type) {
                        case 'GET_TAB_STATE':
                            sendResponse({
                                scrollPosition: getScrollPosition(),
                                formData: getFormData(),
                                lastActivity: lastActivity,
                                hasUnsavedForms: hasUnsavedForms
                            });
                            break;

                        case 'RESTORE_STATE':
                            if (message.scrollPosition) {
                                restoreScrollPosition(message.scrollPosition.x, message.scrollPosition.y);
                            }
                            if (message.formData) {
                                restoreFormData(message.formData);
                            }
                            sendResponse({ success: true });
                            break;

                        case 'GET_ACTIVITY':
                            sendResponse({
                                lastActivity: lastActivity,
                                idleTime: Date.now() - lastActivity
                            });
                            break;
                    }
                } catch (e) {
                    // Silently handle any errors during message processing
                    invalidateContext();
                }
                return true;
            });
        }
    } catch (e) {
        // Context already invalid when trying to add listener - silently ignore
        invalidateContext();
    }

    // Set up activity listeners (only if context is valid)
    if (contextValid) {
        activityEvents.forEach(event => {
            document.addEventListener(event, updateActivity, { passive: true });
        });

        // Set up form change detection
        document.addEventListener('input', checkFormChanges, { passive: true });
        document.addEventListener('change', checkFormChanges, { passive: true });
    }

    // Detect SPA navigation (URL changes without page reload)
    let lastUrl = location.href;
    const detectSpaNavigation = () => {
        // Skip if context is invalid
        if (!contextValid) return;

        if (location.href !== lastUrl) {
            lastUrl = location.href;
            // Reset form status on SPA navigation
            hasUnsavedForms = false;
            safeSendMessage({
                type: 'FORM_STATUS',
                hasUnsavedForms: false
            });
            // Re-check forms after navigation (only if context still valid)
            setTimeout(() => {
                if (contextValid) checkFormChanges();
            }, 100);
        }
    };

    // Listen for popstate (back/forward navigation) - only if context valid
    if (contextValid) {
        window.addEventListener('popstate', detectSpaNavigation);
    }

    // Use MutationObserver to detect SPA navigation via history.pushState
    // Store in module-level variable for cleanup on context invalidation
    try {
        if (contextValid && document.body) {
            observer = new MutationObserver(() => {
                // Skip if context is invalid
                if (!contextValid) {
                    try {
                        observer.disconnect();
                    } catch (e) {
                        // Silently ignore
                    }
                    return;
                }
                detectSpaNavigation();
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    } catch (e) {
        // Silently handle any observer setup errors
        observer = null;
    }

    // Initial form check after page load (only if context valid)
    if (contextValid) {
        if (document.readyState === 'complete') {
            checkFormChanges();
        } else {
            window.addEventListener('load', () => {
                if (contextValid) checkFormChanges();
            });
        }
    }

    // Notify background that content script is ready
    safeSendMessage({ type: 'CONTENT_SCRIPT_READY' });
})();
