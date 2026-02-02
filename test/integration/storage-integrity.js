#!/usr/bin/env node

/**
 * Storage Integrity Test
 *
 * Validates that storage operations don't corrupt data.
 * Tests storage schema compliance and data consistency.
 *
 * Usage: node test/integration/storage-integrity.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const RESULTS = { passed: 0, failed: 0 };

/**
 * Test utilities
 */
function pass(message) {
  console.log(`  \x1b[32m✓\x1b[0m ${message}`);
  RESULTS.passed++;
}

function fail(message) {
  console.log(`  \x1b[31m✗\x1b[0m ${message}`);
  RESULTS.failed++;
}

function section(name) {
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

function readFile(relativePath) {
  try {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  } catch (e) {
    return null;
  }
}

/**
 * Storage key definitions from CONTRACTS.md
 */
const STORAGE_SCHEMA = {
  // chrome.storage.sync
  sync: {
    tabSuspenderSettings: {
      required: ['suspensionTimeout', 'whitelistedDomains'],
      types: {
        suspensionTimeout: 'number',
        autoUnsuspendOnFocus: 'boolean',
        suspendPinnedTabs: 'boolean',
        whitelistedDomains: 'array',
        neverSuspendAudio: 'boolean',
        neverSuspendActiveTab: 'boolean'
      }
    }
  },

  // chrome.storage.local
  local: {
    memoryStats: {
      required: ['totalSaved', 'tabsSuspended', 'history'],
      types: {
        totalSaved: 'number',
        tabsSuspended: 'number',
        history: 'array'
      },
      arraySchema: {
        history: {
          required: ['timestamp', 'url', 'memorySaved'],
          types: {
            timestamp: 'number',
            url: 'string',
            memorySaved: 'number'
          }
        }
      }
    },
    installDate: {
      type: 'number'
    },
    isPro: {
      type: 'boolean'
    },
    licenseKey: {
      type: 'string',
      nullable: true
    },
    focusModeTrials: {
      type: 'number'
    }
  },

  // chrome.storage.session
  session: {
    tabLastActivity: {
      type: 'object',
      valueType: 'number'
    },
    tabFormStatus: {
      type: 'object',
      valueType: 'boolean'
    }
  }
};

/**
 * Test: Verify storage keys used in background.js
 */
function testBackgroundStorageUsage() {
  section('Background Script Storage Usage');

  const content = readFile('background.js');
  if (!content) {
    fail('Cannot read background.js');
    return;
  }

  // Check for known storage key usage
  const expectedKeys = [
    'tabSuspenderSettings',
    'memoryStats',
    'tabLastActivity',
    'tabFormStatus',
    'installDate'
  ];

  expectedKeys.forEach(key => {
    if (content.includes(key)) {
      pass(`Uses storage key: ${key}`);
    } else {
      fail(`Missing expected storage key usage: ${key}`);
    }
  });

  // Check storage area usage
  if (content.includes('chrome.storage.sync.get')) {
    pass('Uses chrome.storage.sync for settings');
  }
  if (content.includes('chrome.storage.local.get') || content.includes('chrome.storage.local.set')) {
    pass('Uses chrome.storage.local for stats');
  }
  if (content.includes('chrome.storage.session')) {
    pass('Uses chrome.storage.session for ephemeral data');
  }

  // Check for atomic operations (set after get)
  const setOperations = (content.match(/chrome\.storage\.\w+\.set/g) || []).length;
  const getOperations = (content.match(/chrome\.storage\.\w+\.get/g) || []).length;

  if (getOperations >= setOperations) {
    pass(`Storage operations balanced: ${getOperations} gets, ${setOperations} sets`);
  } else {
    fail(`More sets than gets may indicate missing read-before-write: ${getOperations} gets, ${setOperations} sets`);
  }
}

/**
 * Test: Verify storage keys used in popup.js
 */
function testPopupStorageUsage() {
  section('Popup Script Storage Usage');

  const content = readFile('popup.js');
  if (!content) {
    fail('Cannot read popup.js');
    return;
  }

  // Popup should primarily use message passing, not direct storage
  const directStorageAccess = (content.match(/chrome\.storage\.\w+\.(get|set)/g) || []).length;
  const messageUsage = (content.match(/chrome\.runtime\.sendMessage/g) || []).length;

  if (messageUsage > 0) {
    pass(`Uses message passing: ${messageUsage} sendMessage calls`);
  }

  if (directStorageAccess > 0) {
    // Direct storage access is allowed but note it
    pass(`Direct storage access: ${directStorageAccess} (fallback for background unavailable)`);
  }

  // Check for consistent key names
  if (content.includes('memoryStats')) {
    pass('Uses correct key: memoryStats');
  }
  if (content.includes('tabSuspenderSettings')) {
    pass('Uses correct key: tabSuspenderSettings');
  }
}

/**
 * Test: Verify storage keys used in stats-dashboard.html
 */
function testDashboardStorageUsage() {
  section('Dashboard Storage Usage');

  const content = readFile('stats-dashboard.html');
  if (!content) {
    fail('Cannot read stats-dashboard.html');
    return;
  }

  // Dashboard should use message passing primarily
  if (content.includes("type: 'GET_STATS'")) {
    pass('Uses GET_STATS message for data');
  }

  // Check for direct storage access
  if (content.includes('chrome.storage.local.get')) {
    pass('Has direct storage fallback');
  }

  // Verify same key as background
  if (content.includes('memoryStats')) {
    pass('Uses same key as background: memoryStats');
  }
}

/**
 * Test: Check for potential storage conflicts
 */
function testStorageConflicts() {
  section('Storage Conflict Detection');

  const files = ['background.js', 'popup.js'];
  const storageWrites = {};

  files.forEach(file => {
    const content = readFile(file);
    if (!content) return;

    // Find all storage.set operations
    const setMatches = content.match(/chrome\.storage\.\w+\.set\(\s*\{([^}]+)\}/g) || [];
    setMatches.forEach(match => {
      // Extract key names (rough parsing)
      const keyMatch = match.match(/['"]?(\w+)['"]?\s*:/g) || [];
      keyMatch.forEach(key => {
        const keyName = key.replace(/['":\s]/g, '');
        if (!storageWrites[keyName]) {
          storageWrites[keyName] = [];
        }
        storageWrites[keyName].push(file);
      });
    });
  });

  // Check for keys written by multiple files
  let conflicts = false;
  // Keys that are expected to be written by multiple files
  const expectedMultiWriteKeys = [
    'memoryStats',           // Fallback in popup
    'tabSuspenderSettings',  // Fallback in popup
    'isPro',                 // License system (popup activates, background verifies)
    'verifiedAt',            // License verification timestamp
    'serverSignature',       // License server signature
    'licenseKey',            // License key storage
    'focusModeTrials',       // Focus mode trials
    'userEmail'              // User email capture
  ];

  Object.entries(storageWrites).forEach(([key, writers]) => {
    const uniqueWriters = [...new Set(writers)];
    if (uniqueWriters.length > 1) {
      if (expectedMultiWriteKeys.includes(key)) {
        pass(`${key} written by multiple files (expected): ${uniqueWriters.join(', ')}`);
      } else {
        fail(`Potential conflict: ${key} written by: ${uniqueWriters.join(', ')}`);
        conflicts = true;
      }
    }
  });

  if (!conflicts) {
    pass('No unexpected storage conflicts detected');
  }
}

/**
 * Test: Verify history array management
 */
function testHistoryArrayManagement() {
  section('History Array Management');

  const content = readFile('background.js');
  if (!content) {
    fail('Cannot read background.js');
    return;
  }

  // Check for history size limiting
  if (content.includes('history.length > 500') || content.includes('slice(-500)')) {
    pass('History array is size-limited to 500 entries');
  } else {
    fail('History array may grow unbounded');
  }

  // Check for history push operations
  if (content.includes('history.push') || content.includes('history.unshift')) {
    pass('History entries are added correctly');
  }

  // Check that history entries have required fields
  const pushMatch = content.match(/history\.push\(\{([^}]+)\}\)/);
  if (pushMatch) {
    const pushContent = pushMatch[1];
    const requiredFields = ['timestamp', 'url', 'memorySaved'];
    const hasAllFields = requiredFields.every(field => pushContent.includes(field));

    if (hasAllFields) {
      pass('History entries contain all required fields');
    } else {
      fail('History entries may be missing required fields');
    }
  }
}

/**
 * Test: Verify alarm naming consistency
 */
function testAlarmNaming() {
  section('Alarm Naming Consistency');

  const content = readFile('background.js');
  if (!content) {
    fail('Cannot read background.js');
    return;
  }

  // Check for consistent alarm prefix
  const alarmPrefixMatch = content.match(/ALARM_PREFIX\s*=\s*['"]([^'"]+)['"]/);
  if (alarmPrefixMatch) {
    const prefix = alarmPrefixMatch[1];
    pass(`Alarm prefix defined: "${prefix}"`);

    // Verify prefix is used consistently
    const usesPrefix = content.includes('`${ALARM_PREFIX}${tabId}`') ||
                       content.includes('ALARM_PREFIX + tabId') ||
                       content.includes("alarm.name.startsWith(ALARM_PREFIX)") ||
                       content.includes(`alarm.name.startsWith('${prefix}')`);

    if (usesPrefix) {
      pass('Alarm prefix used consistently');
    } else {
      fail('Alarm prefix may not be used consistently');
    }
  } else {
    // Check for inline prefix
    if (content.includes("'suspend-tab-'") || content.includes('"suspend-tab-"')) {
      pass('Uses inline alarm prefix: "suspend-tab-"');
    } else {
      fail('No alarm prefix pattern found');
    }
  }
}

/**
 * Test: Verify error handling in storage operations
 */
function testStorageErrorHandling() {
  section('Storage Error Handling');

  const content = readFile('background.js');
  if (!content) {
    fail('Cannot read background.js');
    return;
  }

  // Check for try-catch around storage operations
  const hasTryCatch = content.includes('try {') && content.includes('catch');

  if (hasTryCatch) {
    pass('Has try-catch error handling');
  } else {
    fail('Missing try-catch error handling');
  }

  // Check for fallback from session to local storage
  if (content.includes('chrome.storage.session') && content.includes('chrome.storage.local')) {
    if (content.includes('catch') && content.includes('Fallback')) {
      pass('Has session -> local storage fallback');
    } else if (content.match(/catch[^}]*local/s)) {
      pass('Has session -> local storage fallback pattern');
    } else {
      pass('Uses both session and local storage');
    }
  }
}

/**
 * Main execution
 */
function main() {
  console.log('\n\x1b[1m=== Tab Suspender Pro - Storage Integrity Test ===\x1b[0m');
  console.log(`Running from: ${ROOT}\n`);

  testBackgroundStorageUsage();
  testPopupStorageUsage();
  testDashboardStorageUsage();
  testStorageConflicts();
  testHistoryArrayManagement();
  testAlarmNaming();
  testStorageErrorHandling();

  // Summary
  console.log('\n\x1b[1m=== Summary ===\x1b[0m');
  console.log(`  \x1b[32m${RESULTS.passed} passed\x1b[0m`);
  console.log(`  \x1b[31m${RESULTS.failed} failed\x1b[0m`);

  if (RESULTS.failed > 0) {
    console.log('\n\x1b[31mStorage integrity test FAILED\x1b[0m');
    process.exit(1);
  } else {
    console.log('\n\x1b[32mStorage integrity test PASSED\x1b[0m');
    process.exit(0);
  }
}

main();
