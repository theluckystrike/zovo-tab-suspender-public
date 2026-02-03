/**
 * Tab Suspender Pro - Popup JavaScript
 * Handles tab list display and user interactions
 */

// DOM Elements - Core
const tabsList = document.getElementById('tabsList');
const memorySaved = document.getElementById('memorySaved');
const suspendedCount = document.getElementById('suspendedCount');
const totalTabCount = document.getElementById('totalTabCount');
const suspendAllBtn = document.getElementById('suspendAllBtn');
const restoreAllBtn = document.getElementById('restoreAllBtn');
const whitelistBtn = document.getElementById('whitelistBtn');
const settingsBtn = document.getElementById('settingsBtn');
const filterSelect = document.getElementById('filterSelect');

// DOM Elements - Hero Section
const heroEmotion = document.getElementById('heroEmotion');
const healthBarFill = document.getElementById('healthBarFill');
const healthPercent = document.getElementById('healthPercent');

// DOM Elements - Focus Mode Section
const focusTaxText = document.getElementById('focusTaxText');
const focusProBadge = document.getElementById('focusProBadge');
const focusLockIcon = document.getElementById('focusLockIcon');
const focusProof = document.getElementById('focusProof');

// DOM Elements - Tab List Section
const tabsToggle = document.getElementById('tabsToggle');
const tabsExpanded = document.getElementById('tabsExpanded');
const tabsSummaryText = document.getElementById('tabsSummaryText');
const tabsChevron = document.getElementById('tabsChevron');

// Community Edition - License modal elements removed

let currentFilter = 'all';
let tabsData = [];

// Focus Mode Elements
const focusModeBtn = document.getElementById('focusModeBtn');
const focusModeBtnText = document.getElementById('focusModeBtnText');
const focusModeActive = document.getElementById('focusModeActive');
const focusExitBtn = document.getElementById('focusExitBtn');
const focusSuspendedCount = document.getElementById('focusSuspendedCount');
const focusCurrentTab = document.getElementById('focusCurrentTab');
const windowCount = document.getElementById('windowCount');
// Removed: these elements no longer exist in UI
// const progressFill = document.getElementById('progressFill');
// const memoryChange = document.getElementById('memoryChange');
// const heroMessage = document.getElementById('heroMessage');

// Community Edition - Focus Mode fully unlocked
let isFocusModeActive = false;
let focusModeStartTime = null; // Track when Focus Mode was activated
let focusModeSuspendedTabs = []; // Track tabs suspended by Focus Mode for restoration

// Operation locks to prevent race conditions
let isOperationInProgress = false;

// Helper function to check if extension context is still valid
function isContextValid() {
    return chrome.runtime?.id !== undefined;
}

// Safe wrapper for chrome.runtime.sendMessage that handles context invalidation
async function safeSendMessage(message) {
    if (!isContextValid()) {
        return undefined;
    }
    try {
        return await chrome.runtime.sendMessage(message);
    } catch (e) {
        // Context invalidated - extension was reloaded/updated
        if (e.message?.includes('Extension context invalidated') ||
            e.message?.includes('message port closed')) {
            return undefined;
        }
        throw e;
    }
}

// ========== AGENT 1: COUNTDOWN INDICATOR ==========
// Countdown state
let countdownInterval = null;
let currentCountdown = null;

// Feature flag - can be disabled via storage
const COUNTDOWN_FEATURE_ENABLED = true; // Will check storage for override
// ========== END AGENT 1 STATE ==========

// ========== AGENT 3: EXCLUSION FEEDBACK ==========
// Feature flag for exclusion feedback
const EXCLUSION_FEEDBACK_ENABLED = true; // Will check storage for override

// Exclusion reasons with labels and icons
const EXCLUSION_REASONS = {
  whitelist: { label: 'Whitelisted', icon: '✓', priority: 1 },
  pinned: { label: 'Pinned', icon: '📌', priority: 2 },
  audio: { label: 'Playing audio', icon: '🔊', priority: 3 },
  forms: { label: 'Unsaved forms', icon: '📝', priority: 4 },
  active: { label: 'Active tab', icon: '👁', priority: 5 },
  alreadySuspended: { label: 'Already suspended', icon: '💤', priority: 6 },
  systemPages: { label: 'System pages', icon: '⚙️', priority: 7 }
};

// Toast state
let toastState = {
  isVisible: false,
  isExpanded: false,
  autoHideTimer: null
};
// ========== END AGENT 3 STATE ==========

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Popup loaded - Community Edition');
    await loadFocusModeData();
    await loadStats();
    await loadTabs();
    setupEventListeners();
    setupFocusModeListeners();

    // ========== AGENT 1: COUNTDOWN INDICATOR INIT ==========
    await initCountdownIndicator();
    // ========== END AGENT 1 INIT ==========

    // ========== AGENT 3: EXCLUSION FEEDBACK INIT ==========
    initExclusionFeedback();
    // ========== END AGENT 3 INIT ==========
});

// Event Listeners
function setupEventListeners() {
    if (suspendAllBtn) suspendAllBtn.addEventListener('click', handleSuspendAll);
    if (restoreAllBtn) restoreAllBtn.addEventListener('click', handleRestoreAll);
    if (whitelistBtn) whitelistBtn.addEventListener('click', handleWhitelist);
    if (settingsBtn) settingsBtn.addEventListener('click', handleSettings);
    if (filterSelect) filterSelect.addEventListener('change', handleFilterChange);

    // Tab list toggle
    if (tabsToggle) {
        tabsToggle.addEventListener('click', toggleTabsList);
    }

    // Initialize tab list state from storage
    initTabListState();
}

// Toggle tab list expand/collapse
async function toggleTabsList() {
    const isExpanded = tabsExpanded && tabsExpanded.style.display !== 'none';

    if (tabsExpanded) {
        tabsExpanded.style.display = isExpanded ? 'none' : 'block';
    }

    if (tabsChevron) {
        tabsChevron.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
    }

    // Save preference to storage
    try {
        await chrome.storage.local.set({ tabListExpanded: !isExpanded });
    } catch (e) {
        console.log('Could not save tab list preference:', e);
    }
}

// Initialize tab list state from storage
async function initTabListState() {
    try {
        const result = await chrome.storage.local.get('tabListExpanded');
        const isExpanded = result.tabListExpanded || false;

        if (tabsExpanded) {
            tabsExpanded.style.display = isExpanded ? 'block' : 'none';
        }

        if (tabsChevron) {
            tabsChevron.style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
        }
    } catch (e) {
        console.log('Could not load tab list preference:', e);
    }
}

// Community Edition - License functions removed

// Load Statistics - direct from storage as fallback
async function loadStats() {
    console.log('[STATS] loadStats called');
    try {
        // Try messaging first
        try {
            const response = await safeSendMessage({ type: 'GET_STATS' });
            console.log('[STATS] Background response:', response);
            if (response && !response.error) {
                updateStatsDisplay(response);
                return;
            }
        } catch (e) {
            console.log('[STATS] Message failed, using direct storage:', e);
        }

        // Fallback: read directly from storage
        const result = await chrome.storage.local.get('memoryStats');
        console.log('[STATS] Direct storage read:', result);
        const stats = result.memoryStats || { totalSaved: 0, tabsSuspended: 0, history: [] };

        const today = new Date().toDateString();
        const todaySaved = (stats.history || [])
            .filter(h => new Date(h.timestamp).toDateString() === today)
            .reduce((sum, h) => sum + h.memorySaved, 0);

        const allTabs = await chrome.tabs.query({});
        const suspended = allTabs.filter(t => t.url && t.url.includes('suspended.html')).length;

        updateStatsDisplay({
            totalSaved: stats.totalSaved || 0,
            todaySaved: todaySaved,
            tabsSuspended: suspended,
            totalTabs: allTabs.length
        });
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Update Stats Display
async function updateStatsDisplay(stats) {
    const todayBytes = stats.todaySaved || 0;
    const totalTabs = stats.totalTabs || 0;
    const suspended = stats.tabsSuspended || 0;

    // Hero value - memory saved
    if (memorySaved) {
        memorySaved.textContent = formatBytes(todayBytes);
    }

    // Hero emotional copy
    if (heroEmotion) {
        heroEmotion.textContent = getEmotionalCopy(todayBytes);
    }

    // Health bar - calculate percentage based on suspended tabs
    if (healthBarFill && healthPercent) {
        const percentage = totalTabs > 0 ? Math.round((suspended / totalTabs) * 100) : 0;
        healthBarFill.style.width = percentage + '%';
        healthPercent.textContent = percentage + '%';
    }

    // Stats
    if (suspendedCount) suspendedCount.textContent = suspended;
    if (totalTabCount) totalTabCount.textContent = totalTabs;

    // Window count
    if (windowCount) {
        const windows = await chrome.windows.getAll();
        const count = windows.length;
        windowCount.textContent = count;
    }

    // Update tab summary text
    if (tabsSummaryText) {
        const windows = await chrome.windows.getAll();
        const windowCnt = windows.length;
        tabsSummaryText.textContent = `${totalTabs} tabs across ${windowCnt} ${windowCnt === 1 ? 'window' : 'windows'}`;
    }

    // Update focus tax
    updateFocusTax(totalTabs - suspended); // Active tabs = total - suspended
}

// REMOVED: Dead code - getYesterdayMemory() was never called
// REMOVED: Dead code - getHeroMessage() was never called

// Get emotional copy based on bytes saved (for hero section)
function getEmotionalCopy(bytes) {
    const gb = bytes / (1024 * 1024 * 1024);
    const mb = bytes / (1024 * 1024);

    if (gb >= 2) return "Beast mode. Your RAM is loving this 💪";
    if (gb >= 1) return "Your browser thanks you 🙏";
    if (mb >= 500) return "Your browser is breathing easier";
    if (mb >= 100) return "Getting warmer...";
    if (mb >= 50) return "Every MB counts";
    return "Suspend tabs to free memory";
}

// Update focus tax display based on tab count
function updateFocusTax(tabCount) {
    if (!focusTaxText) return;

    const bandwidthLost = tabCount * 4;
    const cappedBandwidth = Math.min(bandwidthLost, 100);

    focusTaxText.textContent = `${tabCount} tabs open = ${cappedBandwidth}% bandwidth lost`;

    // Update styling based on severity
    const focusTax = document.getElementById('focusTax');
    if (focusTax) {
        if (bandwidthLost >= 50) {
            focusTax.style.color = '#EF4444'; // Red for critical
        } else if (bandwidthLost >= 25) {
            focusTax.style.color = '#F59E0B'; // Orange for warning
        } else {
            focusTax.style.color = 'var(--text-secondary)';
        }
    }
}

// Load Tabs - direct from Chrome API as fallback
async function loadTabs() {
    try {
        if (tabsList) tabsList.innerHTML = '<div class="loading">Loading tabs...</div>';

        // Try messaging first
        let windows = null;
        try {
            const response = await safeSendMessage({ type: 'GET_TAB_LIST' });
            if (response && Array.isArray(response) && response.length > 0) {
                windows = response;
            }
        } catch (e) {
            console.log('Message failed, using direct API:', e);
        }

        // Fallback: use Chrome API directly
        if (!windows) {
            const chromeWindows = await chrome.windows.getAll({ populate: true });
            windows = chromeWindows.map(win => ({
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
                    status: (tab.url && tab.url.includes('suspended.html')) ? 'suspended' : (tab.active ? 'active' : 'idle')
                }))
            }));
        }

        if (!windows || windows.length === 0) {
            if (tabsList) tabsList.innerHTML = '<div class="empty-state"><p>No tabs found</p></div>';
            return;
        }

        tabsData = windows;
        renderTabs(windows);
    } catch (error) {
        console.error('Error loading tabs:', error);
        if (tabsList) tabsList.innerHTML = '<div class="empty-state"><p>Error: ' + error.message + '</p></div>';
    }
}

// Render Tabs
function renderTabs(windows) {
    if (!tabsList) return;
    tabsList.innerHTML = '';

    windows.forEach((win, winIndex) => {
        const windowGroup = document.createElement('div');
        windowGroup.className = 'window-group';

        // Window header
        const windowHeader = document.createElement('div');
        windowHeader.className = 'window-header';
        windowHeader.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="3" y1="9" x2="21" y2="9"></line>
      </svg>
      Window ${winIndex + 1}
      ${win.focused ? '<span class="window-badge">Active</span>' : ''}
    `;
        windowGroup.appendChild(windowHeader);

        // Filter tabs
        let filteredTabs = win.tabs || [];
        if (currentFilter !== 'all') {
            filteredTabs = filteredTabs.filter(tab => tab.status === currentFilter);
        }

        // Tab items
        filteredTabs.forEach(tab => {
            const tabItem = createTabItem(tab);
            windowGroup.appendChild(tabItem);
        });

        if (filteredTabs.length > 0) {
            tabsList.appendChild(windowGroup);
        }
    });

    if (tabsList.children.length === 0) {
        tabsList.innerHTML = '<div class="empty-state"><p>No tabs match the filter</p></div>';
    }
}

// Create Tab Item Element
function createTabItem(tab) {
    const item = document.createElement('div');
    item.className = `tab-item ${tab.status}`;
    item.dataset.tabId = tab.id;

    const favicon = tab.favIconUrl || '';
    const domain = getDomain(tab.url);

    item.innerHTML = `
    <img
      src="${favicon}"
      class="tab-favicon ${!favicon ? 'placeholder' : ''}"
      alt=""
    >
    <div class="tab-info">
      <div class="tab-title">${escapeHtml(tab.title || 'Untitled')}</div>
      <div class="tab-url">${escapeHtml(domain)}</div>
    </div>
    <span class="tab-status ${tab.status}">${tab.status}</span>
    <button class="tab-action" data-action="${tab.status === 'suspended' ? 'restore' : 'suspend'}">
      ${tab.status === 'suspended' ? 'Restore' : 'Suspend'}
    </button>
  `;

    // Handle favicon load error
    const faviconImg = item.querySelector('.tab-favicon');
    faviconImg.onerror = function() {
        this.src = '';
        this.classList.add('placeholder');
    };

    // Tab click - switch to tab
    item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('tab-action')) {
            chrome.tabs.update(tab.id, { active: true });
            if (tab.windowId) {
                chrome.windows.update(tab.windowId, { focused: true });
            }
        }
    });

    // Action button click
    const actionBtn = item.querySelector('.tab-action');
    actionBtn.addEventListener('click', async (e) => {
        e.stopPropagation();

        const action = actionBtn.dataset.action;
        if (action === 'suspend') {
            const whitelistedDomains = await getWhitelistSettings();
            if (isUrlWhitelisted(tab.url, whitelistedDomains)) {
                // Show feedback that tab is whitelisted
                actionBtn.textContent = 'Whitelisted';
                actionBtn.disabled = true;
                setTimeout(() => {
                    actionBtn.textContent = 'Suspend';
                    actionBtn.disabled = false;
                }, 1500);
                return;
            }
            await suspendTabDirect(tab.id, tab.url, tab.title, tab.favIconUrl, whitelistedDomains);
        } else {
            await restoreTabDirect(tab.id, tab.url);
        }

        // Reload tabs
        setTimeout(() => {
            loadStats();
            loadTabs();
        }, 300);
    });

    return item;
}

// Get whitelist settings from storage
async function getWhitelistSettings() {
    try {
        const result = await chrome.storage.sync.get('tabSuspenderSettings');
        return result.tabSuspenderSettings?.whitelistedDomains || [];
    } catch (error) {
        console.error('[WHITELIST] Failed to get whitelist settings:', error);
        return [];
    }
}

// Check if URL is whitelisted
function isUrlWhitelisted(url, whitelistedDomains) {
    if (!url || !whitelistedDomains || whitelistedDomains.length === 0) {
        return false;
    }

    try {
        const urlObj = new URL(url);
        let hostname = urlObj.hostname.toLowerCase();

        // Normalize www prefix
        const hostnameWithoutWww = hostname.startsWith('www.') ? hostname.slice(4) : hostname;

        return whitelistedDomains.some(domain => {
            const d = domain.toLowerCase();
            const domainWithoutWww = d.startsWith('www.') ? d.slice(4) : d;

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

// Direct suspend function (fallback)
async function suspendTabDirect(tabId, url, title, favicon, whitelistedDomains = null) {
    try {
        // Don't suspend internal pages or already suspended
        if (isInternalUrl(url) || url.includes('suspended.html')) {
            return false;
        }

        // Check whitelist if domains provided
        if (whitelistedDomains && isUrlWhitelisted(url, whitelistedDomains)) {
            console.log('[SUSPEND] Tab is whitelisted, skipping:', url);
            return false;
        }

        const params = new URLSearchParams({
            url: url,
            title: title || 'Suspended Tab',
            favicon: encodeURIComponent(favicon || ''),
            time: Date.now()
        });

        const suspendedUrl = chrome.runtime.getURL(`suspended.html?${params.toString()}`);
        await chrome.tabs.update(tabId, { url: suspendedUrl });

        // Update stats locally since we're bypassing background.js suspendTab()
        await updateMemoryStatsLocal(url);

        return true;
    } catch (error) {
        console.error('Failed to suspend tab:', error);
        return false;
    }
}

// Update memory stats locally (mirrors background.js logic)
async function updateMemoryStatsLocal(url) {
    try {
        console.log('[STATS] updateMemoryStatsLocal called for:', url);

        const result = await chrome.storage.local.get('memoryStats');
        const stats = result.memoryStats || { totalSaved: 0, tabsSuspended: 0, history: [] };

        console.log('[STATS] Before update:', JSON.stringify(stats));

        const estimatedMemory = 50 * 1024 * 1024; // 50MB per tab

        stats.totalSaved += estimatedMemory;
        stats.tabsSuspended++;
        stats.history.push({
            timestamp: Date.now(),
            url: url || 'unknown',
            memorySaved: estimatedMemory
        });

        // Keep history to last 500 entries
        if (stats.history.length > 500) {
            stats.history = stats.history.slice(-500);
        }

        await chrome.storage.local.set({ memoryStats: stats });
        console.log('[STATS] After update - Total saved:', stats.totalSaved / (1024 * 1024), 'MB, Tabs:', stats.tabsSuspended);
    } catch (error) {
        console.error('[STATS] Failed to update memory stats:', error);
    }
}

// Direct restore function (fallback)
async function restoreTabDirect(tabId, currentUrl) {
    try {
        if (!currentUrl.includes('suspended.html')) {
            await chrome.tabs.reload(tabId);
            return;
        }

        const urlObj = new URL(currentUrl);
        const originalUrl = urlObj.searchParams.get('url');

        if (originalUrl) {
            await chrome.tabs.update(tabId, { url: originalUrl });
        }
    } catch (error) {
        console.error('Failed to restore tab:', error);
    }
}

// Handle Suspend All (Enhanced with Exclusion Feedback - AGENT 3)
async function handleSuspendAll() {
    // Prevent race conditions
    if (isOperationInProgress) return;
    isOperationInProgress = true;

    suspendAllBtn.disabled = true;
    suspendAllBtn.textContent = 'Suspending...';

    try {
        // Check if exclusion feedback feature is enabled
        let featureEnabled = EXCLUSION_FEEDBACK_ENABLED;
        try {
            const flagsResult = await chrome.storage.local.get('feature_flags_override');
            const overrides = flagsResult.feature_flags_override || {};
            if (overrides.EXCLUSION_FEEDBACK === false) {
                featureEnabled = false;
            }
        } catch (e) {
            // Continue with default
        }

        if (featureEnabled) {
            // Use enhanced suspend all with exclusion feedback
            await handleSuspendAllEnhanced();
        } else {
            // Fallback to basic suspend all
            await handleSuspendAllBasic();
        }

    } catch (error) {
        console.error('Error suspending all:', error);
        suspendAllBtn.disabled = false;
        isOperationInProgress = false;
    }
}

// Basic suspend all (fallback without feedback)
async function handleSuspendAllBasic() {
    try {
        // Get whitelist and other settings
        const settingsResult = await chrome.storage.sync.get('tabSuspenderSettings');
        const settings = settingsResult.tabSuspenderSettings || {};
        const whitelistedDomains = settings.whitelistedDomains || [];
        const neverSuspendPinned = settings.suspendPinnedTabs === false;
        const neverSuspendAudio = settings.neverSuspendAudio !== false;

        const tabs = await chrome.tabs.query({ active: false });
        let suspendedCount = 0;

        for (const tab of tabs) {
            // Skip if no URL
            if (!tab.url) continue;

            // Skip internal pages
            if (isInternalUrl(tab.url)) continue;

            // Skip already suspended
            if (tab.url.includes('suspended.html')) continue;

            // Skip whitelisted domains
            if (isUrlWhitelisted(tab.url, whitelistedDomains)) {
                console.log('[SUSPEND] Skipping whitelisted:', tab.url);
                continue;
            }

            // Skip pinned tabs if setting enabled
            if (neverSuspendPinned && tab.pinned) {
                console.log('[SUSPEND] Skipping pinned tab:', tab.title);
                continue;
            }

            // Skip audio tabs if setting enabled
            if (neverSuspendAudio && tab.audible) {
                console.log('[SUSPEND] Skipping audio tab:', tab.title);
                continue;
            }

            const success = await suspendTabDirect(tab.id, tab.url, tab.title, tab.favIconUrl, whitelistedDomains);
            if (success) suspendedCount++;
        }

        console.log('[SUSPEND] Basic suspend completed:', suspendedCount, 'tabs suspended');

        setTimeout(() => {
            loadStats();
            loadTabs();
            resetSuspendAllButton();
            isOperationInProgress = false;
        }, 500);
    } catch (error) {
        console.error('Error in basic suspend all:', error);
        resetSuspendAllButton();
        isOperationInProgress = false;
    }
}

// Enhanced suspend all with exclusion feedback (AGENT 3)
async function handleSuspendAllEnhanced() {
    try {
        console.log('[EXCLUSION] Starting enhanced suspend all...');

        // Step 1: Analyze all tabs for exclusions
        const report = await analyzeTabExclusions();
        console.log('[EXCLUSION] Analysis:', {
            total: report.total,
            suspendable: report.suspendable,
            excluded: report.excluded,
            byReason: {
                whitelist: report.byReason.whitelist.count,
                pinned: report.byReason.pinned.count,
                audio: report.byReason.audio.count,
                forms: report.byReason.forms.count,
                active: report.byReason.active.count,
                alreadySuspended: report.byReason.alreadySuspended.count,
                systemPages: report.byReason.systemPages.count
            }
        });

        // Get whitelist for double-checking
        const whitelistedDomains = await getWhitelistSettings();

        // Step 2: Suspend all suspendable tabs
        let actualSuspended = 0;
        for (const tab of report.suspendableTabs) {
            try {
                const fullTab = await chrome.tabs.get(tab.id);
                const success = await suspendTabDirect(
                    fullTab.id,
                    fullTab.url,
                    fullTab.title,
                    fullTab.favIconUrl,
                    whitelistedDomains
                );
                if (success) actualSuspended++;
            } catch (e) {
                console.warn('[EXCLUSION] Tab unavailable:', tab.id);
            }
        }

        console.log('[EXCLUSION] Suspended:', actualSuspended, 'tabs');
        console.log('[EXCLUSION] Summary: Tried to suspend', report.suspendableTabs.length, 'tabs, actually suspended:', actualSuspended);

        // Step 3: Show feedback toast
        showExclusionToast(report, actualSuspended);

        // Step 4: Store action for later retrieval
        await storeLastSuspendAction(report, actualSuspended);

        // Step 5: Reload UI
        setTimeout(() => {
            loadStats();
            loadTabs();
            resetSuspendAllButton();
            isOperationInProgress = false;
        }, 500);

    } catch (error) {
        console.error('[EXCLUSION] Enhanced suspend all failed:', error);
        // Fallback to basic
        await handleSuspendAllBasic();
    }
}

// Reset suspend all button to default state
function resetSuspendAllButton() {
    if (suspendAllBtn) {
        suspendAllBtn.disabled = false;
        suspendAllBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="6" y="4" width="4" height="16"></rect>
            <rect x="14" y="4" width="4" height="16"></rect>
          </svg>
          <span>Suspend All Tabs</span>
        `;
    }
}

// Check if URL is internal/special and should not be suspended
function isInternalUrl(url) {
    if (!url) return false; // undefined URLs are NOT system pages - this was the bug!
    const internalPrefixes = [
        'chrome://', 'chrome-extension://', 'chrome-search://',
        'edge://', 'about:', 'file://', 'data:', 'blob:',
        'javascript:', 'view-source:', 'devtools://',
        'brave://', 'opera://', 'vivaldi://'
    ];
    return internalPrefixes.some(prefix => url.startsWith(prefix));
}

// Handle Restore All
async function handleRestoreAll() {
    // Prevent race conditions
    if (isOperationInProgress) return;
    isOperationInProgress = true;

    restoreAllBtn.disabled = true;
    restoreAllBtn.textContent = 'Restoring...';

    try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            if (tab.url && tab.url.includes('suspended.html')) {
                await restoreTabDirect(tab.id, tab.url);
            }
        }

        setTimeout(() => {
            loadStats();
            loadTabs();
            restoreAllBtn.disabled = false;
            restoreAllBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Restore All
      `;
            isOperationInProgress = false;
        }, 500);
    } catch (error) {
        console.error('Error restoring all:', error);
        restoreAllBtn.disabled = false;
        isOperationInProgress = false;
    }
}

// Handle Whitelist
async function handleWhitelist() {
    try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Check if we have a valid tab with URL
        if (!activeTab) {
            showWhitelistError('No active tab found');
            return;
        }

        if (!activeTab.url) {
            showWhitelistError('Cannot whitelist this page');
            return;
        }

        // Check for internal/restricted URLs
        const url = activeTab.url;
        if (url.startsWith('chrome://') ||
            url.startsWith('chrome-extension://') ||
            url.startsWith('about:') ||
            url.startsWith('edge://') ||
            url.startsWith('brave://')) {
            showWhitelistError('Cannot whitelist browser pages');
            return;
        }

        const domain = getDomain(activeTab.url);

        if (!domain || domain === 'Unknown') {
            showWhitelistError('Invalid domain');
            return;
        }

        // Save to storage directly with try-catch
        let result;
        try {
            result = await chrome.storage.sync.get('tabSuspenderSettings');
        } catch (storageError) {
            console.error('[WHITELIST] Failed to read settings:', storageError);
            showWhitelistError('Failed to read settings');
            return;
        }
        const settings = result.tabSuspenderSettings || { whitelistedDomains: [] };

        // Check if already whitelisted
        if (settings.whitelistedDomains.includes(domain)) {
            showWhitelistSuccess(domain, true); // Already whitelisted
            return;
        }

        settings.whitelistedDomains.push(domain);
        try {
            await chrome.storage.sync.set({ tabSuspenderSettings: settings });
        } catch (storageError) {
            console.error('[WHITELIST] Failed to save settings:', storageError);
            showWhitelistError('Failed to save whitelist');
            return;
        }

        // Notify background.js to reload config (for immediate effect on running timers)
        try {
            await safeSendMessage({ type: 'RELOAD_CONFIG' });
            console.log('[WHITELIST] Notified background to reload config');
        } catch (e) {
            // Background might not be listening for this, that's okay - storage.onChanged will handle it
            console.log('[WHITELIST] Background notification failed (using storage fallback):', e);
        }

        showWhitelistSuccess(domain, false);

    } catch (error) {
        console.error('[WHITELIST] Error whitelisting:', error);
        showWhitelistError('Failed to whitelist');
    }
}

// Show whitelist success feedback
function showWhitelistSuccess(domain, alreadyWhitelisted) {
    const message = alreadyWhitelisted ? 'Already protected' : `${domain} protected`;

    whitelistBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        ${alreadyWhitelisted ? 'Protected' : 'Added!'}
      `;
    whitelistBtn.style.borderColor = '#22c55e';
    whitelistBtn.style.color = '#22c55e';
    whitelistBtn.title = message;

    setTimeout(() => {
        whitelistBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
          Whitelist
        `;
        whitelistBtn.style.borderColor = '';
        whitelistBtn.style.color = '';
        whitelistBtn.title = 'Whitelist current site';
    }, 2000);
}

// Show whitelist error feedback
function showWhitelistError(message) {
    whitelistBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
        Can't add
      `;
    whitelistBtn.style.borderColor = '#ef4444';
    whitelistBtn.style.color = '#ef4444';
    whitelistBtn.title = message;

    setTimeout(() => {
        whitelistBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
          Whitelist
        `;
        whitelistBtn.style.borderColor = '';
        whitelistBtn.style.color = '';
        whitelistBtn.title = 'Whitelist current site';
    }, 2000);
}

// Handle Settings
function handleSettings() {
    chrome.runtime.openOptionsPage();
}

// Handle Filter Change
function handleFilterChange() {
    currentFilter = filterSelect.value;
    renderTabs(tabsData);
}

// Utility Functions
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 MB';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getDomain(url) {
    try {
        if (!url) return 'Unknown';
        if (url.includes('suspended.html')) {
            const params = new URLSearchParams(url.split('?')[1]);
            const originalUrl = params.get('url');
            if (originalUrl) {
                return new URL(originalUrl).hostname;
            }
        }
        return new URL(url).hostname;
    } catch {
        return url || 'Unknown';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== AGENT 1: COUNTDOWN INDICATOR FUNCTIONS ==========

/**
 * Initialize the countdown indicator for the current active tab
 */
async function initCountdownIndicator() {
    // Check if feature is enabled
    if (!COUNTDOWN_FEATURE_ENABLED) {
        console.log('[COUNTDOWN] Feature disabled');
        return;
    }

    try {
        // Check storage for feature flag override
        const flagsResult = await chrome.storage.local.get('feature_flags_override');
        const overrides = flagsResult.feature_flags_override || {};
        if (overrides.COUNTDOWN_INDICATOR === false) {
            console.log('[COUNTDOWN] Feature disabled via storage override');
            hideCountdownContainer();
            return;
        }
    } catch (e) {
        // Continue if storage check fails
    }

    console.log('[COUNTDOWN] Initializing countdown indicator');

    // Start countdown updates
    startCountdownUpdates();
}

/**
 * Start the countdown update interval
 */
function startCountdownUpdates() {
    // Clear any existing interval
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    // Update immediately
    updateCountdownDisplay();

    // Update every second
    countdownInterval = setInterval(updateCountdownDisplay, 1000);
}

/**
 * Stop the countdown update interval
 */
function stopCountdownUpdates() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

/**
 * Update the countdown display for the current active tab
 */
async function updateCountdownDisplay() {
    try {
        // Get the current active tab
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!activeTab) {
            showCountdownPaused('No active tab');
            return;
        }

        // Get countdown for this tab
        const countdown = await safeSendMessage({
            type: 'GET_TAB_COUNTDOWN',
            tabId: activeTab.id
        });

        currentCountdown = countdown;

        // Update the display
        renderCountdown(countdown);

    } catch (error) {
        console.error('[COUNTDOWN] Error updating display:', error);
        showCountdownPaused('Error');
    }
}

/**
 * Render the countdown to the UI
 * @param {object} countdown - Countdown data
 */
function renderCountdown(countdown) {
    const container = document.getElementById('countdown-container');
    const timeSpan = document.getElementById('countdown-time');

    if (!container || !timeSpan) return;

    if (!countdown || countdown.isPaused || countdown.remainingMs < 0) {
        // Show paused state
        showCountdownPaused('Paused');
        return;
    }

    const { remainingMs } = countdown;

    // Format the time
    const formattedTime = formatCountdownTime(remainingMs);

    // Update the display
    timeSpan.textContent = formattedTime;

    // Get the state for styling
    const state = getCountdownState(remainingMs);

    // Update label based on state
    const labelSpan = container.querySelector('.countdown-label');
    if (labelSpan) {
        labelSpan.textContent = 'Suspends in:';
    }

    // Update container classes
    const indicator = container.querySelector('.countdown-indicator');
    if (indicator) {
        indicator.classList.remove('normal', 'warning', 'critical', 'paused');
        indicator.classList.add(state);
    }
}

/**
 * Show the countdown in paused state
 * @param {string} message - Message to display
 */
function showCountdownPaused(message = 'Paused') {
    const container = document.getElementById('countdown-container');
    const timeSpan = document.getElementById('countdown-time');
    const labelSpan = container?.querySelector('.countdown-label');

    if (timeSpan) {
        timeSpan.textContent = message;
    }

    if (labelSpan) {
        labelSpan.textContent = 'Timer:';
    }

    const indicator = container?.querySelector('.countdown-indicator');
    if (indicator) {
        indicator.classList.remove('normal', 'warning', 'critical');
        indicator.classList.add('paused');
    }
}

/**
 * Hide the countdown container
 */
function hideCountdownContainer() {
    const container = document.getElementById('countdown-container');
    if (container) {
        container.style.display = 'none';
    }
}

/**
 * Format remaining milliseconds as a human-readable string
 * @param {number} remainingMs - Remaining time in milliseconds
 * @returns {string} Formatted time (e.g., "5:23", "45s")
 */
function formatCountdownTime(remainingMs) {
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
 * @param {number} remainingMs - Remaining time in milliseconds
 * @returns {string} State: 'normal', 'warning', 'critical', or 'paused'
 */
function getCountdownState(remainingMs) {
    const WARNING_THRESHOLD_MS = 30 * 1000;  // 30 seconds
    const CRITICAL_THRESHOLD_MS = 10 * 1000; // 10 seconds

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

// Clean up countdown interval when popup closes
window.addEventListener('unload', () => {
    stopCountdownUpdates();
});

// ========== END AGENT 1: COUNTDOWN INDICATOR FUNCTIONS ==========

// ========== AGENT 3: EXCLUSION FEEDBACK FUNCTIONS ==========

/**
 * Initialize exclusion feedback system
 */
function initExclusionFeedback() {
    if (!EXCLUSION_FEEDBACK_ENABLED) {
        console.log('[EXCLUSION] Feature disabled');
        return;
    }

    // Setup toast event listeners
    setupToastEventListeners();
    console.log('[EXCLUSION] Feedback system initialized');
}

/**
 * Setup event listeners for the toast component
 */
function setupToastEventListeners() {
    const toast = document.getElementById('exclusion-toast');
    if (!toast) return;

    // Close button
    const closeBtn = document.getElementById('exclusion-toast-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', hideExclusionToast);
        closeBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                hideExclusionToast();
            }
        });
    }

    // Details toggle button
    const toggleBtn = document.getElementById('exclusion-details-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleExclusionDetails);
        toggleBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleExclusionDetails();
            }
        });
    }

    // Escape key to close
    toast.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideExclusionToast();
        }
    });
}

/**
 * Analyze all tabs in current window for exclusions
 * @returns {Object} Exclusion report
 */
async function analyzeTabExclusions() {
    console.log('[EXCLUSION] analyzeTabExclusions() called');

    // Get settings with try-catch error handling
    let settingsResult = {};
    try {
        settingsResult = await chrome.storage.sync.get('tabSuspenderSettings');
    } catch (error) {
        console.error('[EXCLUSION] Failed to load settings from storage:', error);
        // Continue with empty settings - will use defaults
    }
    console.log('[EXCLUSION] Raw settings from storage:', settingsResult);

    const settings = settingsResult.tabSuspenderSettings || {
        suspensionTimeout: 30,
        autoUnsuspendOnFocus: true,
        suspendPinnedTabs: false,
        whitelistedDomains: [],  // FIXED: Empty default, not pre-populated
        neverSuspendAudio: true,
        neverSuspendActiveTab: true
    };

    console.log('[EXCLUSION] Settings used:', {
        whitelistedDomains: settings.whitelistedDomains,
        whitelistCount: settings.whitelistedDomains?.length || 0,
        suspendPinnedTabs: settings.suspendPinnedTabs,
        neverSuspendAudio: settings.neverSuspendAudio,
        neverSuspendActiveTab: settings.neverSuspendActiveTab
    });

    // Get form status from storage
    let formStatus = {};
    try {
        const formResult = await chrome.storage.session.get('tabFormStatus');
        formStatus = formResult.tabFormStatus || {};
    } catch {
        const formResult = await chrome.storage.local.get('tabFormStatus');
        formStatus = formResult.tabFormStatus || {};
    }

    // Query ALL tabs across ALL windows
    const tabs = await chrome.tabs.query({});

    console.log('[EXCLUSION] Tabs query returned:', tabs.length, 'tabs');
    console.log('[EXCLUSION] First 3 tabs raw data:', tabs.slice(0, 3).map(t => ({
        id: t.id,
        url: t.url,
        title: t.title?.substring(0, 30),
        active: t.active,
        windowId: t.windowId
    })));

    // Initialize report
    const report = {
        total: tabs.length,
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

    // Analyze each tab
    for (const tab of tabs) {
        const reason = getTabExclusionReason(tab, settings, formStatus);

        // Debug: log each tab's exclusion reason
        console.log('[EXCLUSION] Tab:', {
            id: tab.id,
            title: tab.title?.substring(0, 30),
            url: tab.url?.substring(0, 50),
            active: tab.active,
            pinned: tab.pinned,
            audible: tab.audible,
            reason: reason || 'SUSPENDABLE'
        });

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
}

/**
 * Get the exclusion reason for a tab
 * @param {Object} tab - Tab object
 * @param {Object} settings - Current settings
 * @param {Object} formStatus - Form status map
 * @returns {string|null} Exclusion reason or null
 */
function getTabExclusionReason(tab, settings, formStatus) {
    // Already suspended
    if (tab.url && tab.url.includes('suspended.html')) {
        return 'alreadySuspended';
    }

    // Active tab
    if (tab.active && settings.neverSuspendActiveTab === true) {
        return 'active';
    }

    // System/internal pages
    if (isInternalUrl(tab.url)) {
        return 'systemPages';
    }

    // Pinned tabs
    if (tab.pinned && !settings.suspendPinnedTabs) {
        return 'pinned';
    }

    // Playing audio
    if (tab.audible && settings.neverSuspendAudio === true) {
        return 'audio';
    }

    // Whitelisted domain
    if (isTabWhitelisted(tab.url, settings.whitelistedDomains)) {
        return 'whitelist';
    }

    // Unsaved forms
    if (formStatus[tab.id] === true) {
        return 'forms';
    }

    return null;
}

/**
 * Check if a URL is whitelisted
 * @param {string} url - URL to check
 * @param {string[]} whitelistedDomains - Whitelist array
 * @returns {boolean}
 */
function isTabWhitelisted(url, whitelistedDomains) {
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
 * Show the exclusion feedback toast
 * @param {Object} report - Exclusion report
 * @param {number} actualSuspended - Number actually suspended
 */
function showExclusionToast(report, actualSuspended) {
    const toast = document.getElementById('exclusion-toast');
    const messageEl = document.getElementById('exclusion-message');
    const detailsContainer = toast?.querySelector('.toast-details-container');

    if (!toast || !messageEl) {
        console.warn('[EXCLUSION] Toast elements not found');
        return;
    }

    // Build message
    const suspendedText = actualSuspended === 1
        ? '1 tab suspended'
        : `${actualSuspended} tabs suspended`;

    const excludedCount = report.excluded;
    const excludedText = excludedCount > 0
        ? ` · ${excludedCount} excluded`
        : '';

    messageEl.textContent = suspendedText + excludedText;

    // Get non-empty reasons
    const nonEmptyReasons = Object.entries(report.byReason)
        .filter(([_, data]) => data.count > 0)
        .map(([key, data]) => ({
            key,
            reason: EXCLUSION_REASONS[key],
            count: data.count,
            tabs: data.tabs
        }))
        .sort((a, b) => a.reason.priority - b.reason.priority);

    // Show/hide details button
    if (detailsContainer) {
        if (nonEmptyReasons.length > 0) {
            detailsContainer.style.display = 'block';
            renderExclusionReasons(nonEmptyReasons);
        } else {
            detailsContainer.style.display = 'none';
        }
    }

    // Reset expanded state
    toastState.isExpanded = false;
    const details = document.getElementById('exclusion-details');
    const toggleBtn = document.getElementById('exclusion-details-toggle');
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
    toast.classList.remove('expanded');

    // Show toast with animation
    toastState.isVisible = true;
    toast.classList.remove('fadeout');
    toast.classList.add('visible');

    // Start auto-hide timer
    startToastAutoHide();

    // Focus close button for accessibility
    const closeBtn = document.getElementById('exclusion-toast-close');
    if (closeBtn) {
        closeBtn.focus();
    }

    console.log('[EXCLUSION] Toast shown:', { actualSuspended, excluded: excludedCount });
}

/**
 * Render the exclusion reasons list
 * @param {Array} reasons - Non-empty reasons
 */
function renderExclusionReasons(reasons) {
    const list = document.getElementById('exclusion-reasons-list');
    if (!list) return;

    list.innerHTML = reasons
        .slice(0, 5)
        .map(({ key, reason, count, tabs }) => {
            const tabTitles = tabs
                .slice(0, 3)
                .map(t => escapeHtml(truncateText(t.title, 30)))
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
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Max length
 * @returns {string}
 */
function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Hide the exclusion toast
 */
function hideExclusionToast() {
    cancelToastAutoHide();

    const toast = document.getElementById('exclusion-toast');
    if (!toast) return;

    toast.classList.add('fadeout');
    toast.classList.remove('visible');

    toastState.isVisible = false;
    toastState.isExpanded = false;

    console.log('[EXCLUSION] Toast hidden');
}

/**
 * Toggle the details section
 */
function toggleExclusionDetails() {
    const toast = document.getElementById('exclusion-toast');
    const details = document.getElementById('exclusion-details');
    const toggleBtn = document.getElementById('exclusion-details-toggle');
    const btnText = toggleBtn?.querySelector('.details-btn-text');

    if (!toast || !details || !toggleBtn) return;

    toastState.isExpanded = !toastState.isExpanded;

    if (toastState.isExpanded) {
        details.classList.remove('hidden');
        details.setAttribute('aria-hidden', 'false');
        toggleBtn.setAttribute('aria-expanded', 'true');
        if (btnText) btnText.textContent = 'Hide details';
        toast.classList.add('expanded');

        // Cancel auto-hide when expanded
        cancelToastAutoHide();
    } else {
        details.classList.add('hidden');
        details.setAttribute('aria-hidden', 'true');
        toggleBtn.setAttribute('aria-expanded', 'false');
        if (btnText) btnText.textContent = 'Show details';
        toast.classList.remove('expanded');

        // Restart auto-hide
        startToastAutoHide();
    }
}

/**
 * Start auto-hide timer for toast (5 seconds)
 */
function startToastAutoHide() {
    cancelToastAutoHide();

    if (!toastState.isExpanded) {
        toastState.autoHideTimer = setTimeout(() => {
            hideExclusionToast();
        }, 5000);
    }
}

/**
 * Cancel auto-hide timer
 */
function cancelToastAutoHide() {
    if (toastState.autoHideTimer) {
        clearTimeout(toastState.autoHideTimer);
        toastState.autoHideTimer = null;
    }
}

/**
 * Store last suspend action for later retrieval
 * @param {Object} report - Exclusion report
 * @param {number} actualSuspended - Number suspended
 */
async function storeLastSuspendAction(report, actualSuspended) {
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

        // Collect first 10 excluded tabs
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
        console.log('[EXCLUSION] Stored last suspend action');

    } catch (error) {
        console.error('[EXCLUSION] Failed to store action:', error);
    }
}

// ========== END AGENT 3: EXCLUSION FEEDBACK FUNCTIONS ==========

// Auto-refresh every 30 seconds
setInterval(() => {
    loadStats();
}, 30000);

/**
 * Focus Mode System
 */

/**
 * Record a Focus Mode session to storage
 * @param {number} startTime - Session start timestamp
 * @param {number} endTime - Session end timestamp
 */
async function recordFocusSession(startTime, endTime) {
    try {
        // Validate inputs
        if (!startTime || !endTime) {
            console.log('[FOCUS] Invalid timestamps, not recording. start:', startTime, 'end:', endTime);
            return;
        }

        const duration = endTime - startTime;
        console.log('[FOCUS] Attempting to record session. Duration:', Math.round(duration / 1000), 'seconds');

        // Only record if session was at least 10 seconds
        if (duration < 10000) {
            console.log('[FOCUS] Session too short (< 10 seconds), not recording:', duration, 'ms');
            return;
        }

        const result = await chrome.storage.local.get('focusSessions');
        const sessions = result.focusSessions || [];
        const sessionsBefore = sessions.length;

        sessions.push({
            timestamp: startTime,
            duration: duration,
            recordedAt: Date.now() // Track when it was recorded
        });

        // Keep last 100 sessions
        if (sessions.length > 100) {
            sessions.splice(0, sessions.length - 100);
        }

        await chrome.storage.local.set({ focusSessions: sessions });
        console.log('[FOCUS] ✅ Session recorded successfully!',
            Math.round(duration / 1000), 'seconds.',
            'Total sessions:', sessions.length, '(was:', sessionsBefore, ')');
    } catch (error) {
        console.error('[FOCUS] ❌ Failed to record session:', error);
    }
}

// Load Focus Mode data - Community Edition (unlimited Focus Mode)
async function loadFocusModeData() {
    try {
        const result = await chrome.storage.local.get([
            'focusModeActive',
            'focusModeStartTime',
            'focusModeSuspendedTabs'
        ]);

        console.log('[FOCUS] Loading state from storage:', {
            active: result.focusModeActive,
            startTime: result.focusModeStartTime,
            suspendedTabs: result.focusModeSuspendedTabs?.length || 0
        });

        // Restore Focus Mode state if it was active
        if (result.focusModeActive) {
            isFocusModeActive = true;
            focusModeStartTime = result.focusModeStartTime || Date.now();
            focusModeSuspendedTabs = result.focusModeSuspendedTabs || [];

            console.log('[FOCUS] Focus Mode is active, restored startTime:', focusModeStartTime,
                'Duration so far:', Math.round((Date.now() - focusModeStartTime) / 1000), 'seconds');

            // Get current active tab for display
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const tabTitle = activeTab ? activeTab.title : 'Current Tab';

            // Show Focus Mode active UI
            showFocusModeActive(focusModeSuspendedTabs.length, tabTitle);
        } else {
            updateFocusModeButton();
        }
    } catch (error) {
        console.error('[FOCUS] Error loading Focus Mode data:', error);
        updateFocusModeButton();
    }
}

// Setup Focus Mode event listeners
function setupFocusModeListeners() {
    if (focusModeBtn) {
        focusModeBtn.addEventListener('click', handleFocusModeActivate);
    }

    if (focusExitBtn) {
        focusExitBtn.addEventListener('click', handleFocusModeExit);
    }
}

// Update Focus Mode button text and UI state - Community Edition (always unlocked)
function updateFocusModeButton() {
    if (!focusModeBtnText) return;

    // Community Edition - Focus Mode fully unlocked
    focusModeBtnText.textContent = 'Activate Focus Mode';

    // Hide lock icon and pro badge
    if (focusLockIcon) focusLockIcon.style.display = 'none';
    if (focusProBadge) focusProBadge.style.display = 'none';
    if (focusProof) focusProof.style.display = 'none';
}

// Handle Focus Mode activation - Community Edition (unlimited)
async function handleFocusModeActivate() {
    try {
        // Get current active tab
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!activeTab) {
            alert('Could not detect current tab');
            return;
        }

        // Get settings including whitelist
        const settingsResult = await chrome.storage.sync.get('tabSuspenderSettings');
        const settings = settingsResult.tabSuspenderSettings || {};
        const whitelistedDomains = settings.whitelistedDomains || [];
        const neverSuspendPinned = settings.suspendPinnedTabs === false;
        const neverSuspendAudio = settings.neverSuspendAudio !== false;

        // Get all other tabs
        const allTabs = await chrome.tabs.query({});
        const tabsToSuspend = allTabs.filter(tab =>
            tab.id !== activeTab.id &&
            tab.url &&
            !isInternalUrl(tab.url) &&
            !tab.url.includes('suspended.html') &&
            !isUrlWhitelisted(tab.url, whitelistedDomains) &&
            !(neverSuspendPinned && tab.pinned) &&
            !(neverSuspendAudio && tab.audible)
        );

        // Check if there are any tabs to suspend
        if (tabsToSuspend.length === 0) {
            alert('No other tabs to suspend. Focus Mode works best when you have multiple tabs open.');
            return;
        }

        // Suspend all other tabs and track them for restoration
        focusModeSuspendedTabs = [];
        for (const tab of tabsToSuspend) {
            const success = await suspendTabDirect(tab.id, tab.url, tab.title, tab.favIconUrl);
            if (success) {
                // Store original URL for restoration
                focusModeSuspendedTabs.push({
                    id: tab.id,
                    originalUrl: tab.url,
                    title: tab.title
                });
            }
        }

        // Record session start time BEFORE saving to storage
        focusModeStartTime = Date.now();

        // Persist Focus Mode state to storage
        await chrome.storage.local.set({
            focusModeActive: true,
            focusModeStartTime: focusModeStartTime,
            focusModeSuspendedTabs: focusModeSuspendedTabs
        });

        // Show active state
        showFocusModeActive(tabsToSuspend.length, activeTab.title);
        isFocusModeActive = true;

        // Refresh stats
        await loadStats();
    } catch (error) {
        console.error('[FOCUS] Error activating Focus Mode:', error);
        alert('Error activating Focus Mode: ' + error.message);
    }
}

// Show Focus Mode active state - Community Edition
function showFocusModeActive(suspendedCount, currentTabTitle) {
    if (focusModeBtn) focusModeBtn.style.display = 'none';
    if (focusModeActive) focusModeActive.style.display = 'block';

    if (focusSuspendedCount) {
        focusSuspendedCount.textContent = suspendedCount;
    }

    if (focusCurrentTab) {
        const truncatedTitle = currentTabTitle.length > 40
            ? currentTabTitle.substring(0, 40) + '...'
            : currentTabTitle;
        focusCurrentTab.textContent = `Focusing on: ${truncatedTitle}`;
    }
}

// Community Edition - Trial message removed (unlimited Focus Mode)

// Handle Focus Mode exit
async function handleFocusModeExit() {
    try {
        const endTime = Date.now();
        console.log('[FOCUS] Exit clicked. startTime:', focusModeStartTime, 'endTime:', endTime);

        // Record Focus Mode session if we have a start time
        if (focusModeStartTime) {
            const duration = endTime - focusModeStartTime;
            console.log('[FOCUS] Recording session:', {
                startTime: new Date(focusModeStartTime).toISOString(),
                endTime: new Date(endTime).toISOString(),
                durationSeconds: Math.round(duration / 1000)
            });
            await recordFocusSession(focusModeStartTime, endTime);
        } else {
            // Try to get start time from storage as fallback
            const stored = await chrome.storage.local.get('focusModeStartTime');
            if (stored.focusModeStartTime) {
                console.log('[FOCUS] Using stored startTime as fallback:', stored.focusModeStartTime);
                await recordFocusSession(stored.focusModeStartTime, endTime);
            } else {
                console.log('[FOCUS] No start time available, cannot record session');
            }
        }
        focusModeStartTime = null;

        // Restore tabs that were suspended by Focus Mode
        if (focusModeSuspendedTabs && focusModeSuspendedTabs.length > 0) {
            console.log('[FOCUS] Restoring', focusModeSuspendedTabs.length, 'suspended tabs');
            for (const tabInfo of focusModeSuspendedTabs) {
                try {
                    // Check if tab still exists
                    const tab = await chrome.tabs.get(tabInfo.id);
                    if (tab && tab.url && tab.url.includes('suspended.html')) {
                        await restoreTabDirect(tabInfo.id, tab.url);
                    }
                } catch (e) {
                    // Tab no longer exists, skip
                    console.log('[FOCUS] Tab', tabInfo.id, 'no longer exists, skipping');
                }
            }
            focusModeSuspendedTabs = [];
        }

        // Clear Focus Mode state from storage
        await chrome.storage.local.set({
            focusModeActive: false,
            focusModeStartTime: null,
            focusModeSuspendedTabs: []
        });

        if (focusModeBtn) focusModeBtn.style.display = 'block';
        if (focusModeActive) focusModeActive.style.display = 'none';

        isFocusModeActive = false;

        // Reload tabs display and stats
        await loadStats();
        await loadTabs();

        console.log('[FOCUS] Exit complete, UI reset');
    } catch (error) {
        console.error('[FOCUS] Error exiting Focus Mode:', error);
    }
}

// Community Edition - Upgrade function removed

// Community Edition - Email capture and paywall systems removed

// Community Edition - License verification system removed (all features unlocked)

