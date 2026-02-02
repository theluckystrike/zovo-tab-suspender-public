/**
 * Tab Suspender Pro - Popup JavaScript
 * Handles tab list display and user interactions
 */

// DOM Elements
const tabsList = document.getElementById('tabsList');
const memorySaved = document.getElementById('memorySaved');
const suspendedCount = document.getElementById('suspendedCount');
const totalTabs = document.getElementById('totalTabs');
const totalSaved = document.getElementById('totalSaved');
const suspendAllBtn = document.getElementById('suspendAllBtn');
const restoreAllBtn = document.getElementById('restoreAllBtn');
const whitelistBtn = document.getElementById('whitelistBtn');
const settingsBtn = document.getElementById('settingsBtn');
const filterSelect = document.getElementById('filterSelect');

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
const progressFill = document.getElementById('progressFill');
const memoryChange = document.getElementById('memoryChange');
const heroMessage = document.getElementById('heroMessage');

let focusModeTrialsLeft = 3;
let isFocusModeActive = false;
let isPro = false;
let focusModeStartTime = null; // Track when Focus Mode was activated

// Paywall Email Capture
const PAYWALL_API = 'https://xggdjlurppfcytxqoozs.supabase.co/functions/v1/log-paywall-hit';
let currentFeatureAttempted = '';
let savedUserEmail = '';

// Operation locks to prevent race conditions
let isOperationInProgress = false;

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
    console.log('Popup loaded');
    initLicenseSystem(); // Check license first
    await loadSavedEmail(); // Load saved email for prefilling
    await loadFocusModeData();
    await loadStats();
    await loadTabs();
    setupEventListeners();
    setupFocusModeListeners();
    setupEmailModalListeners();

    // ========== AGENT 1: COUNTDOWN INDICATOR INIT ==========
    await initCountdownIndicator();
    // ========== END AGENT 1 INIT ==========

    // ========== AGENT 3: EXCLUSION FEEDBACK INIT ==========
    initExclusionFeedback();
    // ========== END AGENT 3 INIT ==========
});

// Event Listeners
function setupEventListeners() {
    suspendAllBtn.addEventListener('click', handleSuspendAll);
    restoreAllBtn.addEventListener('click', handleRestoreAll);
    whitelistBtn.addEventListener('click', handleWhitelist);
    settingsBtn.addEventListener('click', handleSettings);
    filterSelect.addEventListener('change', handleFilterChange);
}

// Load Statistics - direct from storage as fallback
async function loadStats() {
    console.log('[STATS] loadStats called');
    try {
        // Try messaging first
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
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

    // Hero value
    if (memorySaved) {
        memorySaved.textContent = formatBytes(todayBytes);
    }

    // Stats
    if (suspendedCount) suspendedCount.textContent = stats.tabsSuspended || 0;
    if (totalTabs) totalTabs.textContent = stats.totalTabs || 0;
    if (totalSaved) totalSaved.textContent = formatBytes(stats.totalSaved || 0);

    // Window count (with proper grammar)
    if (windowCount) {
        const windows = await chrome.windows.getAll();
        const count = windows.length;
        windowCount.textContent = count;
        // Update parent text for proper grammar
        const parentSpan = windowCount.closest('.hero-stat');
        if (parentSpan) {
            parentSpan.innerHTML = `<span id="windowCount">${count}</span> ${count === 1 ? 'window' : 'windows'}`;
        }
    }

    // Progress bar (target: 1GB per day)
    if (progressFill) {
        const targetBytes = 1024 * 1024 * 1024; // 1GB
        const percentage = Math.min((todayBytes / targetBytes) * 100, 100);
        progressFill.style.width = percentage + '%';
    }

    // Memory change indicator
    if (memoryChange) {
        try {
            const yesterdayBytes = await getYesterdayMemory();
            if (yesterdayBytes > 0) {
                const change = ((todayBytes - yesterdayBytes) / yesterdayBytes * 100).toFixed(1);
                const changeIcon = memoryChange.querySelector('.change-icon');
                const changeValue = memoryChange.querySelector('.change-value');

                if (change > 0) {
                    changeIcon.textContent = '▲';
                    memoryChange.style.background = 'rgba(16, 185, 129, 0.1)';
                    memoryChange.style.color = '#10B981';
                } else if (change < 0) {
                    changeIcon.textContent = '▼';
                    memoryChange.style.background = 'rgba(239, 68, 68, 0.1)';
                    memoryChange.style.color = '#EF4444';
                }

                changeValue.textContent = Math.abs(change) + '%';
            }
        } catch (e) {
            console.log('Could not calculate change:', e);
        }
    }

    // Hero message
    if (heroMessage) {
        const message = getHeroMessage(todayBytes);
        heroMessage.textContent = `"${message}"`;
    }
}

// Get yesterday's memory for comparison
async function getYesterdayMemory() {
    try {
        const result = await chrome.storage.local.get('memoryStats');
        const stats = result.memoryStats || { history: [] };
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toDateString();

        const yesterdayData = (stats.history || [])
            .filter(h => new Date(h.timestamp).toDateString() === yesterdayStr)
            .reduce((sum, h) => sum + h.memorySaved, 0);

        return yesterdayData;
    } catch (e) {
        return 0;
    }
}

// Get dynamic hero message based on bytes saved
function getHeroMessage(bytes) {
    const gb = bytes / (1024 * 1024 * 1024);
    const mb = bytes / (1024 * 1024);

    if (gb >= 5) return "You're a memory-saving champion! 🏆";
    if (gb >= 2) return "That's like getting a free RAM upgrade";
    if (gb >= 1) return "That's like closing Chrome and reopening it 3x faster";
    if (mb >= 500) return "You're making a difference, one tab at a time";
    if (mb >= 100) return "Great start! Keep those tabs suspended";
    if (mb >= 50) return "Every MB counts. You're doing great!";
    return "Suspend more tabs to see the magic happen ✨";
}

// Load Tabs - direct from Chrome API as fallback
async function loadTabs() {
    try {
        tabsList.innerHTML = '<div class="loading">Loading tabs...</div>';

        // Try messaging first
        let windows = null;
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_TAB_LIST' });
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
            tabsList.innerHTML = '<div class="empty-state"><p>No tabs found</p></div>';
            return;
        }

        tabsData = windows;
        renderTabs(windows);
    } catch (error) {
        console.error('Error loading tabs:', error);
        tabsList.innerHTML = '<div class="empty-state"><p>Error: ' + error.message + '</p></div>';
    }
}

// Render Tabs
function renderTabs(windows) {
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
            await suspendTabDirect(tab.id, tab.url, tab.title, tab.favIconUrl);
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

// Direct suspend function (fallback)
async function suspendTabDirect(tabId, url, title, favicon) {
    try {
        // Don't suspend internal pages or already suspended
        if (isInternalUrl(url) || url.includes('suspended.html')) {
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
        const tabs = await chrome.tabs.query({ active: false });
        for (const tab of tabs) {
            if (tab.url && !isInternalUrl(tab.url) && !tab.url.includes('suspended.html')) {
                await suspendTabDirect(tab.id, tab.url, tab.title, tab.favIconUrl);
            }
        }

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
            excluded: report.excluded
        });

        // Step 2: Suspend all suspendable tabs
        let actualSuspended = 0;
        for (const tab of report.suspendableTabs) {
            try {
                const fullTab = await chrome.tabs.get(tab.id);
                const success = await suspendTabDirect(
                    fullTab.id,
                    fullTab.url,
                    fullTab.title,
                    fullTab.favIconUrl
                );
                if (success) actualSuspended++;
            } catch (e) {
                console.warn('[EXCLUSION] Tab unavailable:', tab.id);
            }
        }

        console.log('[EXCLUSION] Suspended:', actualSuspended, 'tabs');

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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="6" y="4" width="4" height="16"></rect>
            <rect x="14" y="4" width="4" height="16"></rect>
          </svg>
          Suspend All
        `;
    }
}

// Check if URL is internal/special and should not be suspended
function isInternalUrl(url) {
    if (!url) return true;
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
        if (activeTab && activeTab.url) {
            const domain = getDomain(activeTab.url);

            // Save to storage directly
            const result = await chrome.storage.sync.get('tabSuspenderSettings');
            const settings = result.tabSuspenderSettings || { whitelistedDomains: [] };

            if (!settings.whitelistedDomains.includes(domain)) {
                settings.whitelistedDomains.push(domain);
                await chrome.storage.sync.set({ tabSuspenderSettings: settings });
            }

            // Show feedback
            whitelistBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
            whitelistBtn.style.borderColor = '#22c55e';
            whitelistBtn.style.color = '#22c55e';

            setTimeout(() => {
                whitelistBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
        `;
                whitelistBtn.style.borderColor = '';
                whitelistBtn.style.color = '';
            }, 2000);
        }
    } catch (error) {
        console.error('Error whitelisting:', error);
    }
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
        const countdown = await chrome.runtime.sendMessage({
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
        const formResult = await chrome.storage.local.get('tabFormStatus');
        formStatus = formResult.tabFormStatus || {};
    }

    // Query tabs in current window
    const tabs = await chrome.tabs.query({ currentWindow: true });

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
    if (tab.active && settings.neverSuspendActiveTab !== false) {
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
    if (tab.audible && settings.neverSuspendAudio !== false) {
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
        const duration = endTime - startTime;

        // Only record if session was at least 10 seconds
        if (duration < 10000) {
            console.log('[FOCUS] Session too short, not recording:', duration, 'ms');
            return;
        }

        const result = await chrome.storage.local.get('focusSessions');
        const sessions = result.focusSessions || [];

        sessions.push({
            timestamp: startTime,
            duration: duration
        });

        // Keep last 100 sessions
        if (sessions.length > 100) {
            sessions.splice(0, sessions.length - 100);
        }

        await chrome.storage.local.set({ focusSessions: sessions });
        console.log('[FOCUS] Session recorded:', Math.round(duration / 1000), 'seconds');
    } catch (error) {
        console.error('[FOCUS] Failed to record session:', error);
    }
}

// Load Focus Mode data
async function loadFocusModeData() {
    try {
        const result = await chrome.storage.local.get(['focusModeTrials', 'isPro']);
        isPro = result.isPro || false;
        focusModeTrialsLeft = isPro ? -1 : (result.focusModeTrials !== undefined ? result.focusModeTrials : 3);
        updateFocusModeButton();
    } catch (error) {
        console.error('Error loading Focus Mode data:', error);
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

// Update Focus Mode button text
function updateFocusModeButton() {
    if (!focusModeBtnText) return;

    if (isPro) {
        focusModeBtnText.textContent = 'Activate Focus Mode';
    } else {
        if (focusModeTrialsLeft > 0) {
            focusModeBtnText.textContent = `Try Free (${focusModeTrialsLeft} left)`;
        } else {
            focusModeBtnText.textContent = 'Upgrade to Pro';
        }
    }
}

// Handle Focus Mode activation
async function handleFocusModeActivate() {
    try {
        // Check if user has trials left or is Pro
        if (!isPro && focusModeTrialsLeft <= 0) {
            showFocusModeUpgrade();
            return;
        }

        // Get current active tab
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!activeTab) {
            alert('Could not detect current tab');
            return;
        }

        // Get all other tabs
        const allTabs = await chrome.tabs.query({});
        const tabsToSuspend = allTabs.filter(tab =>
            tab.id !== activeTab.id &&
            tab.url &&
            !isInternalUrl(tab.url) &&
            !tab.url.includes('suspended.html')
        );

        // Check if there are any tabs to suspend (don't waste a trial)
        if (tabsToSuspend.length === 0) {
            alert('No other tabs to suspend. Focus Mode works best when you have multiple tabs open.');
            return;
        }

        // Suspend all other tabs
        for (const tab of tabsToSuspend) {
            await suspendTabDirect(tab.id, tab.url, tab.title, tab.favIconUrl);
        }

        // Decrement trial count if not Pro (only after successful suspension)
        if (!isPro && focusModeTrialsLeft > 0) {
            focusModeTrialsLeft--;
            await chrome.storage.local.set({ focusModeTrials: focusModeTrialsLeft });
            updateFocusModeButton();
        }

        // Record session start time
        focusModeStartTime = Date.now();

        // Show active state
        showFocusModeActive(tabsToSuspend.length, activeTab.title);
        isFocusModeActive = true;

        // Refresh stats
        await loadStats();
    } catch (error) {
        console.error('Error activating Focus Mode:', error);
        alert('Error activating Focus Mode: ' + error.message);
    }
}

// Show Focus Mode active state
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

    // Show trial message if this was the last free trial
    if (!isPro && focusModeTrialsLeft === 0) {
        showFocusModeTrialMessage();
    }
}

// Show trial exhausted message
function showFocusModeTrialMessage() {
    if (!focusModeActive) return;

    const message = document.createElement('div');
    message.className = 'focus-trial-message';
    message.style.cssText = 'margin-top: 12px; padding: 8px; background: rgba(245, 158, 11, 0.1); border: 1px solid #F59E0B; border-radius: 6px; font-size: 11px; text-align: center; color: #F59E0B;';
    message.innerHTML = '💡 <strong>Loved Focus Mode?</strong> <a href="#" id="trialUpgradeLink" style="color: #F59E0B; text-decoration: underline;">Unlock unlimited</a> for $4.99/mo';

    focusModeActive.appendChild(message);

    // Attach click handler to show email capture modal
    const upgradeLink = document.getElementById('trialUpgradeLink');
    if (upgradeLink) {
        upgradeLink.addEventListener('click', (e) => {
            e.preventDefault();
            showEmailCaptureModal('Focus Mode');
        });
    }
}

// Handle Focus Mode exit
async function handleFocusModeExit() {
    try {
        // Record Focus Mode session if we have a start time
        if (focusModeStartTime) {
            await recordFocusSession(focusModeStartTime, Date.now());
            focusModeStartTime = null;
        }

        if (focusModeBtn) focusModeBtn.style.display = 'block';
        if (focusModeActive) focusModeActive.style.display = 'none';

        isFocusModeActive = false;

        // Reload tabs display
        await loadTabs();
    } catch (error) {
        console.error('Error exiting Focus Mode:', error);
    }
}

// Show email capture modal when trials exhausted
function showFocusModeUpgrade() {
    showEmailCaptureModal('Focus Mode');
}

/**
 * Email Capture Modal System
 */

// Load saved email from storage
async function loadSavedEmail() {
    try {
        const result = await chrome.storage.local.get(['userEmail']);
        savedUserEmail = result.userEmail || '';
        console.log('[EMAIL] Loaded saved email:', savedUserEmail ? 'found' : 'none');
    } catch (error) {
        console.error('[EMAIL] Error loading saved email:', error);
    }
}

// Show the email capture modal
function showEmailCaptureModal(featureName) {
    currentFeatureAttempted = featureName.toLowerCase().replace(/\s+/g, '_');

    const modal = document.getElementById('emailCaptureModal');
    const modalTitle = document.getElementById('modalTitle');
    const emailInput = document.getElementById('emailInput');
    const emailError = document.getElementById('emailError');
    const continueBtn = document.getElementById('modalContinueBtn');

    if (!modal) return;

    // Set title
    modalTitle.textContent = `Unlock ${featureName}`;

    // Prefill email if saved
    if (savedUserEmail) {
        emailInput.value = savedUserEmail;
    } else {
        emailInput.value = '';
    }

    // Reset state
    emailError.style.display = 'none';
    emailInput.classList.remove('error');
    continueBtn.disabled = false;
    continueBtn.textContent = 'Continue';

    // Show modal
    modal.style.display = 'flex';
    emailInput.focus();
}

// Hide the email capture modal
function hideEmailCaptureModal() {
    const modal = document.getElementById('emailCaptureModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Validate email format
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Log paywall hit to Supabase
async function logPaywallHit(email, feature) {
    try {
        console.log('[PAYWALL] Logging hit:', { email, feature });

        const response = await fetch(PAYWALL_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email,
                extension_id: 'tab-suspender-pro',
                feature_attempted: feature
            }),
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            console.warn('[PAYWALL] API returned non-OK status:', response.status);
        } else {
            console.log('[PAYWALL] Successfully logged paywall hit');
        }

        return true;
    } catch (error) {
        console.error('[PAYWALL] Error logging paywall hit:', error);
        // Return true to continue flow even if API fails
        return true;
    }
}

// Handle Continue button click
async function handleEmailContinue() {
    const emailInput = document.getElementById('emailInput');
    const emailError = document.getElementById('emailError');
    const continueBtn = document.getElementById('modalContinueBtn');

    const email = emailInput.value.trim();

    // Validate email
    if (!isValidEmail(email)) {
        emailInput.classList.add('error');
        emailError.style.display = 'block';
        return;
    }

    // Clear error state
    emailInput.classList.remove('error');
    emailError.style.display = 'none';

    // Show loading state
    continueBtn.disabled = true;
    continueBtn.textContent = 'Please wait...';

    // Save email to storage
    try {
        await chrome.storage.local.set({ userEmail: email });
        savedUserEmail = email;
        console.log('[EMAIL] Saved email to storage');
    } catch (error) {
        console.error('[EMAIL] Error saving email:', error);
    }

    // Log to Supabase (don't block on failure)
    await logPaywallHit(email, currentFeatureAttempted);

    // Hide modal
    hideEmailCaptureModal();

    // Redirect to upgrade page with parameters
    const upgradeUrl = `https://zovo.one/upgrade?email=${encodeURIComponent(email)}&feature=${encodeURIComponent(currentFeatureAttempted)}&ext=tab-suspender-pro`;
    chrome.tabs.create({ url: upgradeUrl });
}

// Handle Maybe Later button click
function handleMaybeLater() {
    hideEmailCaptureModal();

    // Redirect to upgrade page without email parameter
    const upgradeUrl = `https://zovo.one/upgrade?feature=${encodeURIComponent(currentFeatureAttempted)}&ext=tab-suspender-pro`;
    chrome.tabs.create({ url: upgradeUrl });
}

// Setup modal event listeners
function setupEmailModalListeners() {
    const continueBtn = document.getElementById('modalContinueBtn');
    const maybeLaterBtn = document.getElementById('modalMaybeLaterBtn');
    const emailInput = document.getElementById('emailInput');
    const modal = document.getElementById('emailCaptureModal');
    const getLicenseLink = document.getElementById('getLicenseLink');

    if (continueBtn) {
        continueBtn.addEventListener('click', handleEmailContinue);
    }

    if (maybeLaterBtn) {
        maybeLaterBtn.addEventListener('click', handleMaybeLater);
    }

    // "Get Pro License" link triggers email capture
    if (getLicenseLink) {
        getLicenseLink.addEventListener('click', (e) => {
            e.preventDefault();
            showEmailCaptureModal('Pro License');
        });
    }

    // Enter key to submit
    if (emailInput) {
        emailInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleEmailContinue();
            }
        });

        // Clear error on input
        emailInput.addEventListener('input', () => {
            emailInput.classList.remove('error');
            document.getElementById('emailError').style.display = 'none';
        });
    }

    // Close on overlay click (outside modal content)
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                handleMaybeLater();
            }
        });
    }
}

/**
 * License Verification System
 * SECURITY: Server-side verification required - localStorage alone is not trusted
 */

const VERIFY_API = 'https://xggdjlurppfcytxqoozs.supabase.co/functions/v1/verify-extension-license';
const REVERIFY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const OFFLINE_GRACE_PERIOD_MS = 72 * 60 * 60 * 1000; // 72 hours grace period when offline

// Check license on popup load with server-side re-verification
async function checkLicense() {
    try {
        const data = await chrome.storage.local.get(['licenseKey', 'isPro', 'verifiedAt', 'serverSignature']);

        if (data.isPro && data.licenseKey) {
            const now = Date.now();
            const lastVerified = data.verifiedAt || 0;
            const timeSinceVerification = now - lastVerified;

            // SECURITY: Always re-verify if no server signature exists (prevents localStorage manipulation)
            if (!data.serverSignature) {
                console.log('[LICENSE] No server signature found, re-verifying...');
                await reVerifyLicense(data.licenseKey);
                return;
            }

            // Check if re-verification is needed (every 24 hours)
            if (timeSinceVerification > REVERIFY_INTERVAL_MS) {
                console.log('[LICENSE] Re-verification needed (last verified:', new Date(lastVerified).toISOString(), ')');
                await reVerifyLicense(data.licenseKey);
                return;
            }

            // License is valid and recently verified
            console.log('[LICENSE] License valid, last verified:', Math.round(timeSinceVerification / 1000 / 60), 'minutes ago');
            isPro = true;
            showProActive();
            unlockProFeatures();
        } else {
            // No license stored
            isPro = false;
            showLicensePrompt();
        }
    } catch (error) {
        console.error('[LICENSE] Error checking license:', error);
        showLicensePrompt();
    }
}

// Re-verify existing license with server
async function reVerifyLicense(licenseKey) {
    try {
        console.log('[LICENSE] Starting re-verification...');

        const result = await verifyLicense(licenseKey);

        if (result.valid) {
            // Update verification timestamp and server signature
            await chrome.storage.local.set({
                isPro: true,
                verifiedAt: Date.now(),
                serverSignature: result.signature || generateLocalSignature(licenseKey)
            });

            isPro = true;
            showProActive();
            unlockProFeatures();
            console.log('[LICENSE] Re-verification successful');
        } else {
            // License is no longer valid - could be revoked, expired, etc.
            console.log('[LICENSE] Re-verification failed:', result.error);
            await handleLicenseRevoked(result.error);
        }
    } catch (error) {
        console.error('[LICENSE] Re-verification error:', error);

        // Offline handling: check grace period
        const data = await chrome.storage.local.get(['verifiedAt']);
        const timeSinceVerification = Date.now() - (data.verifiedAt || 0);

        if (timeSinceVerification < OFFLINE_GRACE_PERIOD_MS) {
            // Within grace period - allow Pro features but show warning
            console.log('[LICENSE] Offline, within grace period');
            isPro = true;
            showProActive();
            unlockProFeatures();
            showOfflineWarning();
        } else {
            // Grace period expired - revert to free
            console.log('[LICENSE] Offline, grace period expired');
            await handleLicenseRevoked('Unable to verify license. Please check your internet connection.');
        }
    }
}

// Handle revoked/invalid license
async function handleLicenseRevoked(reason) {
    // Clear Pro status
    await chrome.storage.local.set({
        isPro: false,
        serverSignature: null
    });
    // Keep licenseKey so user can see what was entered

    isPro = false;
    showLicensePrompt();

    // Show message to user
    const status = document.getElementById('licenseStatus');
    if (status) {
        status.className = 'license-status error';
        status.textContent = '⚠️ ' + (reason || 'License verification failed');
        status.style.display = 'block';
    }
}

// Show offline warning
function showOfflineWarning() {
    const active = document.getElementById('licenseActive');
    if (!active) return;

    // Check if warning already exists
    if (active.querySelector('.offline-warning')) return;

    const warning = document.createElement('div');
    warning.className = 'offline-warning';
    warning.style.cssText = 'margin-top: 8px; padding: 6px 10px; background: rgba(245, 158, 11, 0.1); border: 1px solid #F59E0B; border-radius: 6px; font-size: 11px; color: #F59E0B;';
    warning.textContent = '⚠️ Offline mode - will re-verify when online';
    active.appendChild(warning);
}

// Generate a local signature (fallback when server doesn't provide one)
function generateLocalSignature(licenseKey) {
    // Simple hash for tamper detection (not cryptographically secure, but adds a layer)
    const timestamp = Date.now();
    const data = licenseKey + ':' + timestamp + ':tab_suspender_pro';
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return btoa(hash.toString() + ':' + timestamp);
}

// Verify license key via API
async function verifyLicense(licenseKey) {
    try {
        const response = await fetch(VERIFY_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                license_key: licenseKey,
                extension: 'tab_suspender_pro'
            }),
            // Timeout after 10 seconds
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Verification failed');
        }

        const result = await response.json();
        console.log('[LICENSE] Server response:', { valid: result.valid, tier: result.tier });
        return result;
    } catch (error) {
        console.error('[LICENSE] Verification error:', error);

        // Differentiate between network errors and server errors
        if (error.name === 'AbortError' || error.name === 'TypeError') {
            return { valid: false, error: 'Network error - please check your connection', offline: true };
        }

        return { valid: false, error: error.message || 'Unable to verify license' };
    }
}

// Handle license activation
async function activatePro() {
    const input = document.getElementById('licenseInput');
    const status = document.getElementById('licenseStatus');
    const activateBtn = document.getElementById('activateBtn');

    const key = input.value.trim().toUpperCase();

    // Validate format
    if (!key.match(/^ZOVO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)) {
        status.className = 'license-status error';
        status.textContent = '❌ Invalid format. Use: ZOVO-XXXX-XXXX-XXXX-XXXX';
        status.style.display = 'block';
        return;
    }

    // Show loading state
    status.className = 'license-status loading';
    status.textContent = '⏳ Verifying license...';
    status.style.display = 'block';
    activateBtn.disabled = true;
    activateBtn.textContent = 'Verifying...';

    // Verify license with server (SECURITY: Server verification required)
    const result = await verifyLicense(key);

    if (result.valid) {
        // Save license to storage WITH server signature
        await chrome.storage.local.set({
            licenseKey: key,
            isPro: true,
            tier: result.tier || 'pro',
            verifiedAt: Date.now(),
            serverSignature: result.signature || generateLocalSignature(key)
        });

        isPro = true;

        // Show success
        status.className = 'license-status success';
        status.textContent = '✅ Pro Activated!';

        // Switch to Pro active view after 1 second
        setTimeout(() => {
            showProActive();
            unlockProFeatures();
        }, 1000);
    } else {
        // Show error
        status.className = 'license-status error';

        if (result.offline) {
            status.textContent = '⚠️ ' + result.error;
        } else {
            status.textContent = '❌ ' + (result.error || 'Invalid license key');
        }

        status.style.display = 'block';
        activateBtn.disabled = false;
        activateBtn.textContent = 'Activate';
    }
}

// Show license prompt UI
function showLicensePrompt() {
    const section = document.getElementById('licenseSection');
    const prompt = document.getElementById('licensePrompt');
    const active = document.getElementById('licenseActive');
    
    if (section) section.style.display = 'block';
    if (prompt) prompt.style.display = 'block';
    if (active) active.style.display = 'none';
}

// Show Pro active UI
function showProActive() {
    const section = document.getElementById('licenseSection');
    const prompt = document.getElementById('licensePrompt');
    const active = document.getElementById('licenseActive');
    const headerBadge = document.getElementById('headerProBadge');

    if (section) section.style.display = 'block';
    if (prompt) prompt.style.display = 'none';
    if (active) active.style.display = 'block';
    if (headerBadge) headerBadge.style.display = 'inline-block';
}

// Unlock Pro features
function unlockProFeatures() {
    // Remove Pro locks from UI elements
    document.querySelectorAll('.pro-badge').forEach(el => {
        el.style.display = 'none';
    });
    
    document.querySelectorAll('.pro-locked').forEach(el => {
        el.classList.remove('pro-locked');
        el.classList.add('pro-unlocked');
    });
    
    document.querySelectorAll('.upgrade-prompt').forEach(el => {
        el.style.display = 'none';
    });
    
    console.log('Pro features unlocked');
}

// Format license key as user types
function formatLicenseInput() {
    const input = document.getElementById('licenseInput');
    if (!input) return;
    
    input.addEventListener('input', (e) => {
        let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        
        // Format as ZOVO-XXXX-XXXX-XXXX-XXXX
        if (value.startsWith('ZOVO')) {
            value = value.substring(4);
        }
        
        const parts = [];
        for (let i = 0; i < value.length; i += 4) {
            parts.push(value.substring(i, i + 4));
        }
        
        e.target.value = 'ZOVO-' + parts.join('-');
    });
}

// Initialize license system
function initLicenseSystem() {
    checkLicense();
    formatLicenseInput();
    
    const activateBtn = document.getElementById('activateBtn');
    if (activateBtn) {
        activateBtn.addEventListener('click', activatePro);
    }
    
    // Enter key to activate
    const input = document.getElementById('licenseInput');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                activatePro();
            }
        });
    }
}

