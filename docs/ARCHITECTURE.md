# Tab Suspender Pro - Architecture Documentation

## Overview

Tab Suspender Pro is a Chrome Extension (Manifest V3) that automatically suspends inactive tabs to save memory. This document outlines the complete architecture for agents implementing new features.

---

## File Structure

```
zovo-tab-suspender-pro/
├── manifest.json          # Extension manifest (MV3)
├── background.js          # Service worker (core logic)
├── popup.html/js/css      # Extension popup UI
├── settings.html/js/css   # Options page
├── stats-dashboard.html   # Statistics dashboard (embedded JS)
├── suspended.html/js/css  # Suspended tab placeholder page
├── contentScript.js       # Injected into web pages
├── onboarding.html/js/css # First-run experience
└── icons/                 # Extension icons
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER ACTIONS                                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────┐           ┌───────────────┐           ┌───────────────┐
│    Popup      │           │   Settings    │           │   Context     │
│  (popup.js)   │           │ (settings.js) │           │    Menu       │
└───────────────┘           └───────────────┘           └───────────────┘
        │                           │                           │
        └───────────────────────────┼───────────────────────────┘
                                    │
                    chrome.runtime.sendMessage()
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         BACKGROUND SERVICE WORKER                        │
│                            (background.js)                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  handleMessage() - Routes all message types                      │   │
│  │  ├── SUSPEND_TAB      → suspendTab()                            │   │
│  │  ├── RESTORE_TAB      → restoreTab()                            │   │
│  │  ├── SUSPEND_ALL      → suspendAllInactive()                    │   │
│  │  ├── RESTORE_ALL      → restoreAllTabs()                        │   │
│  │  ├── GET_TAB_LIST     → getTabList()                            │   │
│  │  ├── GET_STATS        → getStats()                              │   │
│  │  ├── GET_SETTINGS     → returns config                          │   │
│  │  ├── SAVE_SETTINGS    → saveSettings()                          │   │
│  │  ├── WHITELIST_DOMAIN → addToWhitelist()                        │   │
│  │  └── REMOVE_WHITELIST → removeFromWhitelist()                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│  ┌─────────────────────────────────┼─────────────────────────────────┐  │
│  │              TIMER SYSTEM (chrome.alarms API)                     │  │
│  │  startTabTimer(tabId) → creates alarm "suspend-tab-{tabId}"      │  │
│  │  clearTabTimer(tabId) → clears alarm                             │  │
│  │  onAlarm listener    → triggers shouldSuspendTab() check         │  │
│  └─────────────────────────────────┼─────────────────────────────────┘  │
└─────────────────────────────────────┼───────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
            ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
            │chrome.storage│  │chrome.tabs   │   │chrome.alarms│
            │  .local      │  │  API         │   │  API        │
            │  .sync       │  └─────────────┘   └─────────────┘
            │  .session    │
            └─────────────┘
```

---

## Storage Schema

### chrome.storage.sync

Used for settings that should sync across devices.

```javascript
{
  "tabSuspenderSettings": {
    "suspensionTimeout": 30,          // Minutes before auto-suspend (default: 30)
    "autoUnsuspendOnFocus": true,     // Restore when tab focused
    "suspendPinnedTabs": false,       // Whether to suspend pinned tabs
    "whitelistedDomains": [           // Domains never to suspend
      "mail.google.com",
      "calendar.google.com",
      "docs.google.com"
    ],
    "neverSuspendAudio": true,        // Don't suspend tabs playing audio
    "neverSuspendActiveTab": true,    // Don't suspend the active tab
    "memoryThreshold": 80,            // Memory % threshold (UI only currently)
    "neverSuspendUnsavedForms": true  // Don't suspend tabs with form data
  }
}
```

### chrome.storage.local

Used for data that should persist locally only.

```javascript
{
  // Statistics
  "memoryStats": {
    "totalSaved": 0,              // Total bytes saved (lifetime)
    "tabsSuspended": 0,           // Lifetime count of suspensions
    "history": [                  // Last 500 suspension events
      {
        "timestamp": 1706900000000,
        "url": "https://example.com/page",
        "memorySaved": 52428800   // 50MB estimated per tab
      }
    ]
  },

  // Installation tracking
  "installDate": 1706800000000,   // Timestamp of first install

  // License system
  "licenseKey": "ZOVO-XXXX-XXXX-XXXX-XXXX",
  "isPro": false,
  "verifiedAt": 1706900000000,    // Last server verification
  "serverSignature": "...",       // Server-provided signature

  // Focus Mode
  "focusModeTrials": 3,           // Remaining free trials
  "focusSessions": [              // Focus mode session history
    {
      "timestamp": 1706900000000,
      "duration": 3600000         // Session duration in ms
    }
  ],

  // Email capture
  "userEmail": "user@example.com"
}
```

### chrome.storage.session

Used for ephemeral data that doesn't need to persist across browser restarts.
Falls back to chrome.storage.local if session storage unavailable.

```javascript
{
  // Tab activity tracking
  "tabLastActivity": {
    "123": 1706900000000,         // tabId: timestamp of last activity
    "456": 1706899000000
  },

  // Form status tracking
  "tabFormStatus": {
    "123": false,                 // tabId: has unsaved form data
    "456": true
  }
}
```

---

## Message Types Reference

### Popup → Background

| Type | Parameters | Response | Description |
|------|------------|----------|-------------|
| `SUSPEND_TAB` | `{ tabId }` | `{ success }` | Suspend specific tab |
| `RESTORE_TAB` | `{ tabId }` | `{ success }` | Restore specific tab |
| `SUSPEND_ALL` | none | `{ success, count }` | Suspend all inactive |
| `RESTORE_ALL` | none | `{ success, count }` | Restore all suspended |
| `GET_TAB_LIST` | none | `Array<Window>` | Get all windows/tabs |
| `GET_STATS` | none | `StatsObject` | Get statistics |
| `GET_SETTINGS` | none | `{ settings }` | Get current config |
| `SAVE_SETTINGS` | `{ settings }` | `{ success }` | Save config |
| `WHITELIST_DOMAIN` | `{ domain }` | `{ success }` | Add to whitelist |
| `REMOVE_WHITELIST` | `{ domain }` | `{ success }` | Remove from whitelist |

### Content Script → Background

| Type | Parameters | Description |
|------|------------|-------------|
| `TAB_ACTIVITY` | `{ timestamp }` | Report user activity |
| `FORM_STATUS` | `{ hasUnsavedForms }` | Report form state |
| `CONTENT_SCRIPT_READY` | none | Notify script loaded |

### Background → Content Script

| Type | Parameters | Response |
|------|------------|----------|
| `GET_TAB_STATE` | none | `{ scrollPosition, formData, lastActivity, hasUnsavedForms }` |
| `RESTORE_STATE` | `{ scrollPosition, formData }` | `{ success }` |
| `GET_ACTIVITY` | none | `{ lastActivity, idleTime }` |

---

## Timer System

The extension uses Chrome's `chrome.alarms` API for suspension timers, which is required for Manifest V3 service workers that can be terminated.

### Alarm Naming Convention
- Pattern: `suspend-tab-{tabId}`
- Example: `suspend-tab-123`

### Timer Lifecycle

1. **Tab Created/Updated**: `startTabTimer(tabId)` creates alarm
2. **Tab Activity**: `resetTabTimer(tabId)` clears and recreates alarm
3. **Alarm Fires**: `onAlarm` listener checks `shouldSuspendTab()`
4. **Tab Suspended**: `clearTabTimer(tabId)` removes alarm
5. **Tab Closed**: `clearTabTimer(tabId)` cleanup

### Key Functions

```javascript
// background.js

async function startTabTimer(tabId) {
  await clearTabTimer(tabId);
  const alarmName = `suspend-tab-${tabId}`;
  await chrome.alarms.create(alarmName, {
    delayInMinutes: config.suspensionTimeout  // From settings
  });
  await updateTabActivity(tabId);
}

async function clearTabTimer(tabId) {
  await chrome.alarms.clear(`suspend-tab-${tabId}`);
}

// Alarm listener
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith('suspend-tab-')) return;
  const tabId = parseInt(alarm.name.replace('suspend-tab-', ''), 10);
  if (await shouldSuspendTab(tabId)) {
    await suspendTab(tabId);
  }
});
```

---

## Suspension Logic

### shouldSuspendTab() Criteria (background.js:439-461)

A tab will NOT be suspended if ANY of these conditions are true:

| Condition | Check | Setting |
|-----------|-------|---------|
| Internal page | `isInternalPage(url)` | Always |
| Already suspended | `isSuspendedPage(url)` | Always |
| Active tab | `tab.active` | `neverSuspendActiveTab` |
| Pinned tab | `tab.pinned` | `!suspendPinnedTabs` |
| Playing audio | `tab.audible` | `neverSuspendAudio` |
| Whitelisted | `isWhitelisted(url)` | Always |
| Unsaved forms | `getTabFormStatus(tabId)` | Always |

### Internal Page Detection

```javascript
// Prefixes that are never suspended
const internalPrefixes = [
  'chrome://', 'chrome-extension://', 'chrome-search://',
  'edge://', 'about:', 'file://', 'data:', 'blob:',
  'javascript:', 'view-source:', 'devtools://',
  'brave://', 'opera://', 'vivaldi://'
];
```

---

## Suspended Tab Page

When a tab is suspended, it's redirected to `suspended.html` with query parameters:

```
chrome-extension://{extensionId}/suspended.html?url={encodedUrl}&title={title}&favicon={encodedFavicon}&time={timestamp}
```

The suspended page displays:
- Original page title and favicon
- Time since suspension
- "Click to restore" functionality
- Original URL for reference

---

## Statistics System

### Stats Calculation (getStats())

```javascript
{
  totalSaved: memoryStats.totalSaved,           // From storage
  todaySaved: /* calculated from history */,    // Filter by today's date
  tabsSuspended: /* current count */,           // chrome.tabs.query suspended
  totalTabs: allTabs.length,                    // Total open tabs
  activeTabs: totalTabs - suspendedCount,       // Non-suspended
  lifetimeTabsSuspended: memoryStats.tabsSuspended  // Lifetime count
}
```

### Memory Estimation

Each suspended tab is estimated to save **50MB** of memory:
```javascript
const estimatedMemory = 50 * 1024 * 1024; // 50MB per tab
```

---

## Event Listeners

### Tab Events (background.js)

| Event | Handler | Action |
|-------|---------|--------|
| `tabs.onActivated` | Reset timer, auto-restore if setting | Timer management |
| `tabs.onUpdated` | Track suspension, reset timer | Stats, timers |
| `tabs.onRemoved` | Clear timer, cleanup storage | Cleanup |
| `tabs.onCreated` | Start timer for new tab | Timer start |

### Alarm Events

| Event | Handler | Action |
|-------|---------|--------|
| `alarms.onAlarm` | Check suspension criteria, suspend | Auto-suspension |

---

## License System

The extension uses a freemium model with server-side license verification.

### Verification Flow

1. On popup load: `checkLicense()` reads stored license
2. If `isPro` and `licenseKey` exist, check `verifiedAt`
3. If >24 hours since verification, call `reVerifyLicense()`
4. Server validates at: `https://xggdjlurppfcytxqoozs.supabase.co/functions/v1/verify-extension-license`
5. Offline grace period: 72 hours

### License Key Format
```
ZOVO-XXXX-XXXX-XXXX-XXXX
```

---

## Critical Paths for Feature Implementation

### For Countdown Indicator (Task 1)

**Read these locations:**
- `background.js:187-201` - `startTabTimer()` alarm creation
- `background.js:209-212` - `resetTabTimer()` logic
- `background.js:214-227` - `updateTabActivity()` storage
- `background.js:13` - `config.suspensionTimeout` (minutes)

**Key insight:** The alarm fires after `suspensionTimeout` minutes. To show countdown:
1. Get alarm info: `chrome.alarms.get('suspend-tab-{tabId}')`
2. Calculate: `alarm.scheduledTime - Date.now()` = remaining ms

### For Dashboard Sync (Task 2)

**Read these locations:**
- `background.js:625-653` - `updateMemoryStats()` writes to storage
- `background.js:655-686` - `getStats()` returns data
- `popup.js:68-105` - `loadStats()` popup implementation
- `stats-dashboard.html:360-387` - `loadStats()` dashboard implementation

**Key insight:** Both use same `GET_STATS` message and `memoryStats` storage key.
Issue is likely timing or the dashboard not refreshing.

### For Exclusion Feedback (Task 3)

**Read these locations:**
- `popup.js:442-476` - `handleSuspendAll()` current implementation
- `background.js:439-461` - `shouldSuspendTab()` exclusion logic
- `background.js:516-528` - `suspendAllInactive()` background version

**Key insight:** Current `handleSuspendAll()` doesn't report WHY tabs weren't suspended.
Need to collect exclusion reasons during the suspension loop.

---

## Performance Considerations

1. **Service Worker Restarts**: Use `chrome.alarms` not `setTimeout`
2. **Storage Access**: Batch reads/writes when possible
3. **Tab Queries**: Cache results, don't query repeatedly
4. **Message Passing**: Use async/await, handle errors gracefully

---

## Security Notes

1. License verification requires server roundtrip
2. Never trust localStorage alone for Pro status
3. Offline grace period prevents lockout
4. Email collection goes to Supabase backend
