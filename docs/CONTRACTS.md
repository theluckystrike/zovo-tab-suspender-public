# Interface Contracts for Feature Implementation

This document defines the contracts that all agents MUST follow to ensure features work together without conflicts.

---

## Storage Contracts

### EXISTING KEYS - DO NOT MODIFY SCHEMA

These storage keys already exist. Agents MUST preserve their schema exactly.

```typescript
// chrome.storage.sync
interface TabSuspenderSettings {
  suspensionTimeout: number;        // Minutes (default: 30)
  autoUnsuspendOnFocus: boolean;
  suspendPinnedTabs: boolean;
  whitelistedDomains: string[];
  neverSuspendAudio: boolean;
  neverSuspendActiveTab: boolean;
  memoryThreshold?: number;
  neverSuspendUnsavedForms?: boolean;
}

// chrome.storage.local
interface MemoryStats {
  totalSaved: number;               // Bytes
  tabsSuspended: number;            // Lifetime count
  history: Array<{
    timestamp: number;
    url: string;
    memorySaved: number;            // Bytes (always 52428800 = 50MB)
  }>;
}

// chrome.storage.session (or local fallback)
interface TabLastActivity {
  [tabId: string]: number;          // Timestamp
}

interface TabFormStatus {
  [tabId: string]: boolean;         // Has unsaved forms
}
```

### NEW KEYS - For Feature Implementation

Agents may ADD these new storage keys. Use unique prefixes to avoid conflicts.

```typescript
// ============================================
// TASK 1: Countdown Indicator
// ============================================

// NEW KEY: For persisting timer info across service worker restarts
// Agent 1 owns this key
interface CountdownTimers {
  [tabId: string]: {
    suspendAt: number;              // Timestamp when tab will be suspended
    startedAt: number;              // Timestamp when timer was started
    timeoutMinutes: number;         // The timeout setting when created
  };
}
// Storage key: "countdown_timers"
// Storage area: chrome.storage.session (local fallback)


// ============================================
// TASK 2: Dashboard Sync
// ============================================

// NEW KEY: Track last stats update for real-time sync
// Agent 2 owns this key
interface StatsMetadata {
  lastUpdated: number;              // Timestamp of last update
  version: number;                  // Increments on each update (for change detection)
}
// Storage key: "stats_metadata"
// Storage area: chrome.storage.local

// Note: Agent 2 should NOT create a new stats storage key.
// Instead, ensure all components read from "memoryStats" consistently.


// ============================================
// TASK 3: Exclusion Feedback
// ============================================

// NEW KEY: Store last "Suspend All" action results
// Agent 3 owns this key
interface LastSuspendAction {
  timestamp: number;
  totalTabs: number;                // Total tabs in window
  suspendedCount: number;           // Successfully suspended
  excludedReasons: {
    whitelist: number;
    pinned: number;
    audio: number;
    forms: number;
    active: number;
    alreadySuspended: number;
    systemPages: number;
  };
  excludedTabs: Array<{             // First 10 excluded tabs for details
    id: number;
    title: string;
    reason: string;
  }>;
}
// Storage key: "last_suspend_action"
// Storage area: chrome.storage.local
```

---

## Message Type Contracts

### EXISTING MESSAGES - DO NOT MODIFY

These message types are already implemented. Do not change their request/response schema.

```typescript
// Existing - handled in background.js handleMessage()
type ExistingMessageTypes =
  | 'TAB_ACTIVITY'
  | 'FORM_STATUS'
  | 'CONTENT_SCRIPT_READY'
  | 'SUSPEND_TAB'
  | 'RESTORE_TAB'
  | 'SUSPEND_ALL'
  | 'RESTORE_ALL'
  | 'GET_TAB_LIST'
  | 'GET_STATS'
  | 'GET_SETTINGS'
  | 'SAVE_SETTINGS'
  | 'WHITELIST_DOMAIN'
  | 'REMOVE_WHITELIST';
```

### NEW MESSAGES - For Feature Implementation

Agents may ADD these new message types. Use descriptive, unique names.

```typescript
// ============================================
// TASK 1: Countdown Indicator
// ============================================

// Request countdown info for a specific tab
interface GetTabCountdownRequest {
  type: 'GET_TAB_COUNTDOWN';
  tabId: number;
}
interface GetTabCountdownResponse {
  tabId: number;
  remainingMs: number;              // Milliseconds until suspension (-1 if not tracked)
  suspendAt: number | null;         // Timestamp or null
  isPaused: boolean;                // True if tab is active/whitelisted
}

// Subscribe to countdown updates (for popup real-time display)
interface SubscribeCountdownRequest {
  type: 'SUBSCRIBE_COUNTDOWN';
  tabId: number;
}

// Broadcast countdown update (background → popup)
interface CountdownUpdateBroadcast {
  type: 'COUNTDOWN_UPDATE';
  tabId: number;
  remainingMs: number;
  suspendAt: number;
}

// Get all active countdowns
interface GetAllCountdownsRequest {
  type: 'GET_ALL_COUNTDOWNS';
}
interface GetAllCountdownsResponse {
  countdowns: Array<{
    tabId: number;
    remainingMs: number;
    suspendAt: number;
  }>;
}


// ============================================
// TASK 2: Dashboard Sync
// ============================================

// Request immediate stats refresh
interface RequestStatsSyncRequest {
  type: 'REQUEST_STATS_SYNC';
}
interface RequestStatsSyncResponse {
  success: boolean;
  stats: StatsObject;
}

// Broadcast stats update (background → all listeners)
interface StatsUpdatedBroadcast {
  type: 'STATS_UPDATED';
  stats: StatsObject;
  timestamp: number;
}

// Stats object structure (matches existing GET_STATS response)
interface StatsObject {
  totalSaved: number;
  todaySaved: number;
  tabsSuspended: number;
  totalTabs: number;
  activeTabs: number;
  lifetimeTabsSuspended: number;
}


// ============================================
// TASK 3: Exclusion Feedback
// ============================================

// Enhanced suspend all with exclusion tracking
// NOTE: This extends the existing SUSPEND_ALL behavior
interface SuspendAllEnhancedRequest {
  type: 'SUSPEND_ALL_ENHANCED';
  windowId?: number;                // Optional: specific window only
}
interface SuspendAllEnhancedResponse {
  success: boolean;
  count: number;                    // Tabs suspended
  exclusionReport: {
    total: number;
    suspended: number;
    excluded: {
      whitelist: Array<{id: number; title: string; url: string}>;
      pinned: Array<{id: number; title: string; url: string}>;
      audio: Array<{id: number; title: string; url: string}>;
      forms: Array<{id: number; title: string; url: string}>;
      active: Array<{id: number; title: string; url: string}>;
      alreadySuspended: Array<{id: number; title: string; url: string}>;
      systemPages: Array<{id: number; title: string; url: string}>;
    };
  };
}

// Get last suspend action result (for displaying after-the-fact)
interface GetLastSuspendActionRequest {
  type: 'GET_LAST_SUSPEND_ACTION';
}
interface GetLastSuspendActionResponse {
  action: LastSuspendAction | null;
}
```

---

## UI Element Contracts

### EXISTING IDs - DO NOT REMOVE OR RENAME

These HTML element IDs are used by existing code. Agents must not remove them.

```html
<!-- popup.html -->
<div id="memorySaved">           <!-- Hero memory display -->
<div id="suspendedCount">        <!-- Suspended tabs count -->
<div id="totalTabs">             <!-- Total tabs count -->
<div id="totalSaved">            <!-- Lifetime memory saved -->
<button id="suspendAllBtn">      <!-- Suspend all button -->
<button id="restoreAllBtn">      <!-- Restore all button -->
<button id="whitelistBtn">       <!-- Whitelist current site -->
<button id="settingsBtn">        <!-- Open settings -->
<select id="filterSelect">       <!-- Tab filter dropdown -->
<div id="tabsList">              <!-- Tab list container -->
<div id="progressFill">          <!-- Progress bar fill -->
<div id="memoryChange">          <!-- Memory change indicator -->
<div id="heroMessage">           <!-- Dynamic hero message -->
<div id="windowCount">           <!-- Window count display -->

<!-- stats-dashboard.html -->
<div id="totalSaved">            <!-- Total saved display -->
<div id="tabsSuspended">         <!-- Tabs suspended count -->
<div id="todaySaved">            <!-- Today's savings -->
<div id="avgDaily">              <!-- Daily average -->
<div id="chartCanvas">           <!-- Chart container -->
<div id="topSites">              <!-- Top sites list -->
```

### NEW IDs - For Feature Implementation

Agents may ADD these new element IDs. Use descriptive prefixes.

```html
<!-- ============================================ -->
<!-- TASK 1: Countdown Indicator -->
<!-- ============================================ -->

<!-- Add to popup.html - countdown display area -->
<div id="countdown-container">           <!-- Main countdown container -->
<div id="countdown-indicator">           <!-- Current tab countdown -->
<span id="countdown-time">               <!-- Time display "X:XX" -->
<span id="countdown-label">              <!-- "Suspends in:" label -->


<!-- ============================================ -->
<!-- TASK 2: Dashboard Sync -->
<!-- ============================================ -->

<!-- Add to stats-dashboard.html -->
<div id="stats-last-updated">            <!-- "Last updated: X ago" -->
<button id="stats-refresh-btn">          <!-- Manual refresh button -->
<div id="stats-sync-status">             <!-- Sync status indicator -->


<!-- ============================================ -->
<!-- TASK 3: Exclusion Feedback -->
<!-- ============================================ -->

<!-- Add to popup.html - feedback toast -->
<div id="exclusion-toast">               <!-- Toast container -->
<div id="exclusion-message">             <!-- Main message -->
<div id="exclusion-details">             <!-- Expandable details -->
<button id="exclusion-details-toggle">   <!-- Show/hide details -->
<button id="exclusion-toast-close">      <!-- Close button -->
```

---

## CSS Class Contracts

### EXISTING CLASSES - DO NOT MODIFY

These CSS classes have existing styles. Agents should extend, not override.

```css
/* popup.css - existing classes */
.popup-container
.header
.hero-stats
.hero-value
.hero-label
.quick-actions
.action-btn
.action-btn.primary
.action-btn.secondary
.tabs-container
.tabs-list
.tab-item
.tab-item.active
.tab-item.suspended
.tab-item.idle
.window-group
.window-header
```

### NEW CLASSES - For Feature Implementation

Agents may ADD these new CSS classes.

```css
/* ============================================ */
/* TASK 1: Countdown Indicator */
/* ============================================ */

.countdown-indicator { }
.countdown-indicator.warning { }        /* < 30 seconds */
.countdown-indicator.critical { }       /* < 10 seconds */
.countdown-label { }
.countdown-time { }
.countdown-paused { }


/* ============================================ */
/* TASK 2: Dashboard Sync */
/* ============================================ */

.stats-sync-indicator { }
.stats-sync-indicator.syncing { }
.stats-last-updated { }
.stats-refresh-btn { }


/* ============================================ */
/* TASK 3: Exclusion Feedback */
/* ============================================ */

.exclusion-toast { }
.exclusion-toast.visible { }
.exclusion-toast.fadeout { }
.toast-content { }
.toast-message { }
.toast-details { }
.toast-details.hidden { }
.toast-details-btn { }
.toast-close { }
.exclusion-reason { }
.reason-icon { }
.reason-label { }
.reason-count { }
```

---

## Function Contracts

### DO NOT MODIFY These Functions

Existing functions that MUST NOT be changed:

```javascript
// background.js
shouldSuspendTab(tabId)     // Core suspension logic
suspendTab(tabId)           // Execute suspension
restoreTab(tabId)           // Execute restoration
updateMemoryStats(url)      // Update statistics
getStats()                  // Return statistics
loadSettings()              // Load configuration
saveSettings()              // Save configuration
handleMessage(message)      // Message router

// popup.js
loadStats()                 // Load and display stats
loadTabs()                  // Load and render tab list
handleSuspendAll()          // Suspend all handler
handleRestoreAll()          // Restore all handler
```

### Functions Agents May WRAP or EXTEND

These functions can be wrapped (call original + add behavior):

```javascript
// Example: Extending suspendAllInactive() for exclusion feedback
// CORRECT approach:
async function suspendAllWithFeedback() {
  const exclusionReport = analyzeExclusions();  // New code
  const result = await suspendAllInactive();    // Call original
  showExclusionFeedback(exclusionReport);       // New code
  return result;
}

// INCORRECT approach - don't modify original:
// async function suspendAllInactive() { ... modified ... }
```

---

## Integration Points

### Where Each Feature Hooks In

```
TASK 1 (Countdown):
├── Hook: chrome.alarms.create (after)  → Track timer creation
├── Hook: chrome.alarms.clear (after)   → Remove tracking
├── Hook: tabs.onActivated (listen)     → Update display
└── UI: popup.html hero section         → Add countdown element

TASK 2 (Dashboard Sync):
├── Hook: updateMemoryStats (after)     → Broadcast STATS_UPDATED
├── Hook: popup loadStats (replace)     → Subscribe to broadcasts
├── Hook: dashboard loadStats (replace) → Subscribe to broadcasts
└── UI: stats-dashboard.html            → Add refresh button

TASK 3 (Exclusion Feedback):
├── Hook: handleSuspendAll (wrap)       → Call enhanced version
├── Hook: suspendAllInactive (extend)   → Collect exclusion reasons
└── UI: popup.html (append)             → Add toast container
```

---

## Testing Contracts

Each feature MUST pass these test scenarios:

### Task 1: Countdown Tests
- [ ] Countdown shows correct time for inactive tab
- [ ] Countdown updates every second
- [ ] Countdown resets when tab becomes active
- [ ] Countdown handles service worker restart
- [ ] Countdown shows "Paused" for whitelisted tabs

### Task 2: Dashboard Sync Tests
- [ ] Dashboard shows same stats as popup
- [ ] Stats update immediately after suspension
- [ ] Refresh button fetches latest data
- [ ] "Last updated" shows correct time
- [ ] No data loss during sync

### Task 3: Exclusion Feedback Tests
- [ ] Toast appears after "Suspend All"
- [ ] Correct count of suspended tabs
- [ ] Correct breakdown of exclusion reasons
- [ ] Details expandable/collapsible
- [ ] Toast auto-dismisses after 5 seconds
- [ ] Toast accessible via keyboard

---

## Version Compatibility

All new features MUST:

1. **Support Feature Flags**: Can be disabled without code changes
2. **Graceful Degradation**: Extension works if feature fails
3. **No Breaking Changes**: Existing functionality unaffected
4. **Backward Compatible**: Old storage data still works
