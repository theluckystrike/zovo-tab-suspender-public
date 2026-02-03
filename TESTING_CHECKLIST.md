# Tab Suspender Community Edition - Testing Checklist

## Pre-Testing Setup

### 1. Load Extension in Chrome
```
1. Open Chrome
2. Navigate to chrome://extensions/
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select the directory containing this extension
```

### 2. Verify Extension Loaded
- [ ] Extension appears in chrome://extensions/
- [ ] Extension icon appears in Chrome toolbar
- [ ] No errors shown in extension card

---

## Visual Testing (Dark Theme)

### 3. Open Popup
```
Click the Tab Suspender Pro icon in the toolbar
```

**Expected:**
- [ ] Popup opens with dark theme (dark slate background #0F172A)
- [ ] Header shows "Tab Suspender Pro" with settings gear icon
- [ ] Popup dimensions: 350px wide, 600px tall

### 4. Hero Stats Section
**Expected:**
- [ ] Large memory saved value displayed (48px font, green color #10B981)
- [ ] "SAVED TODAY" label below the value
- [ ] Percentage change indicator with ▲ or ▼ symbol
- [ ] Progress bar showing progress toward 1GB goal
- [ ] Tab count and window count displayed (e.g., "0 tabs · 0 windows")
- [ ] Dynamic hero message displayed (italic text)

### 5. Quick Actions Buttons
**Expected:**
- [ ] Three buttons visible: "Suspend All", "Restore All", and shield icon
- [ ] Buttons have gradient styling (purple/indigo)
- [ ] Buttons respond to hover (translateY animation)

### 6. Focus Mode Section
**Expected:**
- [ ] Section with border visible
- [ ] Title "Focus Mode" with target icon
- [ ] "PRO" badge in gold color (#F59E0B)
- [ ] Description text: "Suspend all tabs except current. Perfect for deep work."
- [ ] Button text: "Try Free (3 left)"
- [ ] Section has hover effect (border changes to indigo)

### 7. License Section
**Expected:**
- [ ] Section with "🔑 Have a Pro License?" heading
- [ ] Input field for license key
- [ ] "Activate" button
- [ ] "Get Pro License →" link at bottom

### 8. Footer
**Expected:**
- [ ] "Powered by Zovo" text on left
- [ ] Version "v1.0.3" badge on right

---

## Functional Testing

### 9. Suspend All Functionality
**Test:**
1. Open multiple tabs (at least 5)
2. Click "Suspend All" button

**Expected:**
- [ ] All tabs except active one get suspended
- [ ] Suspended tabs show suspended.html page
- [ ] Tab count in hero stats updates
- [ ] Memory saved value increases

### 10. Restore All Functionality
**Test:**
1. With suspended tabs present
2. Click "Restore All" button

**Expected:**
- [ ] All suspended tabs restore to original URLs
- [ ] Tab count updates
- [ ] Memory saved value may decrease

### 11. Focus Mode Trial System
**Test:**
1. Click "Try Free (3 left)" button
2. Observe behavior

**Expected:**
- [ ] All tabs except current get suspended
- [ ] "Focus Mode Active" section appears
- [ ] Shows count of suspended tabs
- [ ] Shows current tab title
- [ ] "Exit Focus Mode" button visible
- [ ] Button text updates to "Try Free (2 left)"

**Repeat 2 more times:**
- [ ] Second use: "Try Free (1 left)"
- [ ] Third use: "Try Free (0 left)" or upgrade prompt

### 12. Focus Mode Exit
**Test:**
1. While in Focus Mode
2. Click "Exit Focus Mode" button

**Expected:**
- [ ] Focus Mode active section disappears
- [ ] Regular Focus Mode button returns
- [ ] Trial count preserved

### 13. Focus Mode Trial Exhaustion
**Test:**
1. Use Focus Mode 3 times (exhaust trials)
2. Try to activate Focus Mode again

**Expected:**
- [ ] Upgrade prompt appears
- [ ] Cannot activate Focus Mode without Pro license

---

## Progress Bar Testing

### 14. Progress Bar Animation
**Test:**
1. Suspend multiple tabs
2. Watch progress bar

**Expected:**
- [ ] Progress bar fills based on memory saved
- [ ] Target is 1GB (progress = memory_saved / 1GB × 100%)
- [ ] Smooth animation (0.5s ease transition)
- [ ] Gradient fill (indigo to purple)
- [ ] Glow effect visible

---

## Dynamic Messaging Testing

### 15. Hero Messages
**Test:**
1. Suspend various amounts of memory
2. Observe hero message changes

**Expected messages based on memory saved:**
- [ ] < 50 MB: "Suspend more tabs to see the magic happen ✨"
- [ ] 50-100 MB: "Every MB counts. You're doing great!"
- [ ] 100-500 MB: "Great start! Keep those tabs suspended"
- [ ] 500 MB - 1 GB: "You're making a difference, one tab at a time"
- [ ] 1-2 GB: "That's like closing Chrome and reopening it 3x faster"
- [ ] 2-5 GB: "That's like getting a free RAM upgrade"
- [ ] 5+ GB: "You're a memory-saving champion! 🏆"

---

## Percentage Change Testing

### 16. Yesterday Comparison
**Test:**
1. Wait for stats system to have yesterday's data
2. Suspend more or fewer tabs than yesterday

**Expected:**
- [ ] ▲ symbol with green background if today > yesterday
- [ ] ▼ symbol with red background if today < yesterday
- [ ] Percentage accurately calculated: ((today - yesterday) / yesterday × 100)

---

## Storage Testing

### 17. Focus Mode Trials Persistence
**Test:**
1. Use Focus Mode once
2. Close popup
3. Reopen popup

**Expected:**
- [ ] Trial count persists (stored in chrome.storage.local)
- [ ] Button shows correct remaining trials

---

## Error Handling

### 18. Edge Cases
**Test various edge cases:**

- [ ] **No tabs to suspend:** Click "Suspend All" with only 1 tab open
  - Expected: No crash, message or no-op behavior

- [ ] **Already in Focus Mode:** Try to activate Focus Mode while already active
  - Expected: No crash, ignores or shows message

- [ ] **Chrome system tabs:** Try to suspend chrome:// URLs
  - Expected: Skipped automatically, no errors

---

## Visual Regression Testing

### 19. Different Screen Sizes
**Test:**
- [ ] Popup looks correct at 350px width
- [ ] All elements visible without scrolling (within 600px height)
- [ ] No horizontal scrollbar

### 20. Color Consistency
**Verify colors match specification:**
- [ ] Background: #0F172A (dark slate)
- [ ] Accent: #6366F1 (indigo)
- [ ] Success/Memory: #10B981 (green)
- [ ] PRO Badge: #F59E0B (gold)
- [ ] Text Primary: #F8FAFC (light)

---

## Performance Testing

### 21. Popup Load Time
**Test:**
- [ ] Popup opens quickly (< 500ms)
- [ ] No visible layout shift
- [ ] Stats populate immediately

### 22. Memory Impact
**Test:**
1. Check extension's memory usage in chrome://extensions/
2. Use extension for various operations

**Expected:**
- [ ] Memory footprint reasonable (< 50 MB)
- [ ] No memory leaks after repeated use

---

## Compatibility Testing

### 23. Chrome Version
**Test:**
- [ ] Extension works on Chrome 120+
- [ ] Manifest V3 compliant

---

## Final Verification

### 24. No Console Errors
**Test:**
1. Open DevTools (F12)
2. Go to Console tab
3. Use all extension features

**Expected:**
- [ ] No red errors in console
- [ ] Only expected log messages (if any)

### 25. Settings Page
**Test:**
1. Click settings gear icon

**Expected:**
- [ ] Settings page opens
- [ ] (Note: Settings page redesign is in next phase)

---

## Known Limitations (For Next Phase)

### Features Not Yet Implemented:
- [ ] Upgrade modal (using browser confirm() for now)
- [ ] Settings page dark theme redesign
- [ ] Tab Groups preview section
- [ ] Snapshots preview section

---

## Test Summary

**Date Tested:** ___________
**Tester:** ___________
**Browser:** Chrome ___________
**OS:** ___________

**Result:**
- [ ] All tests passed - Ready for production
- [ ] Minor issues found (list below)
- [ ] Major issues found (list below)

**Issues Found:**
1.
2.
3.

**Notes:**



---

## Quick Smoke Test (5 minutes)

If you're short on time, run this quick test:

1. [ ] Load extension
2. [ ] Open popup - dark theme visible
3. [ ] Hero stats showing
4. [ ] Click "Suspend All" - tabs suspend
5. [ ] Click "Try Free (3 left)" - Focus Mode activates
6. [ ] Click "Exit Focus Mode" - returns to normal
7. [ ] Progress bar animates
8. [ ] No console errors

If all 8 quick tests pass, core functionality is working.

---

**End of Testing Checklist**
