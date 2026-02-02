#!/usr/bin/env node

/**
 * Pre-flight Check - Extension Validation
 *
 * Validates that the extension is properly structured and can be loaded.
 * Run before deploying or after making changes.
 *
 * Usage: node test/integration/pre-flight-check.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const RESULTS = { passed: 0, failed: 0, warnings: 0 };

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

function warn(message) {
  console.log(`  \x1b[33m⚠\x1b[0m ${message}`);
  RESULTS.warnings++;
}

function section(name) {
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function readJSON(relativePath) {
  try {
    const content = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

function readFile(relativePath) {
  try {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  } catch (e) {
    return null;
  }
}

/**
 * Test: Manifest validation
 */
function testManifest() {
  section('Manifest Validation');

  const manifest = readJSON('manifest.json');

  if (!manifest) {
    fail('manifest.json not found or invalid JSON');
    return;
  }
  pass('manifest.json exists and is valid JSON');

  // Required fields
  if (manifest.manifest_version === 3) {
    pass('Manifest version is 3 (MV3)');
  } else {
    fail(`Manifest version is ${manifest.manifest_version}, expected 3`);
  }

  if (manifest.name && manifest.name.length > 0) {
    pass(`Extension name: "${manifest.name}"`);
  } else {
    fail('Extension name is missing');
  }

  if (manifest.version && /^\d+\.\d+\.\d+$/.test(manifest.version)) {
    pass(`Version: ${manifest.version}`);
  } else {
    warn(`Version format should be X.Y.Z, got: ${manifest.version}`);
  }

  // Background service worker
  if (manifest.background?.service_worker) {
    if (fileExists(manifest.background.service_worker)) {
      pass(`Background script exists: ${manifest.background.service_worker}`);
    } else {
      fail(`Background script missing: ${manifest.background.service_worker}`);
    }
  } else {
    fail('No background service worker defined');
  }

  // Popup
  if (manifest.action?.default_popup) {
    if (fileExists(manifest.action.default_popup)) {
      pass(`Popup exists: ${manifest.action.default_popup}`);
    } else {
      fail(`Popup missing: ${manifest.action.default_popup}`);
    }
  }

  // Content scripts
  if (manifest.content_scripts?.length > 0) {
    manifest.content_scripts.forEach(cs => {
      cs.js?.forEach(script => {
        if (fileExists(script)) {
          pass(`Content script exists: ${script}`);
        } else {
          fail(`Content script missing: ${script}`);
        }
      });
    });
  }

  // Icons
  const iconSizes = ['16', '32', '48', '128'];
  iconSizes.forEach(size => {
    const iconPath = manifest.icons?.[size];
    if (iconPath) {
      if (fileExists(iconPath)) {
        pass(`Icon ${size}x${size} exists`);
      } else {
        fail(`Icon ${size}x${size} missing: ${iconPath}`);
      }
    } else {
      warn(`Icon ${size}x${size} not defined`);
    }
  });

  // Permissions check
  const requiredPermissions = ['storage', 'tabs', 'alarms'];
  requiredPermissions.forEach(perm => {
    if (manifest.permissions?.includes(perm)) {
      pass(`Permission declared: ${perm}`);
    } else {
      fail(`Missing required permission: ${perm}`);
    }
  });
}

/**
 * Test: Required files exist
 */
function testRequiredFiles() {
  section('Required Files');

  const requiredFiles = [
    'background.js',
    'popup.html',
    'popup.js',
    'popup.css',
    'suspended.html',
    'suspended.js',
    'suspended.css',
    'settings.html',
    'settings.js',
    'settings.css',
    'contentScript.js'
  ];

  requiredFiles.forEach(file => {
    if (fileExists(file)) {
      pass(`${file} exists`);
    } else {
      fail(`${file} missing`);
    }
  });
}

/**
 * Test: JavaScript syntax check (basic)
 */
function testJavaScriptSyntax() {
  section('JavaScript Syntax');

  const jsFiles = [
    'background.js',
    'popup.js',
    'settings.js',
    'suspended.js',
    'contentScript.js'
  ];

  jsFiles.forEach(file => {
    const content = readFile(file);
    if (!content) {
      fail(`Cannot read ${file}`);
      return;
    }

    try {
      // Basic syntax check - look for common errors
      const errors = [];

      // Check for unclosed brackets (very basic)
      const openBraces = (content.match(/{/g) || []).length;
      const closeBraces = (content.match(/}/g) || []).length;
      if (openBraces !== closeBraces) {
        errors.push(`Mismatched braces: ${openBraces} open, ${closeBraces} close`);
      }

      // Check for console.error/log calls (not an error, just info)
      const consoleLogs = (content.match(/console\.(log|error|warn)/g) || []).length;
      if (consoleLogs > 0) {
        // This is fine for debugging
      }

      if (errors.length === 0) {
        pass(`${file} syntax appears valid`);
      } else {
        fail(`${file}: ${errors.join(', ')}`);
      }
    } catch (e) {
      fail(`${file} syntax error: ${e.message}`);
    }
  });
}

/**
 * Test: HTML structure
 */
function testHTMLStructure() {
  section('HTML Structure');

  const htmlFiles = ['popup.html', 'settings.html', 'suspended.html'];

  htmlFiles.forEach(file => {
    const content = readFile(file);
    if (!content) {
      fail(`Cannot read ${file}`);
      return;
    }

    // Check for basic HTML structure
    if (content.includes('<!DOCTYPE html>')) {
      pass(`${file} has DOCTYPE`);
    } else {
      warn(`${file} missing DOCTYPE`);
    }

    if (content.includes('<html') && content.includes('</html>')) {
      pass(`${file} has html tags`);
    } else {
      fail(`${file} missing html tags`);
    }

    // Check for script references
    const scriptMatch = content.match(/src="([^"]+\.js)"/g);
    if (scriptMatch) {
      scriptMatch.forEach(match => {
        const scriptPath = match.match(/src="([^"]+)"/)[1];
        if (fileExists(scriptPath)) {
          pass(`${file} -> ${scriptPath} exists`);
        } else {
          fail(`${file} -> ${scriptPath} missing`);
        }
      });
    }

    // Check for CSS references
    const cssMatch = content.match(/href="([^"]+\.css)"/g);
    if (cssMatch) {
      cssMatch.forEach(match => {
        const cssPath = match.match(/href="([^"]+)"/)[1];
        if (fileExists(cssPath)) {
          pass(`${file} -> ${cssPath} exists`);
        } else {
          fail(`${file} -> ${cssPath} missing`);
        }
      });
    }
  });
}

/**
 * Test: Feature flags (if they exist)
 */
function testFeatureFlags() {
  section('Feature Flags');

  const featureFlagsPath = 'src/utils/feature-flags.js';

  if (fileExists(featureFlagsPath)) {
    const content = readFile(featureFlagsPath);
    pass('feature-flags.js exists');

    // Check for expected flags
    const expectedFlags = ['COUNTDOWN_INDICATOR', 'DASHBOARD_SYNC', 'EXCLUSION_FEEDBACK'];
    expectedFlags.forEach(flag => {
      if (content.includes(flag)) {
        pass(`Feature flag defined: ${flag}`);
      } else {
        warn(`Feature flag not found: ${flag}`);
      }
    });
  } else {
    warn('feature-flags.js not yet created (expected after Agent 0)');
  }
}

/**
 * Test: Storage utility (if exists)
 */
function testStorageUtility() {
  section('Storage Utility');

  const safeStoragePath = 'src/utils/safe-storage.js';

  if (fileExists(safeStoragePath)) {
    const content = readFile(safeStoragePath);
    pass('safe-storage.js exists');

    // Check for key functions
    const expectedFunctions = ['get', 'set', 'rollback'];
    expectedFunctions.forEach(fn => {
      if (content.includes(fn)) {
        pass(`Function available: ${fn}`);
      } else {
        warn(`Function not found: ${fn}`);
      }
    });
  } else {
    warn('safe-storage.js not yet created (expected after Agent 0)');
  }
}

/**
 * Test: Documentation
 */
function testDocumentation() {
  section('Documentation');

  const docs = [
    'docs/ARCHITECTURE.md',
    'docs/CONTRACTS.md',
    'docs/GIT_WORKFLOW.md'
  ];

  docs.forEach(doc => {
    if (fileExists(doc)) {
      pass(`${doc} exists`);
    } else {
      warn(`${doc} not yet created (expected after Agent 0)`);
    }
  });
}

/**
 * Main execution
 */
function main() {
  console.log('\n\x1b[1m=== Tab Suspender Pro - Pre-flight Check ===\x1b[0m');
  console.log(`Running from: ${ROOT}\n`);

  testManifest();
  testRequiredFiles();
  testJavaScriptSyntax();
  testHTMLStructure();
  testFeatureFlags();
  testStorageUtility();
  testDocumentation();

  // Summary
  console.log('\n\x1b[1m=== Summary ===\x1b[0m');
  console.log(`  \x1b[32m${RESULTS.passed} passed\x1b[0m`);
  console.log(`  \x1b[31m${RESULTS.failed} failed\x1b[0m`);
  console.log(`  \x1b[33m${RESULTS.warnings} warnings\x1b[0m`);

  if (RESULTS.failed > 0) {
    console.log('\n\x1b[31mPre-flight check FAILED\x1b[0m');
    process.exit(1);
  } else if (RESULTS.warnings > 0) {
    console.log('\n\x1b[33mPre-flight check PASSED with warnings\x1b[0m');
    process.exit(0);
  } else {
    console.log('\n\x1b[32mPre-flight check PASSED\x1b[0m');
    process.exit(0);
  }
}

main();
