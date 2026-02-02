# Dashboard Sync Issue - Diagnosis Report

## Issue Summary
The Statistics Dashboard (`stats-dashboard.html`) shows 0 for all statistics while the popup (`popup.js`) shows correct data.

## Root Cause Analysis

### 1. No Race Condition Found
Both popup and dashboard use the same message type `GET_STATS` to fetch statistics from the background script. The `getStats()` function in `background.js` (lines 655-686) correctly reads from `chrome.storage.local` and returns the same data to any caller.

### 2. Element IDs Are Correct
- Dashboard uses: `totalSaved`, `tabsSuspended`, `todaySaved`, `avgDaily`
- These IDs match what `loadStats()` expects in `stats-dashboard.html` (lines 340-348)

### 3. The Real Issue: No Real-Time Updates

**Problem 1: Dashboard loads stats only once**
```javascript
// stats-dashboard.html line 355-358
document.addEventListener('DOMContentLoaded', async () => {
    await loadStats();
    setupEventListeners();
});
```
The dashboard fetches stats ONCE on page load and never updates again.

**Problem 2: Popup has auto-refresh, dashboard doesn't**
```javascript
// popup.js line 612-614
setInterval(() => {
    loadStats();
}, 30000); // 30 seconds
```
The popup refreshes every 30 seconds, but dashboard has no such mechanism.

**Problem 3: No broadcast when stats change**
When `updateMemoryStats()` is called in `background.js` (lines 625-653), it updates storage but does NOT notify any open UI (popup or dashboard) that data has changed.

### 4. Why Dashboard May Show 0 Initially
If the dashboard is opened immediately after install or before any tabs have been suspended, `memoryStats` in storage will have default values:
```javascript
{ totalSaved: 0, tabsSuspended: 0, history: [] }
```

## Solution Implementation

### Step 1: Add STATS_UPDATED Broadcast
In `background.js`, after `updateMemoryStats()` completes, broadcast the new stats:
```javascript
chrome.runtime.sendMessage({
  type: 'STATS_UPDATED',
  stats: await getStats(),
  timestamp: Date.now()
}).catch(() => {}); // Ignore if no listeners
```

### Step 2: Subscribe in Dashboard
The dashboard needs to listen for broadcasts:
```javascript
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATS_UPDATED') {
    renderStats(message.stats);
    updateLastUpdated(message.timestamp);
  }
});
```

### Step 3: Add Manual Refresh
Add a refresh button and "Last updated" indicator for user control.

### Step 4: Feature Flag Protection
All new code wrapped with:
```javascript
if (!FEATURES.DASHBOARD_SYNC) return;
```

## Files Changed
1. `background.js` - Add broadcast after stats update
2. `stats-dashboard.html` - Subscribe to broadcasts, add refresh UI
3. `src/features/stats/stats-manager.js` - Centralized stats management (new)
4. `src/features/stats/dashboard-provider.js` - Dashboard sync provider (new)

## Testing Checklist
- [ ] Dashboard shows same stats as popup
- [ ] Stats update in real-time when tabs are suspended
- [ ] Refresh button fetches latest data
- [ ] "Last updated" shows correct time
- [ ] Feature can be disabled via feature flag
- [ ] No errors when dashboard is closed (broadcast catch)
