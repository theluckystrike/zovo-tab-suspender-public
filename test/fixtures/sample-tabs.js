/**
 * Sample Tab Data for Testing
 *
 * Provides realistic tab configurations for testing various scenarios.
 *
 * @example
 * import { sampleTabs, getTabsForScenario } from './sample-tabs.js';
 * setTabs(sampleTabs.mixedState);
 */

/**
 * Individual sample tabs for composing test scenarios
 */
export const tabs = {
  // Active tab - currently focused
  active: {
    id: 1,
    windowId: 1,
    url: 'https://docs.google.com/document/d/123',
    title: 'My Document - Google Docs',
    active: true,
    pinned: false,
    audible: false,
    discarded: false,
    favIconUrl: 'https://docs.google.com/favicon.ico'
  },

  // Regular idle tab - can be suspended
  idle: {
    id: 2,
    windowId: 1,
    url: 'https://news.ycombinator.com',
    title: 'Hacker News',
    active: false,
    pinned: false,
    audible: false,
    discarded: false,
    favIconUrl: 'https://news.ycombinator.com/favicon.ico'
  },

  // Pinned tab
  pinned: {
    id: 3,
    windowId: 1,
    url: 'https://mail.google.com',
    title: 'Inbox - Gmail',
    active: false,
    pinned: true,
    audible: false,
    discarded: false,
    favIconUrl: 'https://mail.google.com/favicon.ico'
  },

  // Tab playing audio
  playingAudio: {
    id: 4,
    windowId: 1,
    url: 'https://open.spotify.com/track/123',
    title: 'Now Playing - Spotify',
    active: false,
    pinned: false,
    audible: true,
    discarded: false,
    favIconUrl: 'https://open.spotify.com/favicon.ico'
  },

  // Already suspended tab
  suspended: {
    id: 5,
    windowId: 1,
    url: 'chrome-extension://mock-id/suspended.html?url=https%3A%2F%2Fexample.com&title=Example',
    title: 'Suspended: Example',
    active: false,
    pinned: false,
    audible: false,
    discarded: true,
    favIconUrl: ''
  },

  // System page (chrome://)
  systemPage: {
    id: 6,
    windowId: 1,
    url: 'chrome://settings',
    title: 'Settings',
    active: false,
    pinned: false,
    audible: false,
    discarded: false,
    favIconUrl: ''
  },

  // Extension page
  extensionPage: {
    id: 7,
    windowId: 1,
    url: 'chrome-extension://some-other-extension/popup.html',
    title: 'Some Extension',
    active: false,
    pinned: false,
    audible: false,
    discarded: false,
    favIconUrl: ''
  },

  // Whitelisted domain (Google Calendar)
  whitelisted: {
    id: 8,
    windowId: 1,
    url: 'https://calendar.google.com/calendar/r',
    title: 'Google Calendar',
    active: false,
    pinned: false,
    audible: false,
    discarded: false,
    favIconUrl: 'https://calendar.google.com/favicon.ico'
  },

  // Tab with form data (simulated - needs contentScript interaction)
  withForm: {
    id: 9,
    windowId: 1,
    url: 'https://github.com/new',
    title: 'Create a New Repository',
    active: false,
    pinned: false,
    audible: false,
    discarded: false,
    favIconUrl: 'https://github.com/favicon.ico',
    _hasUnsavedForms: true  // Test metadata - not actual Chrome API
  },

  // Tab in different window
  otherWindow: {
    id: 10,
    windowId: 2,
    url: 'https://stackoverflow.com/questions',
    title: 'Stack Overflow',
    active: true,
    pinned: false,
    audible: false,
    discarded: false,
    favIconUrl: 'https://stackoverflow.com/favicon.ico'
  }
};

/**
 * Pre-configured tab scenarios for common test cases
 */
export const sampleTabs = {
  /**
   * Empty state - no tabs
   */
  empty: [],

  /**
   * Single active tab only
   */
  singleTab: [
    tabs.active
  ],

  /**
   * Mixed state with various tab types
   * Good for testing exclusion logic
   */
  mixedState: [
    tabs.active,
    tabs.idle,
    { ...tabs.idle, id: 11, url: 'https://reddit.com', title: 'Reddit' },
    { ...tabs.idle, id: 12, url: 'https://twitter.com', title: 'Twitter' },
    tabs.pinned,
    tabs.playingAudio,
    tabs.suspended,
    tabs.whitelisted
  ],

  /**
   * All tabs can be suspended (except active)
   */
  allSuspendable: [
    tabs.active,
    { ...tabs.idle, id: 20 },
    { ...tabs.idle, id: 21, url: 'https://example1.com', title: 'Example 1' },
    { ...tabs.idle, id: 22, url: 'https://example2.com', title: 'Example 2' },
    { ...tabs.idle, id: 23, url: 'https://example3.com', title: 'Example 3' }
  ],

  /**
   * No tabs can be suspended
   */
  noneSuspendable: [
    tabs.active,
    tabs.pinned,
    tabs.playingAudio,
    tabs.systemPage,
    tabs.extensionPage,
    tabs.suspended
  ],

  /**
   * Multiple windows
   */
  multipleWindows: [
    tabs.active,
    tabs.idle,
    tabs.pinned,
    { ...tabs.otherWindow },
    { ...tabs.idle, id: 30, windowId: 2, url: 'https://example.com', title: 'Example' }
  ],

  /**
   * Heavy usage - many tabs
   */
  manyTabs: Array.from({ length: 50 }, (_, i) => ({
    id: 100 + i,
    windowId: Math.floor(i / 20) + 1,
    url: `https://example${i}.com`,
    title: `Tab ${i + 1}`,
    active: i === 0,
    pinned: i < 3,
    audible: i === 5,
    discarded: i >= 40,
    favIconUrl: ''
  })),

  /**
   * Focus mode scenario - one active, many idle
   */
  focusMode: [
    { ...tabs.active, url: 'https://important-work.com', title: 'Important Work' },
    ...Array.from({ length: 15 }, (_, i) => ({
      id: 200 + i,
      windowId: 1,
      url: `https://distraction${i}.com`,
      title: `Distraction ${i + 1}`,
      active: false,
      pinned: false,
      audible: false,
      discarded: false,
      favIconUrl: ''
    }))
  ]
};

/**
 * Get tabs for a specific test scenario
 * @param {string} scenario - Scenario name
 * @returns {Array} Array of tab objects
 */
export function getTabsForScenario(scenario) {
  return sampleTabs[scenario] || sampleTabs.mixedState;
}

/**
 * Create custom tabs array with specific properties
 * @param {number} count - Number of tabs
 * @param {object} overrides - Properties to apply to all tabs
 * @returns {Array} Array of tab objects
 */
export function createTabs(count, overrides = {}) {
  return Array.from({ length: count }, (_, i) => ({
    id: 1000 + i,
    windowId: 1,
    url: `https://test-${i}.com`,
    title: `Test Tab ${i + 1}`,
    active: i === 0,
    pinned: false,
    audible: false,
    discarded: false,
    favIconUrl: '',
    ...overrides
  }));
}

/**
 * Window configurations
 */
export const sampleWindows = {
  single: [
    { id: 1, focused: true }
  ],

  multiple: [
    { id: 1, focused: true },
    { id: 2, focused: false },
    { id: 3, focused: false }
  ]
};

export default sampleTabs;
