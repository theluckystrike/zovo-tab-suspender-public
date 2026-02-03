# Tab Suspender Pro - Testing Checklist

This document provides a comprehensive test checklist for verifying the functionality of Tab Suspender Pro extension.

## Pre-requisites

- Chrome browser version 88 or higher
- Developer mode enabled in chrome://extensions
- Extension loaded from unpacked directory

---

## 1. Extension Install/Reload Behavior

### Fresh Installation
- [ ] Extension installs without errors
- [ ] Onboarding page opens automatically on first install
- [ ] Extension icon appears in Chrome toolbar
- [ ] Context menu items are created (right-click on any page)
- [ ] Default settings are applied correctly:
  - Suspension timeout: 30 minutes
  - Never suspend audio tabs: enabled
  - Never suspend active tab: enabled
  - Never suspend unsaved forms: enabled
  - Suspend pinned tabs: disabled
  - Auto-restore on focus: enabled

### Extension Reload/Update
- [ ] Reloading extension preserves saved settings
- [ ] Reloading extension preserves memory stats
- [ ] Existing suspension timers restart correctly after reload
- [ ] No console errors on reload
- [ ] Badge count updates correctly after reload

### Service Worker Behavior
- [ ] Service worker starts without errors (check chrome://serviceworker-internals)
- [ ] Service worker survives idle timeout and wakes on alarms
- [ ] Context invalidation is handled gracefully (no crashes)

---

## 2. Whitelist Functionality

### Adding to Whitelist
- [ ] "Whitelist" button in popup works for current site
- [ ] Sites can be added via Settings page "Add current site" button
- [ ] Sites can be added manually via domain input in Settings
- [ ] www prefix is normalized (www.example.com -> example.com)
- [ ] Duplicate domains are rejected with appropriate feedback
- [ ] Success/error feedback appears after whitelist action

### Whitelist Behavior
- [ ] Whitelisted tabs show "Whitelisted" status in exclusion feedback
- [ ] Whitelisted tabs are NOT suspended during "Suspend All"
- [ ] Whitelisted tabs are NOT auto-suspended after timeout
- [ ] Subdomains of whitelisted domains are also protected (e.g., mail.google.com when google.com is whitelisted)

### Removing from Whitelist
- [ ] Sites can be removed via Settings page
- [ ] Removed sites become suspendable again
- [ ] Background config reloads after whitelist changes

### Free Tier Limits
- [ ] Free users limited to 5 whitelisted domains
- [ ] Limit modal appears when trying to add 6th domain
- [ ] Pro users have unlimited whitelist entries

---

## 3. Focus Mode Activation/Exit

### Activation
- [ ] Focus Mode button visible in popup
- [ ] Clicking "Enter Focus Mode" suspends all inactive tabs
- [ ] Active tab is NOT suspended during Focus Mode
- [ ] Focus Mode indicator appears in popup
- [ ] Suspended tab count displayed correctly
- [ ] Focus Mode session timestamp is recorded

### During Focus Mode
- [ ] Focus Mode banner visible in popup
- [ ] Current active tab info displayed
- [ ] "Exit Focus" button is accessible
- [ ] Navigation to other tabs works normally

### Exit Focus Mode
- [ ] "Exit Focus" button restores previously suspended tabs
- [ ] Focus session is logged to storage
- [ ] UI returns to normal state
- [ ] Stats are updated with session data

### Pro/Free Limitations
- [ ] Free users have limited Focus Mode trials
- [ ] Trial counter decrements correctly
- [ ] Pro users have unlimited Focus Mode access

---

## 4. Stats Dashboard Data Display

### Overview Cards
- [ ] "Total Memory Saved" displays correctly (lifetime total)
- [ ] "Tabs Suspended" shows lifetime count
- [ ] "Today's Savings" shows today's memory saved
- [ ] "Daily Average" calculates correctly based on install date

### Chart Display
- [ ] Chart renders for 7-day period by default
- [ ] Period buttons (7, 14, 30 days) work correctly
- [ ] Chart bars scale correctly based on data
- [ ] Date labels format correctly (e.g., "Jan 15")
- [ ] Hover shows memory value for each bar

### Top Sites Section
- [ ] Top 5 most-suspended sites displayed
- [ ] Count shows correctly for each domain
- [ ] Empty state shows "No data yet" when appropriate

### Focus Sessions Section
- [ ] Total Focus sessions count displayed
- [ ] Total Focus time displayed in hours/minutes
- [ ] "This Week" count is accurate

### Live Sync (Dashboard)
- [ ] "Live" indicator appears when connected
- [ ] "Last updated" timestamp updates
- [ ] Manual refresh button works
- [ ] Stats update automatically when tabs are suspended

### Data Management
- [ ] Export button downloads JSON file with all stats
- [ ] Reset button clears all statistics (with confirmation)
- [ ] Share buttons generate correct social media posts

---

## 5. Tab Suspension and Restoration

### Manual Suspension
- [ ] Individual tab "Suspend" button works in popup
- [ ] "Suspend All Tabs" button suspends all eligible tabs
- [ ] Suspended tabs show custom suspended.html page
- [ ] Original URL, title, and favicon preserved in suspended page
- [ ] Badge count updates to show suspended tab count

### Auto-Suspension
- [ ] Tabs auto-suspend after configured timeout (default 30 min)
- [ ] Active tab is never auto-suspended
- [ ] Pinned tabs respect "Suspend pinned tabs" setting
- [ ] Audio-playing tabs respect "Never suspend audio" setting
- [ ] Tabs with unsaved forms respect "Never suspend unsaved forms" setting
- [ ] Whitelisted tabs are never auto-suspended

### Restoration
- [ ] Individual tab "Restore" button works in popup
- [ ] "Restore All" button restores all suspended tabs
- [ ] Clicking suspended page restores original URL
- [ ] Auto-restore on focus works when enabled
- [ ] Scroll position is restored (if implemented)

### Exclusion Feedback
- [ ] "Suspend All" shows toast with exclusion summary
- [ ] Exclusion reasons displayed: Whitelisted, Pinned, Playing audio, Unsaved forms, Active tab, Already suspended, System pages
- [ ] Details expandable to see specific tabs

### Edge Cases
- [ ] Internal pages (chrome://, about:, etc.) cannot be suspended
- [ ] Extension pages (chrome-extension://) cannot be suspended
- [ ] Newly created tabs get suspension timer
- [ ] Tab URL changes reset suspension timer
- [ ] Tab closes cleanly remove associated timers and data

---

## 6. Keyboard Shortcuts

- [ ] Alt+S: Suspend current tab
- [ ] Alt+Shift+S: Suspend all other tabs
- [ ] Alt+R: Restore all tabs
- [ ] Alt+W: Whitelist current site

---

## 7. Context Menu

- [ ] "Suspend this tab" menu item works
- [ ] "Suspend other tabs" menu item works
- [ ] "Never suspend this site" menu item works
- [ ] "Restore all tabs" menu item works

---

## 8. Settings Page

### Profile Selection
- [ ] Relaxed (60 min), Balanced (30 min), Aggressive (15 min) profiles work
- [ ] Custom timing slider available for Pro users
- [ ] Profile change updates suspension timeout immediately

### Protection Toggles
- [ ] "Never suspend audio tabs" toggle works
- [ ] "Never suspend unsaved forms" toggle works
- [ ] "Never suspend pinned tabs" toggle works
- [ ] "Never suspend active tab" toggle works
- [ ] "Auto-restore on focus" toggle works
- [ ] Badge indicators update based on active protections

### Import/Export
- [ ] Export creates valid JSON file
- [ ] Import restores settings correctly
- [ ] Invalid import data handled gracefully

### License Activation
- [ ] License modal opens correctly
- [ ] Valid license key activates Pro features
- [ ] Invalid license shows error message
- [ ] Offline fallback accepts ZOVO- prefixed keys

---

## 9. Error Handling

- [ ] Extension handles tab close during suspension gracefully
- [ ] Extension handles service worker restart gracefully
- [ ] Network errors during license check don't crash extension
- [ ] Invalid URLs handled without errors
- [ ] Storage quota exceeded handled gracefully

---

## 10. Performance

- [ ] Extension doesn't significantly impact browser performance
- [ ] Popup opens quickly (<500ms)
- [ ] Tab list loads quickly even with 50+ tabs
- [ ] Memory stats calculation doesn't block UI
- [ ] Content script doesn't impact page load time

---

## Test Environment Notes

- **Chrome Version**: _________________
- **OS**: _________________
- **Extension Version**: 1.0.18
- **Test Date**: _________________
- **Tester**: _________________

## Issues Found

| Issue # | Description | Severity | Status |
|---------|-------------|----------|--------|
| | | | |

---

## Sign-off

- [ ] All critical tests passed
- [ ] All major tests passed
- [ ] Known issues documented
- [ ] Ready for release

Tested by: _______________  Date: _______________
