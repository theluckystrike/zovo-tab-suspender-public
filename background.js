/**
 * Tab Suspender Pro - Background Service Worker
 * Simplified, bulletproof version
 */

console.log('Tab Suspender Pro: Background starting...');

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG = {
    suspensionTimeout: 30,
    autoUnsuspendOnFocus: true,
    suspendPinnedTabs: false,
    whitelistedDomains: ['mail.google.com', 'calendar.google.com', 'docs.google.com'],
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
    console.log('Tab Suspender Pro installed:', details.reason);

    await loadSettings();
    createContextMenus();

    if (details.reason === 'install') {
        chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
        await chrome.storage.local.set({
            memoryStats: { totalSaved: 0, tabsSuspended: 0, history: [] },
            installDate: Date.now()
        });
    }

    startMonitoring();
});

chrome.runtime.onStartup.addListener(async () => {
    console.log('Tab Suspender Pro starting up');
    await loadSettings();
    await cleanupOrphanedStorageData(); // Clean up stale data from closed tabs
    startMonitoring();
    updateBadge();
});

// Clean up orphaned storage data from tabs that no longer exist
async function cleanupOrphanedStorageData() {
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
                    console.log(`[CLEANUP] Cleared orphaned alarm for tab ${tabId}`);
                }
            }
        }

        console.log('[CLEANUP] Orphaned storage data cleaned up');
    } catch (error) {
        console.error('[CLEANUP] Failed to clean up orphaned data:', error);
    }
}

// ============================================================================
// SETTINGS
// ============================================================================

async function loadSettings() {
    try {
        const result = await chrome.storage.sync.get('tabSuspenderSettings');
        if (result.tabSuspenderSettings) {
            config = { ...DEFAULT_CONFIG, ...result.tabSuspenderSettings };
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

async function saveSettings() {
    try {
        await chrome.storage.sync.set({ tabSuspenderSettings: config });
    } catch (error) {
        console.error('Failed to save settings:', error);
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
        console.error('Failed to create context menus:', error);
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
        console.error('Context menu action failed:', error);
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
        console.error('Command failed:', error);
    }
});

// ============================================================================
// TAB MONITORING  
// ============================================================================

async function startMonitoring() {
    try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            if (!isInternalPage(tab.url) && !isSuspendedPage(tab.url)) {
                await startTabTimer(tab.id);
            }
        }
        console.log(`[TIMER] Started monitoring ${tabs.length} tabs`);
    } catch (error) {
        console.error('Failed to start monitoring:', error);
    }
}

async function startTabTimer(tabId) {
    await clearTabTimer(tabId);

    const timeoutMinutes = config.suspensionTimeout;
    const alarmName = `${ALARM_PREFIX}${tabId}`;

    // Create alarm using chrome.alarms API (persists across service worker restarts)
    await chrome.alarms.create(alarmName, {
        delayInMinutes: timeoutMinutes
    });

    // Store last activity time in storage (persists across SW restarts)
    await updateTabActivity(tabId);

    console.log(`[TIMER] Started alarm for tab ${tabId}, will fire in ${timeoutMinutes} minutes`);
}

async function clearTabTimer(tabId) {
    const alarmName = `${ALARM_PREFIX}${tabId}`;
    await chrome.alarms.clear(alarmName);
}

async function resetTabTimer(tabId) {
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
        const result = await chrome.storage.local.get('tabLastActivity');
        const tabLastActivity = result.tabLastActivity || {};
        tabLastActivity[tabId] = Date.now();
        await chrome.storage.local.set({ tabLastActivity });
    }
}

async function getTabActivity(tabId) {
    try {
        const result = await chrome.storage.session.get('tabLastActivity');
        const tabLastActivity = result.tabLastActivity || {};
        return tabLastActivity[tabId] || Date.now();
    } catch (error) {
        const result = await chrome.storage.local.get('tabLastActivity');
        const tabLastActivity = result.tabLastActivity || {};
        return tabLastActivity[tabId] || Date.now();
    }
}

// Track form status for tabs (unsaved form data)
async function updateTabFormStatus(tabId, hasUnsavedForms) {
    try {
        const result = await chrome.storage.session.get('tabFormStatus');
        const tabFormStatus = result.tabFormStatus || {};
        tabFormStatus[tabId] = hasUnsavedForms;
        await chrome.storage.session.set({ tabFormStatus });
        console.log(`[FORMS] Tab ${tabId} form status: ${hasUnsavedForms ? 'has unsaved data' : 'clean'}`);
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

// Chrome Alarms listener - fires when a tab should be suspended
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (!alarm.name.startsWith(ALARM_PREFIX)) return;

    const tabId = parseInt(alarm.name.replace(ALARM_PREFIX, ''), 10);
    console.log(`[TIMER] Alarm fired for tab ${tabId}`);

    try {
        // Validate tab still exists and hasn't been reused (Chrome can reuse tab IDs)
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (!tab) {
            console.log(`[TIMER] Tab ${tabId} no longer exists, clearing alarm`);
            await chrome.alarms.clear(alarm.name);
            return;
        }

        // Check if the tab URL matches what we expect (prevents reused tab ID issues)
        const storedActivity = await getTabActivity(tabId);
        const timeSinceActivity = Date.now() - storedActivity;
        const expectedTimeout = config.suspensionTimeout * 60 * 1000;

        // If activity is very recent, the tab ID was likely reused - don't suspend
        if (timeSinceActivity < expectedTimeout * 0.5) {
            console.log(`[TIMER] Tab ${tabId} has recent activity, likely reused ID - restarting timer`);
            await startTabTimer(tabId);
            return;
        }

        const canSuspend = await shouldSuspendTab(tabId);
        if (canSuspend) {
            await suspendTab(tabId);
            console.log(`[TIMER] Auto-suspended tab ${tabId}`);
        } else {
            console.log(`[TIMER] Tab ${tabId} cannot be suspended (active/whitelisted/etc)`);
        }
    } catch (error) {
        console.error(`[TIMER] Auto-suspend failed for tab ${tabId}:`, error);
    }
});

// ============================================================================
// TAB EVENT LISTENERS
// ============================================================================

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        await resetTabTimer(activeInfo.tabId);

        if (config.autoUnsuspendOnFocus) {
            const tab = await chrome.tabs.get(activeInfo.tabId);
            if (isSuspendedPage(tab.url)) {
                await restoreTab(activeInfo.tabId);
            }
        }
    } catch (error) {
        console.error('Tab activation handler failed:', error);
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
    handleMessage(message, sender)
        .then(sendResponse)
        .catch(error => {
            console.error('Message handling error:', error);
            sendResponse({ error: error.message });
        });
    return true;
});

async function handleMessage(message, sender) {
    console.log('Received message:', message.type);

    switch (message.type) {
        case 'TAB_ACTIVITY':
            if (sender.tab) await resetTabTimer(sender.tab.id);
            return { success: true };

        case 'FORM_STATUS':
            // Track form status for this tab
            if (sender.tab) {
                await updateTabFormStatus(sender.tab.id, message.hasUnsavedForms);
            }
            return { success: true };

        case 'CONTENT_SCRIPT_READY':
            return { success: true };

        case 'SUSPEND_TAB':
            await suspendTab(message.tabId);
            return { success: true };

        case 'RESTORE_TAB':
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
                console.log(`[SETTINGS] Timeout changed from ${oldTimeout} to ${message.settings.suspensionTimeout}, restarting timers`);
                await startMonitoring();
            }
            return { success: true };

        case 'WHITELIST_DOMAIN':
            await addToWhitelist(message.domain);
            return { success: true };

        case 'REMOVE_WHITELIST':
            await removeFromWhitelist(message.domain);
            return { success: true };

        // ========== AGENT 1: COUNTDOWN INDICATOR ==========
        case 'GET_TAB_COUNTDOWN':
            // Return remaining time for a specific tab
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
            return { error: 'Unknown message type' };
    }
}

// ============================================================================
// SUSPENSION LOGIC
// ============================================================================

async function shouldSuspendTab(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);

        if (isInternalPage(tab.url)) return false;
        if (isSuspendedPage(tab.url)) return false;
        if (config.neverSuspendActiveTab && tab.active) return false;
        if (!config.suspendPinnedTabs && tab.pinned) return false;
        if (config.neverSuspendAudio && tab.audible) return false;
        if (isWhitelisted(tab.url)) return false;

        // HIGH-6: Don't suspend tabs with unsaved form data
        if (await getTabFormStatus(tabId)) {
            console.log(`[FORMS] Tab ${tabId} has unsaved form data - skipping suspension`);
            return false;
        }

        return true;
    } catch (error) {
        console.error('shouldSuspendTab error:', error);
        return false;
    }
}

async function suspendTab(tabId) {
    try {
        const canSuspend = await shouldSuspendTab(tabId);
        if (!canSuspend) return false;

        const tab = await chrome.tabs.get(tabId);

        // Truncate very long URLs to prevent issues (max 2000 chars for URL param safety)
        const MAX_URL_LENGTH = 2000;
        let urlToStore = tab.url;
        if (urlToStore.length > MAX_URL_LENGTH) {
            console.warn(`[SUSPEND] URL too long (${urlToStore.length} chars), truncating to ${MAX_URL_LENGTH}`);
            urlToStore = urlToStore.substring(0, MAX_URL_LENGTH);
        }

        const params = new URLSearchParams({
            url: urlToStore,
            title: (tab.title || 'Suspended Tab').substring(0, 200), // Limit title length too
            favicon: encodeURIComponent(tab.favIconUrl || ''),
            time: Date.now().toString()
        });

        const suspendedUrl = chrome.runtime.getURL(`suspended.html?${params.toString()}`);

        // Handle tabs.update failure (e.g., restricted URLs like Chrome Web Store)
        try {
            await chrome.tabs.update(tabId, { url: suspendedUrl });
        } catch (updateError) {
            console.error(`[SUSPEND] Failed to update tab ${tabId}:`, updateError);
            return false; // Don't update stats if suspension failed
        }

        await updateMemoryStats(tab.url);
        await clearTabTimer(tabId);
        await clearTabFormStatus(tabId);
        updateBadge();

        return true;
    } catch (error) {
        console.error('Failed to suspend tab:', error);
        return false;
    }
}

async function restoreTab(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);

        if (!isSuspendedPage(tab.url)) {
            await chrome.tabs.reload(tabId);
            return true;
        }

        const url = new URL(tab.url);
        const originalUrl = url.searchParams.get('url');

        if (!originalUrl) return false;

        await chrome.tabs.update(tabId, { url: originalUrl });
        await startTabTimer(tabId);
        updateBadge();

        return true;
    } catch (error) {
        console.error('Failed to restore tab:', error);
        return false;
    }
}

async function suspendAllInactive(exceptTabId = null) {
    const tabs = await chrome.tabs.query({});
    let count = 0;

    for (const tab of tabs) {
        if (tab.id !== exceptTabId && !tab.active) {
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
        console.error('Failed to whitelist site:', error);
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
        console.error(`[COUNTDOWN] Error getting countdown for tab ${tabId}:`, error);
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
        console.error('[COUNTDOWN] Error getting all countdowns:', error);
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
        console.log('[STATS] updateMemoryStats called for:', url);

        const result = await chrome.storage.local.get('memoryStats');
        const stats = result.memoryStats || { totalSaved: 0, tabsSuspended: 0, history: [] };

        console.log('[STATS] Before:', stats.totalSaved / (1024 * 1024), 'MB, tabs:', stats.tabsSuspended);

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
        console.log('[STATS] After:', stats.totalSaved / (1024 * 1024), 'MB, tabs:', stats.tabsSuspended);

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
                console.log('[STATS] Broadcast STATS_UPDATED');
            }
        } catch (broadcastError) {
            // Silently ignore broadcast errors - non-critical
        }
        // ========== END AGENT 2 ==========
    } catch (error) {
        console.error('[STATS] Failed to update memory stats:', error);
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

        console.log('[STATS] getStats - raw storage:', stats.totalSaved / (1024 * 1024), 'MB, history entries:', stats.history.length);

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

        console.log('[STATS] getStats returning:', response.totalSaved / (1024 * 1024), 'MB total,', response.todaySaved / (1024 * 1024), 'MB today');

        return response;
    } catch (error) {
        console.error('[STATS] Failed to get stats:', error);
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
        console.error('Failed to get tab list:', error);
        return [];
    }
}

// ============================================================================
// BADGE
// ============================================================================

async function updateBadge() {
    try {
        const tabs = await chrome.tabs.query({});
        const suspendedCount = tabs.filter(t => isSuspendedPage(t.url)).length;

        await chrome.action.setBadgeText({
            text: suspendedCount > 0 ? String(suspendedCount) : ''
        });

        await chrome.action.setBadgeBackgroundColor({ color: '#7C3BED' });
    } catch (error) {
        console.error('Failed to update badge:', error);
    }
}

// ============================================================================
// LICENSE VERIFICATION (Background)
// ============================================================================

const LICENSE_VERIFY_API = 'https://xggdjlurppfcytxqoozs.supabase.co/functions/v1/verify-extension-license';
const LICENSE_CHECK_ALARM = 'license-recheck';
const LICENSE_CHECK_INTERVAL_HOURS = 24;

// Set up periodic license verification alarm
async function setupLicenseVerification() {
    // Create alarm to check license every 24 hours
    await chrome.alarms.create(LICENSE_CHECK_ALARM, {
        periodInMinutes: LICENSE_CHECK_INTERVAL_HOURS * 60
    });
    console.log('[LICENSE] Background verification alarm set for every', LICENSE_CHECK_INTERVAL_HOURS, 'hours');
}

// Handle license check alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === LICENSE_CHECK_ALARM) {
        console.log('[LICENSE] Background license check triggered');
        await backgroundLicenseCheck();
    }
});

// Background license verification
async function backgroundLicenseCheck() {
    try {
        const data = await chrome.storage.local.get(['licenseKey', 'isPro', 'verifiedAt']);

        if (!data.isPro || !data.licenseKey) {
            console.log('[LICENSE] No Pro license to verify');
            return;
        }

        // Verify with server
        const response = await fetch(LICENSE_VERIFY_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                license_key: data.licenseKey,
                extension: 'tab_suspender_pro'
            }),
            signal: AbortSignal.timeout(15000)
        });

        if (!response.ok) {
            console.log('[LICENSE] Background check failed - server error');
            return; // Don't revoke on server errors, wait for next check
        }

        const result = await response.json();

        if (result.valid) {
            // Update verification timestamp
            await chrome.storage.local.set({
                verifiedAt: Date.now(),
                serverSignature: result.signature || data.serverSignature
            });
            console.log('[LICENSE] Background verification successful');
        } else {
            // License is no longer valid - revoke Pro status
            console.log('[LICENSE] Background verification FAILED - revoking Pro status');
            await chrome.storage.local.set({
                isPro: false,
                serverSignature: null
            });

            // Notify user via badge
            await chrome.action.setBadgeText({ text: '!' });
            await chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
        }
    } catch (error) {
        console.error('[LICENSE] Background check error:', error);
        // Don't revoke on network errors - wait for next check
    }
}

// ============================================================================
// STARTUP
// ============================================================================

(async () => {
    try {
        await loadSettings();
        startMonitoring();
        updateBadge();
        await setupLicenseVerification();
        console.log('Tab Suspender Pro: Background initialized successfully');
    } catch (error) {
        console.error('Tab Suspender Pro: Initialization failed:', error);
    }
})();
