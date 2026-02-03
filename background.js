/**
 * Tab Suspender Pro - Background Service Worker
 * Simplified, bulletproof version
 */

console.log('[BG] Tab Suspender Pro: Background starting...');

// ============================================================================
// SERVICE WORKER CONTEXT VALIDATION
// ============================================================================

/**
 * Check if the extension context is still valid.
 * In Manifest V3, service workers can be terminated at any time.
 * This helper ensures we don't try to use chrome APIs when the context is invalid.
 * @returns {boolean} True if the extension context is valid
 */
function isExtensionContextValid() {
    try {
        // chrome.runtime.id is undefined when the context is invalidated
        return !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
        return false;
    }
}

/**
 * Safely execute a function that requires valid extension context.
 * If context is invalid, logs warning and returns default value.
 * @param {Function} fn - The async function to execute
 * @param {string} operationName - Name of the operation for logging
 * @param {*} defaultValue - Default value to return if context is invalid
 * @returns {Promise<*>} Result of fn or defaultValue
 */
async function safeExecute(fn, operationName, defaultValue = null) {
    if (!isExtensionContextValid()) {
        console.warn(`[BG][SW] Extension context invalid, skipping: ${operationName}`);
        return defaultValue;
    }
    try {
        return await fn();
    } catch (error) {
        // Check if error is due to context invalidation
        if (error.message && (error.message.includes('Extension context invalidated') ||
            error.message.includes('No SW') ||
            error.message.includes('context invalidated'))) {
            console.warn(`[BG][SW] Context invalidated during: ${operationName}`);
            return defaultValue;
        }
        throw error;
    }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG = {
    suspensionTimeout: 30,
    autoUnsuspendOnFocus: true,
    suspendPinnedTabs: false,
    whitelistedDomains: [],  // FIXED: Empty by default, user adds their own
    neverSuspendAudio: true,
    neverSuspendActiveTab: true,
    neverSuspendUnsavedForms: true,
    memoryThreshold: 80
};

let config = { ...DEFAULT_CONFIG };

// ============================================================================
// STATE
// ============================================================================

// Note: Using chrome.alarms API instead of setTimeout for MV3 service worker persistence
// Tab activity times are stored in chrome.storage.session for persistence across SW restarts
const ALARM_PREFIX = 'suspend-tab-';

// Track tabs with unsaved form data (persisted in storage for SW restarts)
// Key: tabId, Value: boolean

// ============================================================================
// INITIALIZATION
// ============================================================================

chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('[BG] Tab Suspender Pro installed:', details.reason);

    // Verify extension context is valid
    if (!isExtensionContextValid()) {
        console.warn('[BG][INSTALL] Extension context invalid');
        return;
    }

    try {
        // Clean up stale state from previous installs/updates
        if (details.reason === 'update' || details.reason === 'install') {
            console.log('[BG][INSTALL] Cleaning up stale state...');
            await cleanupOrphanedStorageData();
        }

        await loadSettings();
        createContextMenus();

        if (details.reason === 'install') {
            if (isExtensionContextValid()) {
                chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
                await chrome.storage.local.set({
                    memoryStats: { totalSaved: 0, tabsSuspended: 0, history: [] },
                    installDate: Date.now()
                });
            }
        }

        await startMonitoring();
    } catch (error) {
        // Check for context invalidation errors
        if (error.message && (error.message.includes('Extension context invalidated') ||
            error.message.includes('No SW'))) {
            console.warn('[BG][INSTALL] Context invalidated during installation');
            return;
        }
        console.error('[BG][INSTALL] Error during installation:', error);
    }
});

chrome.runtime.onStartup.addListener(async () => {
    console.log('[BG] Tab Suspender Pro starting up');

    // Verify extension context is valid before proceeding
    if (!isExtensionContextValid()) {
        console.warn('[BG][STARTUP] Extension context invalid at startup');
        return;
    }

    try {
        await loadSettings();
        await cleanupOrphanedStorageData(); // Clean up stale data from closed tabs
        await recreateAlarmsAfterWake(); // Ensure alarms are properly recreated after SW wake
        await startMonitoring();
        await updateBadge();
    } catch (error) {
        // Check for context invalidation errors
        if (error.message && (error.message.includes('Extension context invalidated') ||
            error.message.includes('No SW'))) {
            console.warn('[BG][STARTUP] Context invalidated during startup sequence');
            return;
        }
        console.error('[BG][STARTUP] Error during startup:', error);
    }
});

/**
 * Recreate alarms after service worker wakes up.
 * Service workers can be terminated and restarted, so we need to ensure
 * all tabs that should have timers get their alarms recreated.
 */
async function recreateAlarmsAfterWake() {
    if (!isExtensionContextValid()) {
        console.warn('[BG][ALARMS] Extension context invalid, skipping alarm recreation');
        return;
    }

    try {
        console.log('[BG][ALARMS] Checking and recreating alarms after service worker wake...');

        const existingAlarms = await chrome.alarms.getAll();
        const existingAlarmTabIds = new Set(
            existingAlarms
                .filter(a => a.name.startsWith(ALARM_PREFIX))
                .map(a => parseInt(a.name.replace(ALARM_PREFIX, ''), 10))
        );

        const tabs = await chrome.tabs.query({});
        let recreatedCount = 0;

        for (const tab of tabs) {
            if (!isExtensionContextValid()) {
                console.warn('[BG][ALARMS] Context invalidated during alarm recreation');
                return;
            }

            // Skip tabs that already have alarms, internal pages, or suspended pages
            if (existingAlarmTabIds.has(tab.id)) continue;
            if (isInternalPage(tab.url)) continue;
            if (isSuspendedPage(tab.url)) continue;
            if (tab.active) continue; // Active tabs don't need alarms

            // Recreate alarm for this tab
            await startTabTimer(tab.id);
            recreatedCount++;
        }

        console.log(`[BG][ALARMS] Recreated ${recreatedCount} alarms after service worker wake`);
    } catch (error) {
        if (error.message && (error.message.includes('Extension context invalidated') ||
            error.message.includes('No SW'))) {
            console.warn('[BG][ALARMS] Context invalidated during alarm recreation');
            return;
        }
        console.error('[BG][ALARMS] Error recreating alarms:', error);
    }
}

// Clean up orphaned storage data from tabs that no longer exist
async function cleanupOrphanedStorageData() {
    if (!isExtensionContextValid()) {
        console.warn('[BG][CLEANUP] Extension context invalid, skipping cleanup');
        return;
    }
    try {
        const existingTabs = await chrome.tabs.query({});
        const existingTabIds = new Set(existingTabs.map(t => t.id));

        // Clean up tabLastActivity
        const activityResult = await chrome.storage.session.get('tabLastActivity').catch(() =>
            chrome.storage.local.get('tabLastActivity')
        );
        const tabLastActivity = activityResult?.tabLastActivity || {};
        const cleanedActivity = {};
        for (const [tabId, timestamp] of Object.entries(tabLastActivity)) {
            if (existingTabIds.has(parseInt(tabId))) {
                cleanedActivity[tabId] = timestamp;
            }
        }
        await chrome.storage.session.set({ tabLastActivity: cleanedActivity }).catch(() =>
            chrome.storage.local.set({ tabLastActivity: cleanedActivity })
        );

        // Clean up tabFormStatus
        const formResult = await chrome.storage.session.get('tabFormStatus').catch(() =>
            chrome.storage.local.get('tabFormStatus')
        );
        const tabFormStatus = formResult?.tabFormStatus || {};
        const cleanedFormStatus = {};
        for (const [tabId, status] of Object.entries(tabFormStatus)) {
            if (existingTabIds.has(parseInt(tabId))) {
                cleanedFormStatus[tabId] = status;
            }
        }
        await chrome.storage.session.set({ tabFormStatus: cleanedFormStatus }).catch(() =>
            chrome.storage.local.set({ tabFormStatus: cleanedFormStatus })
        );

        // Clean up orphaned alarms
        const alarms = await chrome.alarms.getAll();
        for (const alarm of alarms) {
            if (alarm.name.startsWith(ALARM_PREFIX)) {
                const tabId = parseInt(alarm.name.replace(ALARM_PREFIX, ''), 10);
                if (!existingTabIds.has(tabId)) {
                    await chrome.alarms.clear(alarm.name);
                    console.log(`[BG][CLEANUP] Cleared orphaned alarm for tab ${tabId}`);
                }
            }
        }

        console.log('[BG][CLEANUP] Orphaned storage data cleaned up');
    } catch (error) {
        // Check for context invalidation errors
        if (error.message && (error.message.includes('Extension context invalidated') ||
            error.message.includes('No SW'))) {
            console.warn('[BG][CLEANUP] Context invalidated during cleanup');
            return;
        }
        console.error('[BG][CLEANUP] Failed to clean up orphaned data:', error);
    }
}

// ============================================================================
// CONNECTION ERROR HANDLING
// ============================================================================

/**
 * Handle connection errors from chrome.runtime connections.
 * This catches errors like "Extension context invalidated" when the service worker
 * is terminated while a connection is still open.
 */
chrome.runtime.onConnect.addListener((port) => {
    console.log('[BG] Port connected:', port.name);

    port.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        if (error) {
            console.warn('[BG] Port disconnected with error:', error.message);
        } else {
            console.log('[BG] Port disconnected cleanly:', port.name);
        }
    });

    port.onMessage.addListener((message) => {
        try {
            console.log('[BG] Port message received:', message);
            // Handle port messages if needed
        } catch (error) {
            console.error('[BG] Error handling port message:', error);
        }
    });
});

// ============================================================================
// SETTINGS
// ============================================================================

async function loadSettings() {
    if (!isExtensionContextValid()) {
        console.warn('[BG][SETTINGS] Extension context invalid, using default config');
        return;
    }
    try {
        const result = await chrome.storage.sync.get('tabSuspenderSettings');
        if (result.tabSuspenderSettings) {
            config = { ...DEFAULT_CONFIG, ...result.tabSuspenderSettings };
        }
    } catch (error) {
        // Check for context invalidation errors
        if (error.message && (error.message.includes('Extension context invalidated') ||
            error.message.includes('No SW'))) {
            console.warn('[BG][SETTINGS] Context invalidated during load, using defaults');
            return;
        }
        console.error('[BG] Failed to load settings:', error);
    }
}

async function saveSettings() {
    try {
        await chrome.storage.sync.set({ tabSuspenderSettings: config });
    } catch (error) {
        console.error('[BG] Failed to save settings:', error);
    }
}

// ============================================================================
// CONTEXT MENUS
// ============================================================================

function createContextMenus() {
    try {
        chrome.contextMenus.removeAll(() => {
            chrome.contextMenus.create({
                id: 'suspendTab',
                title: 'Suspend this tab',
                contexts: ['page']
            });

            chrome.contextMenus.create({
                id: 'suspendOthers',
                title: 'Suspend other tabs',
                contexts: ['page']
            });

            chrome.contextMenus.create({
                id: 'whitelistSite',
                title: 'Never suspend this site',
                contexts: ['page']
            });

            chrome.contextMenus.create({
                id: 'restoreAll',
                title: 'Restore all tabs',
                contexts: ['page']
            });
        });
    } catch (error) {
        console.error('[BG] Failed to create context menus:', error);
    }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    try {
        switch (info.menuItemId) {
            case 'suspendTab':
                await suspendTab(tab.id);
                break;
            case 'suspendOthers':
                await suspendAllExcept(tab.id);
                break;
            case 'whitelistSite':
                await whitelistCurrentSite(tab);
                break;
            case 'restoreAll':
                await restoreAllTabs();
                break;
        }
    } catch (error) {
        console.error('[BG] Context menu action failed:', error);
    }
});

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

chrome.commands.onCommand.addListener(async (command) => {
    try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

        switch (command) {
            case 'suspend_current':
                if (activeTab) await suspendTab(activeTab.id);
                break;
            case 'suspend_others':
                if (activeTab) await suspendAllExcept(activeTab.id);
                break;
            case 'restore_all':
                await restoreAllTabs();
                break;
            case 'whitelist_site':
                if (activeTab) await whitelistCurrentSite(activeTab);
                break;
        }
    } catch (error) {
        console.error('[BG] Command failed:', error);
    }
});

// ============================================================================
// TAB MONITORING  
// ============================================================================

async function startMonitoring() {
    if (!isExtensionContextValid()) {
        console.warn('[BG][TIMER] Extension context invalid, skipping monitoring start');
        return;
    }
    try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            // Re-check context validity in loop as it can become invalid mid-operation
            if (!isExtensionContextValid()) {
                console.warn('[BG][TIMER] Context invalidated during tab iteration');
                return;
            }
            if (!isInternalPage(tab.url) && !isSuspendedPage(tab.url)) {
                await startTabTimer(tab.id);
            }
        }
        console.log(`[BG][TIMER] Started monitoring ${tabs.length} tabs`);
    } catch (error) {
        // Check for context invalidation errors
        if (error.message && (error.message.includes('Extension context invalidated') ||
            error.message.includes('No SW'))) {
            console.warn('[BG][TIMER] Context invalidated during monitoring start');
            return;
        }
        console.error('[BG] Failed to start monitoring:', error);
    }
}

async function startTabTimer(tabId) {
    // Check extension context is valid
    if (!isExtensionContextValid()) {
        console.warn(`[BG][TIMER] Extension context invalid, skipping timer start for tab ${tabId}`);
        return;
    }

    // Verify tab still exists before creating alarm
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) {
        console.log(`[BG][TIMER] Tab ${tabId} no longer exists, skipping timer start`);
        return;
    }

    try {
        await clearTabTimer(tabId);

        const timeoutMinutes = config.suspensionTimeout;
        const alarmName = `${ALARM_PREFIX}${tabId}`;

        // Create alarm using chrome.alarms API (persists across service worker restarts)
        await chrome.alarms.create(alarmName, {
            delayInMinutes: timeoutMinutes
        });

        // Store last activity time in storage (persists across SW restarts)
        await updateTabActivity(tabId);

        console.log(`[BG][TIMER] Started alarm for tab ${tabId}, will fire in ${timeoutMinutes} minutes`);
    } catch (error) {
        // Check for context invalidation errors
        if (error.message && (error.message.includes('Extension context invalidated') ||
            error.message.includes('No SW'))) {
            console.warn(`[BG][TIMER] Context invalidated during timer start for tab ${tabId}`);
            return;
        }
        console.error(`[BG][TIMER] Failed to start timer for tab ${tabId}:`, error);
    }
}

async function clearTabTimer(tabId) {
    // Gracefully handle errors when clearing timers
    try {
        const alarmName = `${ALARM_PREFIX}${tabId}`;
        await chrome.alarms.clear(alarmName);
    } catch (error) {
        // Ignore errors when clearing - tab may already be gone or context invalid
        if (error.message && !error.message.includes('Extension context invalidated')) {
            console.warn(`[BG][TIMER] Error clearing timer for tab ${tabId}:`, error.message);
        }
    }
}

async function resetTabTimer(tabId) {
    // Check extension context is valid
    if (!isExtensionContextValid()) {
        console.warn(`[BG][TIMER] Extension context invalid, skipping timer reset for tab ${tabId}`);
        return;
    }

    // Verify tab exists before resetting
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) {
        console.log(`[BG][TIMER] Tab ${tabId} no longer exists, skipping timer reset`);
        // Clean up any orphaned alarm
        await clearTabTimer(tabId);
        return;
    }

    await updateTabActivity(tabId);
    await startTabTimer(tabId);
}

async function updateTabActivity(tabId) {
    try {
        const result = await chrome.storage.session.get('tabLastActivity');
        const tabLastActivity = result.tabLastActivity || {};
        tabLastActivity[tabId] = Date.now();
        await chrome.storage.session.set({ tabLastActivity });
    } catch (error) {
        // Fallback to local storage if session storage not available
        try {
            const result = await chrome.storage.local.get('tabLastActivity');
            const tabLastActivity = result.tabLastActivity || {};
            tabLastActivity[tabId] = Date.now();
            await chrome.storage.local.set({ tabLastActivity });
        } catch (fallbackError) {
            // If both fail, log but don't crash - activity tracking is non-critical
            console.warn(`[BG][TIMER] Failed to update activity for tab ${tabId}:`, fallbackError.message);
        }
    }
}

async function getTabActivity(tabId) {
    try {
        const result = await chrome.storage.session.get('tabLastActivity');
        const tabLastActivity = result.tabLastActivity || {};
        return tabLastActivity[tabId] || Date.now();
    } catch (error) {
        try {
            const result = await chrome.storage.local.get('tabLastActivity');
            const tabLastActivity = result.tabLastActivity || {};
            return tabLastActivity[tabId] || Date.now();
        } catch (fallbackError) {
            // If both fail, return current time as safe default
            console.warn(`[BG][TIMER] Failed to get activity for tab ${tabId}:`, fallbackError.message);
            return Date.now();
        }
    }
}

// Track form status for tabs (unsaved form data)
async function updateTabFormStatus(tabId, hasUnsavedForms) {
    try {
        const result = await chrome.storage.session.get('tabFormStatus');
        const tabFormStatus = result.tabFormStatus || {};
        tabFormStatus[tabId] = hasUnsavedForms;
        await chrome.storage.session.set({ tabFormStatus });
        console.log(`[BG][FORMS] Tab ${tabId} form status: ${hasUnsavedForms ? 'has unsaved data' : 'clean'}`);
    } catch (error) {
        // Fallback to local storage
        const result = await chrome.storage.local.get('tabFormStatus');
        const tabFormStatus = result.tabFormStatus || {};
        tabFormStatus[tabId] = hasUnsavedForms;
        await chrome.storage.local.set({ tabFormStatus });
    }
}

async function getTabFormStatus(tabId) {
    try {
        const result = await chrome.storage.session.get('tabFormStatus');
        const tabFormStatus = result.tabFormStatus || {};
        return tabFormStatus[tabId] || false;
    } catch (error) {
        const result = await chrome.storage.local.get('tabFormStatus');
        const tabFormStatus = result.tabFormStatus || {};
        return tabFormStatus[tabId] || false;
    }
}

async function clearTabFormStatus(tabId) {
    try {
        const result = await chrome.storage.session.get('tabFormStatus');
        const tabFormStatus = result.tabFormStatus || {};
        delete tabFormStatus[tabId];
        await chrome.storage.session.set({ tabFormStatus });
    } catch {
        const result = await chrome.storage.local.get('tabFormStatus');
        const tabFormStatus = result.tabFormStatus || {};
        delete tabFormStatus[tabId];
        await chrome.storage.local.set({ tabFormStatus });
    }
}

// Chrome Alarms listener - fires when a tab should be suspended or license check
chrome.alarms.onAlarm.addListener(async (alarm) => {
    // Check extension context is valid before processing alarms
    if (!isExtensionContextValid()) {
        console.warn('[BG][TIMER] Extension context invalid, skipping alarm processing');
        return;
    }

    if (!alarm.name.startsWith(ALARM_PREFIX)) return;

    const tabId = parseInt(alarm.name.replace(ALARM_PREFIX, ''), 10);
    console.log(`[BG][TIMER] Alarm fired for tab ${tabId}`);

    try {
        // Validate tab still exists and hasn't been reused (Chrome can reuse tab IDs)
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (!tab) {
            console.log(`[BG][TIMER] Tab ${tabId} no longer exists, cleaning up`);
            // Clean up all orphaned data for this tab
            await chrome.alarms.clear(alarm.name).catch(() => {});
            await clearTabFormStatus(tabId);
            // Clean up activity data
            try {
                const result = await chrome.storage.session.get('tabLastActivity').catch(() =>
                    chrome.storage.local.get('tabLastActivity')
                );
                const tabLastActivity = result?.tabLastActivity || {};
                if (tabLastActivity[tabId]) {
                    delete tabLastActivity[tabId];
                    await chrome.storage.session.set({ tabLastActivity }).catch(() =>
                        chrome.storage.local.set({ tabLastActivity })
                    );
                }
            } catch (cleanupError) {
                // Non-critical - ignore cleanup errors
            }
            return;
        }

        // Check if the tab URL matches what we expect (prevents reused tab ID issues)
        const storedActivity = await getTabActivity(tabId);
        const timeSinceActivity = Date.now() - storedActivity;
        const expectedTimeout = config.suspensionTimeout * 60 * 1000;

        // If activity is very recent, the tab ID was likely reused - don't suspend
        if (timeSinceActivity < expectedTimeout * 0.5) {
            console.log(`[BG][TIMER] Tab ${tabId} has recent activity, likely reused ID - restarting timer`);
            await startTabTimer(tabId);
            return;
        }

        // shouldSuspendTab returns false on any error, but handle all falsy values explicitly
        const canSuspend = await shouldSuspendTab(tabId);
        if (canSuspend === true) {
            const suspended = await suspendTab(tabId);
            if (suspended) {
                console.log(`[BG][TIMER] Auto-suspended tab ${tabId}`);
            } else {
                console.log(`[BG][TIMER] Tab ${tabId} suspension failed (suspendTab returned false)`);
            }
        } else {
            console.log(`[BG][TIMER] Tab ${tabId} cannot be suspended (active/whitelisted/etc)`);
            // Restart timer for tabs that can't be suspended now but might later
            // (e.g., active tab that becomes inactive, audible tab that stops playing)
            await startTabTimer(tabId);
        }
    } catch (error) {
        // Check for context invalidation errors
        if (error.message && (error.message.includes('Extension context invalidated') ||
            error.message.includes('No SW'))) {
            console.warn(`[BG][TIMER] Context invalidated during alarm processing for tab ${tabId}`);
            return;
        }
        console.error(`[BG][TIMER] Auto-suspend failed for tab ${tabId}:`, error);
    }
});

// ============================================================================
// TAB EVENT LISTENERS
// ============================================================================

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        // First verify the tab still exists (handles race condition where tab is closed
        // between activation event firing and handler execution)
        const tab = await chrome.tabs.get(activeInfo.tabId).catch(() => null);
        if (!tab) {
            // Tab was closed before we could process it - this is expected, not an error
            return;
        }

        await resetTabTimer(activeInfo.tabId);

        if (config.autoUnsuspendOnFocus && isSuspendedPage(tab.url)) {
            await restoreTab(activeInfo.tabId);
        }
    } catch (error) {
        // Only log unexpected errors, not "No tab with id" which is a known race condition
        if (!error.message?.includes('No tab with id')) {
            console.error('[BG] Tab activation handler failed:', error);
        }
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Note: Stats are tracked in:
    // - background.js suspendTab() for auto-suspend and message-based suspend
    // - popup.js updateMemoryStatsLocal() for direct popup suspensions
    // Do NOT add stats tracking here - it would cause double-counting

    // Handle URL changes (including SPA navigation via history API)
    if (changeInfo.url) {
        if (isInternalPage(changeInfo.url) || isSuspendedPage(changeInfo.url)) {
            // Tab navigated to internal/suspended page - clear any existing alarm
            await clearTabTimer(tabId);
            await clearTabFormStatus(tabId);
        } else {
            // URL changed to a normal page - reset timer
            await resetTabTimer(tabId);
        }
    }

    // Handle page load complete
    if (changeInfo.status === 'complete' && !isInternalPage(tab.url) && !isSuspendedPage(tab.url)) {
        await resetTabTimer(tabId);
    }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
    await clearTabTimer(tabId);

    // Clean up form status to prevent memory leak
    await clearTabFormStatus(tabId);

    // Clean up stored activity time
    try {
        const result = await chrome.storage.session.get('tabLastActivity');
        const tabLastActivity = result.tabLastActivity || {};
        delete tabLastActivity[tabId];
        await chrome.storage.session.set({ tabLastActivity });
    } catch {
        const result = await chrome.storage.local.get('tabLastActivity');
        const tabLastActivity = result.tabLastActivity || {};
        delete tabLastActivity[tabId];
        await chrome.storage.local.set({ tabLastActivity });
    }
});

chrome.tabs.onCreated.addListener(async (tab) => {
    if (!isInternalPage(tab.url)) {
        await startTabTimer(tab.id);
    }
});

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
        handleMessage(message, sender)
            .then(sendResponse)
            .catch(error => {
                console.error('[BG] Message handling error:', error);
                sendResponse({ error: error.message });
            });
    } catch (error) {
        console.error('[BG] Synchronous message handler error:', error);
        sendResponse({ error: error.message || 'Unknown error' });
    }
    return true;
});

async function handleMessage(message, sender) {
    console.log('[BG] Received message:', message.type);

    try {
        switch (message.type) {
            case 'TAB_ACTIVITY':
                // Safely handle case where sender.tab is undefined (e.g., from popup or other extension pages)
                if (sender.tab && sender.tab.id !== undefined) {
                    await resetTabTimer(sender.tab.id);
                } else {
                    console.warn('[BG] TAB_ACTIVITY received without valid sender.tab');
                }
                return { success: true };

            case 'FORM_STATUS':
                // Track form status for this tab - requires valid sender.tab
                if (sender.tab && sender.tab.id !== undefined) {
                    await updateTabFormStatus(sender.tab.id, message.hasUnsavedForms);
                } else {
                    console.warn('[BG] FORM_STATUS received without valid sender.tab');
                }
                return { success: true };

            case 'CONTENT_SCRIPT_READY':
                // Content script signaling it's ready - may or may not have sender.tab
                if (sender.tab && sender.tab.id !== undefined) {
                    console.log('[BG] Content script ready for tab:', sender.tab.id);
                }
                return { success: true };

            case 'SUSPEND_TAB':
                if (message.tabId === undefined) {
                    console.warn('[BG] SUSPEND_TAB received without tabId');
                    return { success: false, error: 'Missing tabId' };
                }
                await suspendTab(message.tabId);
                return { success: true };

            case 'RESTORE_TAB':
                if (message.tabId === undefined) {
                    console.warn('[BG] RESTORE_TAB received without tabId');
                    return { success: false, error: 'Missing tabId' };
                }
                await restoreTab(message.tabId);
                return { success: true };

            case 'SUSPEND_ALL':
                const suspended = await suspendAllInactive();
                return { success: true, count: suspended };

            case 'RESTORE_ALL':
                const restored = await restoreAllTabs();
                return { success: true, count: restored };

            case 'GET_TAB_LIST':
                return await getTabList();

            case 'GET_STATS':
                return await getStats();

            case 'GET_SETTINGS':
                return { settings: config };

            case 'SAVE_SETTINGS':
                const oldTimeout = config.suspensionTimeout;
                config = { ...config, ...message.settings };
                await saveSettings();

                // If timeout changed, restart all tab timers with new value
                if (message.settings.suspensionTimeout !== undefined &&
                    message.settings.suspensionTimeout !== oldTimeout) {
                    console.log(`[BG][SETTINGS] Timeout changed from ${oldTimeout} to ${message.settings.suspensionTimeout}, restarting timers`);
                    await startMonitoring();
                }
                return { success: true };

            case 'WHITELIST_DOMAIN':
                await addToWhitelist(message.domain);
                return { success: true };

            case 'REMOVE_WHITELIST':
                await removeFromWhitelist(message.domain);
                return { success: true };

            case 'RELOAD_CONFIG':
                // Reload settings from storage (called when popup updates whitelist)
                await loadSettings();
                console.log('[BG][CONFIG] Reloaded settings from storage');
                return { success: true };

            // ========== AGENT 1: COUNTDOWN INDICATOR ==========
            case 'GET_TAB_COUNTDOWN':
                // Return remaining time for a specific tab
                if (message.tabId === undefined) {
                    console.warn('[BG] GET_TAB_COUNTDOWN received without tabId');
                    return { tabId: null, remainingMs: -1, suspendAt: null, isPaused: true };
                }
                return await getTabCountdownHandler(message.tabId);

            case 'GET_ALL_COUNTDOWNS':
                // Return all active countdowns
                return await getAllCountdownsHandler();
            // ========== END AGENT 1 ==========

            // ========== AGENT 2: DASHBOARD SYNC ==========
            case 'REQUEST_STATS_SYNC':
                // Force refresh stats and broadcast to all listeners
                const syncStats = await getStats();
                chrome.runtime.sendMessage({
                    type: 'STATS_UPDATED',
                    stats: syncStats,
                    timestamp: Date.now()
                }).catch(() => {}); // Ignore if no listeners
                return { success: true, stats: syncStats };
            // ========== END AGENT 2 ==========

            default:
                console.warn('[BG] Unknown message type:', message.type);
                return { error: 'Unknown message type' };
        }
    } catch (error) {
        console.error('[BG] Error in handleMessage:', error);
        throw error; // Re-throw to be caught by the outer handler
    }
}

// ============================================================================
// SUSPENSION LOGIC
// ============================================================================

async function shouldSuspendTab(tabId) {
    try {
        // Defensive handling: tab may have been closed
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (!tab) {
            console.log(`[BG][SUSPEND] Tab ${tabId} no longer exists`);
            return false;
        }

        if (isInternalPage(tab.url)) return false;
        if (isSuspendedPage(tab.url)) return false;
        if (config.neverSuspendActiveTab && tab.active) return false;
        if (!config.suspendPinnedTabs && tab.pinned) return false;
        if (config.neverSuspendAudio && tab.audible) return false;
        if (isWhitelisted(tab.url)) return false;

        // HIGH-6: Don't suspend tabs with unsaved form data
        if (await getTabFormStatus(tabId)) {
            console.log(`[BG][FORMS] Tab ${tabId} has unsaved form data - skipping suspension`);
            return false;
        }

        return true;
    } catch (error) {
        console.error('[BG] shouldSuspendTab error:', error);
        return false;
    }
}

async function suspendTab(tabId) {
    try {
        const canSuspend = await shouldSuspendTab(tabId);
        if (!canSuspend) return false;

        // Defensive handling: tab may have been closed between shouldSuspendTab check and now
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (!tab) {
            console.log(`[BG][SUSPEND] Tab ${tabId} no longer exists, cannot suspend`);
            return false;
        }

        // Truncate very long URLs to prevent issues (max 2000 chars for URL param safety)
        const MAX_URL_LENGTH = 2000;
        let urlToStore = tab.url;
        if (urlToStore.length > MAX_URL_LENGTH) {
            console.warn(`[BG][SUSPEND] URL too long (${urlToStore.length} chars), truncating to ${MAX_URL_LENGTH}`);
            urlToStore = urlToStore.substring(0, MAX_URL_LENGTH);
        }

        const params = new URLSearchParams({
            url: urlToStore,
            title: (tab.title || 'Suspended Tab').substring(0, 200), // Limit title length too
            favicon: tab.favIconUrl || '', // URLSearchParams handles encoding automatically
            time: Date.now().toString()
        });

        const suspendedUrl = chrome.runtime.getURL(`suspended.html?${params.toString()}`);

        // Handle tabs.update failure (e.g., restricted URLs like Chrome Web Store, or tab closed)
        try {
            await chrome.tabs.update(tabId, { url: suspendedUrl });
        } catch (updateError) {
            // Check if error is because tab no longer exists
            if (updateError.message?.includes('No tab with id')) {
                console.log(`[BG][SUSPEND] Tab ${tabId} was closed during suspension`);
                return false;
            }
            console.error(`[BG][SUSPEND] Failed to update tab ${tabId}:`, updateError);
            return false; // Don't update stats if suspension failed
        }

        await updateMemoryStats(tab.url);
        await clearTabTimer(tabId);
        await clearTabFormStatus(tabId);
        updateBadge();

        return true;
    } catch (error) {
        console.error('[BG] Failed to suspend tab:', error);
        return false;
    }
}

async function restoreTab(tabId) {
    try {
        // Defensive handling: tab may have been closed
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (!tab) {
            console.log(`[BG][RESTORE] Tab ${tabId} no longer exists`);
            return false;
        }

        if (!isSuspendedPage(tab.url)) {
            // Defensive handling for reload
            try {
                await chrome.tabs.reload(tabId);
            } catch (reloadError) {
                if (reloadError.message?.includes('No tab with id')) {
                    console.log(`[BG][RESTORE] Tab ${tabId} was closed during reload`);
                    return false;
                }
                throw reloadError;
            }
            return true;
        }

        const url = new URL(tab.url);
        const originalUrl = url.searchParams.get('url');

        if (!originalUrl) return false;

        // Defensive handling for update
        try {
            await chrome.tabs.update(tabId, { url: originalUrl });
        } catch (updateError) {
            if (updateError.message?.includes('No tab with id')) {
                console.log(`[BG][RESTORE] Tab ${tabId} was closed during restoration`);
                return false;
            }
            throw updateError;
        }

        await startTabTimer(tabId);
        updateBadge();

        return true;
    } catch (error) {
        console.error('[BG] Failed to restore tab:', error);
        return false;
    }
}

async function suspendAllInactive(exceptTabId = null) {
    const tabs = await chrome.tabs.query({});
    let count = 0;

    for (const tab of tabs) {
        if (tab.id !== exceptTabId && !tab.active) {
            // Tab may have been closed since query - suspendTab handles this defensively
            const success = await suspendTab(tab.id);
            if (success) count++;
        }
    }

    return count;
}

async function suspendAllExcept(tabId) {
    return suspendAllInactive(tabId);
}

async function restoreAllTabs() {
    const tabs = await chrome.tabs.query({});
    let count = 0;

    for (const tab of tabs) {
        if (isSuspendedPage(tab.url)) {
            // Tab may have been closed since query - restoreTab handles this defensively
            const success = await restoreTab(tab.id);
            if (success) count++;
        }
    }

    return count;
}

// ============================================================================
// WHITELIST
// ============================================================================

function isWhitelisted(url) {
    try {
        const urlObj = new URL(url);
        let hostname = urlObj.hostname.toLowerCase();

        // Normalize www prefix for consistent matching
        const hostnameWithoutWww = hostname.startsWith('www.') ? hostname.slice(4) : hostname;

        return config.whitelistedDomains.some(domain => {
            let d = domain.toLowerCase();
            // Normalize www prefix in whitelist domain too
            const domainWithoutWww = d.startsWith('www.') ? d.slice(4) : d;

            // Match with and without www prefix
            return hostname === d ||
                   hostname === domainWithoutWww ||
                   hostnameWithoutWww === d ||
                   hostnameWithoutWww === domainWithoutWww ||
                   hostname.endsWith('.' + d) ||
                   hostname.endsWith('.' + domainWithoutWww) ||
                   hostnameWithoutWww.endsWith('.' + d) ||
                   hostnameWithoutWww.endsWith('.' + domainWithoutWww);
        });
    } catch {
        return false;
    }
}

async function addToWhitelist(domain) {
    // Normalize domain: remove www prefix for consistency
    let normalizedDomain = domain.toLowerCase().trim();
    if (normalizedDomain.startsWith('www.')) {
        normalizedDomain = normalizedDomain.slice(4);
    }

    // Check if already exists (with or without www)
    const alreadyExists = config.whitelistedDomains.some(d => {
        const existingNormalized = d.toLowerCase().startsWith('www.') ? d.slice(4).toLowerCase() : d.toLowerCase();
        return existingNormalized === normalizedDomain;
    });

    if (!alreadyExists) {
        config.whitelistedDomains.push(normalizedDomain);
        await saveSettings();
    }
}

async function removeFromWhitelist(domain) {
    config.whitelistedDomains = config.whitelistedDomains.filter(d => d !== domain);
    await saveSettings();
}

async function whitelistCurrentSite(tab) {
    try {
        const url = new URL(tab.url);
        await addToWhitelist(url.hostname);
    } catch (error) {
        console.error('[BG] Failed to whitelist site:', error);
    }
}

// ============================================================================
// AGENT 1: COUNTDOWN INDICATOR HANDLERS
// ============================================================================

/**
 * Get countdown information for a specific tab
 * @param {number} tabId - The tab ID to get countdown for
 * @returns {Promise<object>} Countdown info with remainingMs, suspendAt, isPaused
 */
async function getTabCountdownHandler(tabId) {
    try {
        // Get the alarm for this tab
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

        // No alarm - check if tab exists and its state
        try {
            const tab = await chrome.tabs.get(tabId);

            // Check if tab is suspended, internal, or active
            if (isSuspendedPage(tab.url) || isInternalPage(tab.url) || tab.active) {
                return {
                    tabId,
                    remainingMs: -1,
                    suspendAt: null,
                    isPaused: true
                };
            }

            // Check if whitelisted
            if (isWhitelisted(tab.url)) {
                return {
                    tabId,
                    remainingMs: -1,
                    suspendAt: null,
                    isPaused: true
                };
            }
        } catch (e) {
            // Tab doesn't exist
            return {
                tabId,
                remainingMs: -1,
                suspendAt: null,
                isPaused: true
            };
        }

        // No alarm found for this tab
        return {
            tabId,
            remainingMs: -1,
            suspendAt: null,
            isPaused: true
        };

    } catch (error) {
        console.error(`[BG][COUNTDOWN] Error getting countdown for tab ${tabId}:`, error);
        return {
            tabId,
            remainingMs: -1,
            suspendAt: null,
            isPaused: true
        };
    }
}

/**
 * Get all active countdowns for tabs
 * @returns {Promise<object>} Object with countdowns array
 */
async function getAllCountdownsHandler() {
    const countdowns = [];

    try {
        // Get all suspension alarms
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
        console.error('[BG][COUNTDOWN] Error getting all countdowns:', error);
    }

    return { countdowns };
}

// ============================================================================
// HELPERS
// ============================================================================

function isInternalPage(url) {
    if (!url) return true;

    // All protocols that should NOT be suspended
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

function isSuspendedPage(url) {
    if (!url) return false;
    return url.includes('suspended.html');
}

// ============================================================================
// STATS
// ============================================================================

async function updateMemoryStats(url) {
    try {
        console.log('[BG][STATS] updateMemoryStats called for:', url);

        const result = await chrome.storage.local.get('memoryStats');
        const stats = result.memoryStats || { totalSaved: 0, tabsSuspended: 0, history: [] };

        console.log('[BG][STATS] Before:', stats.totalSaved / (1024 * 1024), 'MB, tabs:', stats.tabsSuspended);

        const estimatedMemory = 50 * 1024 * 1024; // 50MB

        stats.totalSaved += estimatedMemory;
        stats.tabsSuspended++;
        stats.history.push({
            timestamp: Date.now(),
            url,
            memorySaved: estimatedMemory
        });

        if (stats.history.length > 500) {
            stats.history = stats.history.slice(-500);
        }

        await chrome.storage.local.set({ memoryStats: stats });
        console.log('[BG][STATS] After:', stats.totalSaved / (1024 * 1024), 'MB, tabs:', stats.tabsSuspended);

        // ========== AGENT 2: DASHBOARD SYNC ==========
        // Broadcast stats update to all listeners (popup, dashboard, etc.)
        // Feature flag check is done via storage since this is not an ES module
        try {
            const flagsResult = await chrome.storage.local.get('feature_flags_override');
            const overrides = flagsResult.feature_flags_override || {};
            const dashboardSyncEnabled = overrides.DASHBOARD_SYNC !== false; // Default: enabled

            if (dashboardSyncEnabled) {
                const currentStats = await getStats();
                chrome.runtime.sendMessage({
                    type: 'STATS_UPDATED',
                    stats: currentStats,
                    timestamp: Date.now()
                }).catch(() => {
                    // Expected when no listeners are active (popup/dashboard closed)
                });
                console.log('[BG][STATS] Broadcast STATS_UPDATED');
            }
        } catch (broadcastError) {
            // Silently ignore broadcast errors - non-critical
        }
        // ========== END AGENT 2 ==========
    } catch (error) {
        console.error('[BG][STATS] Failed to update memory stats:', error);
    }
}

async function getStats() {
    try {
        const result = await chrome.storage.local.get('memoryStats');
        let stats = result.memoryStats || { totalSaved: 0, tabsSuspended: 0, history: [] };

        // Validate and sanitize data to prevent NaN/corruption issues
        stats.totalSaved = Math.max(0, parseInt(stats.totalSaved) || 0);
        stats.tabsSuspended = Math.max(0, parseInt(stats.tabsSuspended) || 0);
        stats.history = Array.isArray(stats.history) ? stats.history : [];

        console.log('[BG][STATS] getStats - raw storage:', stats.totalSaved / (1024 * 1024), 'MB, history entries:', stats.history.length);

        const today = new Date().toDateString();
        const todaySaved = stats.history
            .filter(h => new Date(h.timestamp).toDateString() === today)
            .reduce((sum, h) => sum + h.memorySaved, 0);

        const allTabs = await chrome.tabs.query({});
        const suspendedCount = allTabs.filter(t => isSuspendedPage(t.url)).length;

        const response = {
            totalSaved: stats.totalSaved,
            todaySaved,
            tabsSuspended: suspendedCount,
            totalTabs: allTabs.length,
            activeTabs: allTabs.length - suspendedCount,
            lifetimeTabsSuspended: stats.tabsSuspended
        };

        console.log('[BG][STATS] getStats returning:', response.totalSaved / (1024 * 1024), 'MB total,', response.todaySaved / (1024 * 1024), 'MB today');

        return response;
    } catch (error) {
        console.error('[BG][STATS] Failed to get stats:', error);
        return { error: error.message };
    }
}

async function getTabList() {
    try {
        const windows = await chrome.windows.getAll({ populate: true });

        // Get all tab activity times from storage
        let tabLastActivity = {};
        try {
            const result = await chrome.storage.session.get('tabLastActivity');
            tabLastActivity = result.tabLastActivity || {};
        } catch {
            const result = await chrome.storage.local.get('tabLastActivity');
            tabLastActivity = result.tabLastActivity || {};
        }

        return windows.map(win => ({
            id: win.id,
            focused: win.focused,
            tabs: win.tabs.map(tab => ({
                id: tab.id,
                windowId: tab.windowId,
                url: tab.url || '',
                title: tab.title || 'Untitled',
                favIconUrl: tab.favIconUrl || '',
                active: tab.active,
                pinned: tab.pinned,
                audible: tab.audible,
                status: isSuspendedPage(tab.url) ? 'suspended' : (tab.active ? 'active' : 'idle'),
                lastActivity: tabLastActivity[tab.id] || Date.now()
            }))
        }));
    } catch (error) {
        console.error('[BG] Failed to get tab list:', error);
        return [];
    }
}

// ============================================================================
// BADGE
// ============================================================================

async function updateBadge() {
    if (!isExtensionContextValid()) {
        console.warn('[BG][BADGE] Extension context invalid, skipping badge update');
        return;
    }
    try {
        const tabs = await chrome.tabs.query({});
        const suspendedCount = tabs.filter(t => isSuspendedPage(t.url)).length;

        // Re-check context before chrome.action calls
        if (!isExtensionContextValid()) {
            console.warn('[BG][BADGE] Context invalidated before setting badge');
            return;
        }

        await chrome.action.setBadgeText({
            text: suspendedCount > 0 ? String(suspendedCount) : ''
        });

        await chrome.action.setBadgeBackgroundColor({ color: '#7C3BED' });
    } catch (error) {
        // Check for context invalidation errors
        if (error.message && (error.message.includes('Extension context invalidated') ||
            error.message.includes('No SW'))) {
            console.warn('[BG][BADGE] Context invalidated during badge update');
            return;
        }
        console.error('[BG] Failed to update badge:', error);
    }
}

// ============================================================================
// ============================================================================
// STARTUP
// ============================================================================

(async () => {
    // Verify extension context is valid before initialization
    if (!isExtensionContextValid()) {
        console.warn('[BG] Extension context invalid at init, will retry on next SW wake');
        return;
    }

    try {
        await loadSettings();

        // Re-check context after each async operation
        if (!isExtensionContextValid()) {
            console.warn('[BG] Context invalidated after loadSettings');
            return;
        }

        await startMonitoring();

        if (!isExtensionContextValid()) {
            console.warn('[BG] Context invalidated after startMonitoring');
            return;
        }

        await updateBadge();

        if (!isExtensionContextValid()) {
            console.warn('[BG] Context invalidated after updateBadge');
            return;
        }

        console.log('[BG] Background initialized successfully');
    } catch (error) {
        // Check for context invalidation errors
        if (error.message && (error.message.includes('Extension context invalidated') ||
            error.message.includes('No SW'))) {
            console.warn('[BG] Context invalidated during initialization');
            return;
        }
        console.error('[BG] Initialization failed:', error);
    }
})();
