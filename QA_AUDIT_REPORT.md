# Tab Suspender Pro v1.0.8 - QA Audit Report

**Date:** January 28, 2026
**Auditor:** Claude Code Review
**Files Analyzed:** background.js, popup.js, contentScript.js, settings.js, suspended.js, manifest.json

---

## EXECUTIVE SUMMARY

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| URL Edge Cases | 1 | 2 | 3 | 2 |
| License Security | 2 | 3 | 2 | 1 |
| Performance | 0 | 2 | 3 | 2 |
| Race Conditions | 0 | 3 | 2 | 0 |
| Error Handling | 0 | 1 | 4 | 3 |
| MV3 Compliance | 1 | 1 | 1 | 0 |
| **TOTAL** | **4** | **12** | **15** | **8** |

**SHIP/NO-SHIP DECISION: ⚠️ FIX CRITICAL & HIGH FIRST**

---

## CRITICAL BUGS (4)

### CRIT-1: Missing Special Protocol Handling
**File:** `background.js:468-474`, `popup.js:353`
**Severity:** CRITICAL
**Impact:** Extension crashes or unpredictable behavior

```javascript
// CURRENT CODE
function isInternalPage(url) {
    if (!url) return true;
    return url.startsWith('chrome://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:');
}
```

**MISSING PROTOCOLS:**
- `file://` - Local files (will crash on suspend)
- `data:` - Data URLs (will create invalid suspended URL)
- `blob:` - Blob URLs (will fail to restore)
- `javascript:` - JavaScript protocol (security risk)
- `view-source:` - View source pages
- `devtools://` - DevTools pages
- `chrome-search://` - Chrome search

**FIX:**
```javascript
function isInternalPage(url) {
    if (!url) return true;
    const internalPrefixes = [
        'chrome://', 'chrome-extension://', 'edge://', 'about:',
        'file://', 'data:', 'blob:', 'javascript:', 'view-source:',
        'devtools://', 'chrome-search://', 'brave://', 'opera://'
    ];
    return internalPrefixes.some(prefix => url.startsWith(prefix));
}
```

---

### CRIT-2: Service Worker Timer Loss (MV3)
**File:** `background.js:27-28`
**Severity:** CRITICAL
**Impact:** All auto-suspend timers lost when service worker unloads

```javascript
// CURRENT CODE - Stored only in memory
const tabTimers = new Map();
const tabLastActivity = new Map();
```

**PROBLEM:** MV3 service workers can unload after 5 minutes of inactivity. When this happens:
- All tabTimers are lost
- Tabs will never auto-suspend until user interacts with extension

**FIX:** Use `chrome.alarms` API instead of `setTimeout`:
```javascript
// Use chrome.alarms for persistence
chrome.alarms.create(`suspend-${tabId}`, {
    delayInMinutes: config.suspensionTimeout
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name.startsWith('suspend-')) {
        const tabId = parseInt(alarm.name.replace('suspend-', ''));
        await suspendTab(tabId);
    }
});
```

---

### CRIT-3: License Bypass via DevTools
**File:** `popup.js:836-852`
**Severity:** CRITICAL
**Impact:** Users can unlock Pro features without paying

```javascript
// CURRENT CODE - Client-side only unlock
function unlockProFeatures() {
    document.querySelectorAll('.pro-badge').forEach(el => {
        el.style.display = 'none';
    });
    // ... just hides UI elements
}
```

**PROBLEM:** User can:
1. Open DevTools
2. Run: `chrome.storage.local.set({ isPro: true })`
3. Reload popup - Pro features unlocked without valid license

**FIX:**
1. Re-verify license on every Pro feature use
2. Server-side feature gating
3. Sign license responses with timestamp

---

### CRIT-4: URL Injection in Suspended Page
**File:** `suspended.js:125`
**Severity:** CRITICAL (Security)
**Impact:** Potential open redirect vulnerability

```javascript
// CURRENT CODE
window.location.href = originalUrl;
```

**PROBLEM:** The `originalUrl` comes from URL parameters which can be manipulated:
```
suspended.html?url=javascript:alert(document.cookie)
```

**FIX:**
```javascript
function restore() {
    if (!originalUrl) return;

    // Validate URL before redirect
    try {
        const urlObj = new URL(originalUrl);
        // Only allow http/https
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
            console.error('Invalid protocol:', urlObj.protocol);
            return;
        }
        window.location.href = originalUrl;
    } catch (e) {
        console.error('Invalid URL:', originalUrl);
    }
}
```

---

## HIGH PRIORITY BUGS (12)

### HIGH-1: No Rate Limiting on License API Calls
**File:** `popup.js:733-755`
**Impact:** API abuse, potential DoS

User can spam "Activate" button or programmatically call API thousands of times.

**FIX:** Add client-side throttling + backend rate limiting.

---

### HIGH-2: License Key Visible in Console
**File:** `background.js:267`
**Impact:** Privacy/security concern

```javascript
console.log('Received message:', message.type);
// License key included in message
```

**FIX:** Remove production logging or filter sensitive data.

---

### HIGH-3: Duplicate suspendTabDirect Function
**File:** `popup.js:350-369` and `popup.js:694-705`
**Impact:** Inconsistent behavior, maintenance nightmare

Two different implementations of the same function with different parameter encoding.

**FIX:** Consolidate into single function.

---

### HIGH-4: Race Condition on Suspend All
**File:** `popup.js:391-419`
**Impact:** Clicking rapidly causes duplicate operations

```javascript
// No protection against rapid clicks
async function handleSuspendAll() {
    suspendAllBtn.disabled = true; // Only UI disabled
    // But user can call function directly or press keyboard shortcut
```

**FIX:** Add operation lock:
```javascript
let isSuspending = false;
async function handleSuspendAll() {
    if (isSuspending) return;
    isSuspending = true;
    try { /* ... */ } finally { isSuspending = false; }
}
```

---

### HIGH-5: Focus Mode Activates with No Tabs
**File:** `popup.js:584-630`
**Impact:** Confusing UX, trial wasted

If user has 1 tab open and clicks Focus Mode, it:
- Uses a trial (decrements counter)
- Shows "0 tabs suspended"
- Achieves nothing

**FIX:** Check `tabsToSuspend.length > 0` before decrementing trial.

---

### HIGH-6: Form Data Lost on Unsaved Forms
**File:** `background.js:327-342`
**Impact:** Data loss despite "neverSuspendUnsavedForms" setting

The `neverSuspendUnsavedForms` setting exists but is never checked in `shouldSuspendTab()`.

**FIX:** Implement form detection check.

---

### HIGH-7: Whitelist Check is Partial Match
**File:** `background.js:434-441`
**Impact:** Over-matching domains

```javascript
// CURRENT CODE
return config.whitelistedDomains.some(d => urlObj.hostname.includes(d));
```

**PROBLEM:** Whitelisting "mail.com" also whitelists "not-mail.com"

**FIX:** Use exact match or subdomain matching:
```javascript
return config.whitelistedDomains.some(d =>
    urlObj.hostname === d || urlObj.hostname.endsWith('.' + d)
);
```

---

### HIGH-8: No Validation on Settings Import
**File:** `settings.js:238-256`
**Impact:** Malformed data crashes extension

```javascript
const imported = JSON.parse(text);
await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: imported });
```

**FIX:** Validate imported settings against schema.

---

### HIGH-9: Memory History Grows Unbounded
**File:** `background.js:500-502`
**Impact:** Storage bloat over time

```javascript
if (stats.history.length > 500) {
    stats.history = stats.history.slice(-500);
}
```

**PROBLEM:** 500 items × ~100 bytes = 50KB per user, stored forever.

**FIX:** Also prune entries older than 30 days.

---

### HIGH-10: No Offline License Cache Expiry
**File:** `popup.js:714-730`
**Impact:** Expired licenses continue working

License is checked once and cached in `chrome.storage.local` forever without expiry.

**FIX:** Add `verifiedAt` timestamp check and re-verify after 24-48 hours.

---

### HIGH-11: Tab Action Buttons Not Debounced
**File:** `popup.js:328-344`
**Impact:** Double-clicking suspends/restores twice

```javascript
actionBtn.addEventListener('click', async (e) => {
    // No protection against rapid clicks
```

**FIX:** Disable button immediately and re-enable after operation.

---

### HIGH-12: Extension Restart Required After License
**File:** N/A
**Impact:** Poor UX

After activating Pro, the background script still has `isPro = false` until restart. Some features may not work until user reloads extension.

**FIX:** Send message to background script on license activation.

---

## MEDIUM PRIORITY (15)

### MED-1: 30-Second Polling in Popup
**File:** `popup.js:537-539`
**Impact:** Battery/CPU drain

```javascript
setInterval(() => { loadStats(); }, 30000);
```

The popup is only open for seconds typically. This interval is excessive.

**FIX:** Remove interval or increase to 60+ seconds.

---

### MED-2: Favicon Error Handling Silently Fails
**File:** `popup.js:311-315`
**Impact:** Broken image icons

```javascript
faviconImg.onerror = function() {
    this.src = '';
    this.classList.add('placeholder');
};
```

Setting `src = ''` still shows broken image. Should use a default icon.

---

### MED-3: Unicode URL Display Issues
**File:** `popup.js:513-527`
**Impact:** Punycode domains show ugly encoded names

URLs like `https://例え.jp/` show as `xn--r8jz45g.jp` instead of the Unicode version.

---

### MED-4: Extremely Long URLs Overflow
**File:** `popup.js:294-308`
**Impact:** UI breaks with long URLs

No truncation on URL display.

---

### MED-5: No Keyboard Navigation in Tab List
**File:** `popup.js`
**Impact:** Accessibility violation (WCAG 2.1)

Tab items are not focusable with Tab key.

---

### MED-6: Missing Loading State for License Check
**File:** `popup.js:714-730`
**Impact:** UI flickers on load

License status is determined async but UI shows default state first.

---

### MED-7: Settings Page Has No Max Values
**File:** `settings.js:163`
**Impact:** Invalid configuration possible

```javascript
suspensionTimeout: parseInt(timeoutSlider.value),
```

No validation that value is within valid range.

---

### MED-8: No Confirmation for Restore All
**File:** `popup.js:421-449`
**Impact:** Accidental restoration of many tabs

"Restore All" immediately restores potentially 100+ tabs without confirmation.

---

### MED-9: Focus Mode Trial Message Duplicates
**File:** `popup.js:655-664`
**Impact:** Multiple messages appended on repeated use

`showFocusModeTrialMessage()` appends a new element each time called.

---

### MED-10: Error Messages Not User-Friendly
**File:** Multiple
**Impact:** Confusing error messages

```javascript
tabsList.innerHTML = '<div class="empty-state"><p>Error: ' + error.message + '</p></div>';
```

Technical error messages shown to users.

---

### MED-11: Content Script Runs on All URLs
**File:** `manifest.json:34-41`
**Impact:** Performance, privacy concerns

```json
"matches": ["<all_urls>"]
```

Content script runs on every page, even where not needed.

---

### MED-12: No Feedback When Whitelist Full
**File:** N/A
**Impact:** Silent failure

If whitelist reaches storage limits, no error shown.

---

### MED-13: Stats Dashboard Link May 404
**File:** `settings.js:130-132`
**Impact:** Broken feature

```javascript
chrome.tabs.create({ url: chrome.runtime.getURL('stats-dashboard.html') });
```

If stats-dashboard.html doesn't exist or has errors, user sees blank page.

---

### MED-14: Missing aria-labels
**File:** `popup.html`, `settings.html`
**Impact:** Screen reader inaccessible

Buttons with only SVG icons have no accessible labels.

---

### MED-15: Auto-Refresh After Suspend Hardcoded
**File:** `popup.js:340-343`
**Impact:** Inconsistent timing

```javascript
setTimeout(() => {
    loadStats();
    loadTabs();
}, 300);
```

300ms may not be enough for slow systems.

---

## LOW PRIORITY (8)

1. **formatBytes doesn't handle negative numbers** (`popup.js:503`)
2. **No dark mode support** (CSS doesn't check prefers-color-scheme)
3. **Console logs in production** (51 console statements)
4. **Magic numbers without constants** (50MB, 500 items, 30000ms, etc.)
5. **Duplicate escapeHtml function** (could use textContent directly)
6. **No telemetry for errors** (can't diagnose user issues)
7. **Version hardcoded in multiple places** (manifest.json + popup.html footer)
8. **No changelog/release notes** accessible to users

---

## EDGE CASE URL TEST MATRIX

| URL Type | Should Suspend? | Current Behavior | Status |
|----------|-----------------|------------------|--------|
| `chrome://settings` | NO | Skipped | ✅ |
| `chrome-extension://xyz/popup.html` | NO | Skipped | ✅ |
| `edge://settings` | NO | Skipped | ✅ |
| `about:blank` | NO | Skipped | ✅ |
| `file:///Users/doc.html` | NO | **SUSPENDED** | ❌ CRITICAL |
| `data:text/html,<h1>Test</h1>` | NO | **SUSPENDED** | ❌ CRITICAL |
| `blob:https://...` | NO | **SUSPENDED** | ❌ CRITICAL |
| `javascript:alert(1)` | NO | **SUSPENDED** | ❌ SECURITY |
| `view-source:https://...` | NO | **SUSPENDED** | ❌ BUG |
| `https://例え.jp/` | YES | Works | ✅ |
| `https://site.com/path?q=日本語` | YES | Works | ✅ |
| Tab with audio | DEPENDS | Respected | ✅ |
| Tab with unsaved form | DEPENDS | **NOT CHECKED** | ❌ HIGH |
| Pinned tab | DEPENDS | Respected | ✅ |
| Active tab | NO | Respected | ✅ |

---

## RECOMMENDED FIXES BY PRIORITY

### Immediate (Before Ship)
1. Fix special protocol handling (CRIT-1)
2. Add URL validation in suspended.js (CRIT-4)
3. Fix license bypass vulnerability (CRIT-3)
4. Add operation locks for race conditions (HIGH-4)

### Week 1
5. Migrate to chrome.alarms API (CRIT-2)
6. Implement form detection (HIGH-6)
7. Fix whitelist partial matching (HIGH-7)
8. Add settings validation (HIGH-8)
9. Add license expiry checking (HIGH-10)

### Week 2+
10. Improve accessibility (MED-5, MED-14)
11. Add confirmation dialogs (MED-8)
12. Clean up console logs
13. Add telemetry

---

## PERFORMANCE BENCHMARKS NEEDED

Before ship, manually test and document:

| Metric | Target | Actual |
|--------|--------|--------|
| Popup open time (10 tabs) | <200ms | ? |
| Popup open time (100 tabs) | <500ms | ? |
| Suspend All (50 tabs) | <5s | ? |
| Restore All (50 tabs) | <5s | ? |
| Memory (idle, 0 suspended) | <20MB | ? |
| Memory (after 1hr, 50 suspended) | <25MB | ? |

---

## MANIFEST V3 COMPLIANCE CHECKLIST

- [x] manifest_version: 3
- [x] service_worker (not background.scripts)
- [ ] No chrome.extension.* APIs
- [x] No inline scripts in HTML
- [x] No eval() or Function()
- [ ] Alarms API for timers (NEEDED)
- [x] Proper host_permissions
- [x] Proper permissions justified

---

**Report Generated:** 2026-01-28
**Next Review:** After critical fixes applied
