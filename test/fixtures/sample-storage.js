/**
 * Sample Storage Data for Testing
 *
 * Provides realistic storage configurations for testing various scenarios.
 *
 * @example
 * import { sampleStorage, setStorageScenario } from './sample-storage.js';
 * setStorageData('local', sampleStorage.local.withStats);
 */

const MB = 1024 * 1024;
const GB = 1024 * MB;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Generate timestamps relative to now
 */
const now = Date.now();
const minutesAgo = (m) => now - m * 60 * 1000;
const hoursAgo = (h) => now - h * HOUR;
const daysAgo = (d) => now - d * DAY;

/**
 * Sample settings configurations
 */
export const sampleSettings = {
  /**
   * Default settings (matches DEFAULT_CONFIG in background.js)
   */
  default: {
    suspensionTimeout: 30,
    autoUnsuspendOnFocus: true,
    suspendPinnedTabs: false,
    whitelistedDomains: ['mail.google.com', 'calendar.google.com', 'docs.google.com'],
    neverSuspendAudio: true,
    neverSuspendActiveTab: true
  },

  /**
   * Aggressive suspension - short timeout, fewer protections
   */
  aggressive: {
    suspensionTimeout: 5,
    autoUnsuspendOnFocus: true,
    suspendPinnedTabs: true,
    whitelistedDomains: [],
    neverSuspendAudio: false,
    neverSuspendActiveTab: true
  },

  /**
   * Conservative - long timeout, maximum protections
   */
  conservative: {
    suspensionTimeout: 120,
    autoUnsuspendOnFocus: true,
    suspendPinnedTabs: false,
    whitelistedDomains: [
      'mail.google.com',
      'calendar.google.com',
      'docs.google.com',
      'github.com',
      'localhost'
    ],
    neverSuspendAudio: true,
    neverSuspendActiveTab: true,
    neverSuspendUnsavedForms: true
  },

  /**
   * Custom whitelist
   */
  customWhitelist: {
    suspensionTimeout: 30,
    autoUnsuspendOnFocus: true,
    suspendPinnedTabs: false,
    whitelistedDomains: [
      'slack.com',
      'notion.so',
      'linear.app',
      'figma.com'
    ],
    neverSuspendAudio: true,
    neverSuspendActiveTab: true
  }
};

/**
 * Sample memory stats configurations
 */
export const sampleMemoryStats = {
  /**
   * Fresh install - no stats
   */
  fresh: {
    totalSaved: 0,
    tabsSuspended: 0,
    history: []
  },

  /**
   * Light usage - few suspensions
   */
  lightUsage: {
    totalSaved: 5 * 50 * MB,  // 5 tabs * 50MB
    tabsSuspended: 5,
    history: [
      { timestamp: hoursAgo(2), url: 'https://news.ycombinator.com', memorySaved: 50 * MB },
      { timestamp: hoursAgo(3), url: 'https://reddit.com', memorySaved: 50 * MB },
      { timestamp: hoursAgo(4), url: 'https://twitter.com', memorySaved: 50 * MB },
      { timestamp: hoursAgo(5), url: 'https://facebook.com', memorySaved: 50 * MB },
      { timestamp: hoursAgo(6), url: 'https://youtube.com', memorySaved: 50 * MB }
    ]
  },

  /**
   * Medium usage
   */
  mediumUsage: {
    totalSaved: 50 * 50 * MB,  // 50 tabs * 50MB = 2.5GB
    tabsSuspended: 50,
    history: generateHistory(50, 7)  // 50 events over 7 days
  },

  /**
   * Heavy usage
   */
  heavyUsage: {
    totalSaved: 500 * 50 * MB,  // 500 tabs * 50MB = 25GB
    tabsSuspended: 500,
    history: generateHistory(500, 30)  // 500 events over 30 days
  },

  /**
   * Today only - for testing "today" calculations
   */
  todayOnly: {
    totalSaved: 10 * 50 * MB,
    tabsSuspended: 10,
    history: [
      { timestamp: hoursAgo(1), url: 'https://site1.com', memorySaved: 50 * MB },
      { timestamp: hoursAgo(2), url: 'https://site2.com', memorySaved: 50 * MB },
      { timestamp: hoursAgo(3), url: 'https://site3.com', memorySaved: 50 * MB },
      { timestamp: hoursAgo(4), url: 'https://site4.com', memorySaved: 50 * MB },
      { timestamp: hoursAgo(5), url: 'https://site5.com', memorySaved: 50 * MB },
      { timestamp: hoursAgo(6), url: 'https://site6.com', memorySaved: 50 * MB },
      { timestamp: hoursAgo(7), url: 'https://site7.com', memorySaved: 50 * MB },
      { timestamp: hoursAgo(8), url: 'https://site8.com', memorySaved: 50 * MB },
      { timestamp: hoursAgo(9), url: 'https://site9.com', memorySaved: 50 * MB },
      { timestamp: hoursAgo(10), url: 'https://site10.com', memorySaved: 50 * MB }
    ]
  }
};

/**
 * Generate realistic history data
 */
function generateHistory(count, days) {
  const sites = [
    'news.ycombinator.com', 'reddit.com', 'twitter.com', 'facebook.com',
    'youtube.com', 'github.com', 'stackoverflow.com', 'medium.com',
    'linkedin.com', 'amazon.com', 'wikipedia.org', 'nytimes.com'
  ];

  return Array.from({ length: Math.min(count, 500) }, (_, i) => {
    const randomDay = Math.floor(Math.random() * days);
    const randomHour = Math.floor(Math.random() * 24);
    return {
      timestamp: daysAgo(randomDay) + randomHour * HOUR,
      url: `https://${sites[i % sites.length]}/page${i}`,
      memorySaved: 50 * MB
    };
  }).sort((a, b) => b.timestamp - a.timestamp);  // Most recent first
}

/**
 * Sample tab activity data
 */
export const sampleTabActivity = {
  /**
   * All tabs recently active
   */
  allRecent: {
    1: minutesAgo(1),
    2: minutesAgo(2),
    3: minutesAgo(5),
    4: minutesAgo(10)
  },

  /**
   * Mixed activity - some old
   */
  mixed: {
    1: minutesAgo(1),      // Active tab
    2: minutesAgo(5),      // Recently active
    3: minutesAgo(25),     // Approaching timeout
    4: minutesAgo(45),     // Past 30min timeout
    5: hoursAgo(2)         // Very old
  },

  /**
   * All tabs idle for a long time
   */
  allOld: {
    1: minutesAgo(1),      // Active tab still recent
    2: hoursAgo(1),
    3: hoursAgo(2),
    4: hoursAgo(3),
    5: hoursAgo(4)
  }
};

/**
 * Sample form status data
 */
export const sampleFormStatus = {
  /**
   * No forms with data
   */
  noForms: {},

  /**
   * Some tabs have unsaved forms
   */
  someForms: {
    2: false,
    3: true,   // Has unsaved form
    4: false,
    5: true    // Has unsaved form
  }
};

/**
 * Sample license data
 */
export const sampleLicense = {
  /**
   * Free user - no license
   */
  free: {
    isPro: false,
    licenseKey: null,
    focusModeTrials: 3
  },

  /**
   * Pro user - valid license
   */
  pro: {
    isPro: true,
    licenseKey: 'ZOVO-TEST-1234-5678-ABCD',
    verifiedAt: hoursAgo(12),
    serverSignature: 'mock-signature-abc123',
    focusModeTrials: -1  // Unlimited
  },

  /**
   * Expired/invalid license
   */
  expired: {
    isPro: false,
    licenseKey: 'ZOVO-EXPI-RED0-0000-0000',
    verifiedAt: daysAgo(5),
    serverSignature: null,
    focusModeTrials: 0
  },

  /**
   * Trials exhausted
   */
  noTrials: {
    isPro: false,
    licenseKey: null,
    focusModeTrials: 0
  }
};

/**
 * Complete storage scenarios
 */
export const sampleStorage = {
  local: {
    fresh: {
      memoryStats: sampleMemoryStats.fresh,
      installDate: now
    },

    withStats: {
      memoryStats: sampleMemoryStats.mediumUsage,
      installDate: daysAgo(30)
    },

    proUser: {
      memoryStats: sampleMemoryStats.heavyUsage,
      installDate: daysAgo(90),
      ...sampleLicense.pro
    },

    freeUser: {
      memoryStats: sampleMemoryStats.lightUsage,
      installDate: daysAgo(7),
      ...sampleLicense.free
    }
  },

  sync: {
    default: {
      tabSuspenderSettings: sampleSettings.default
    },

    aggressive: {
      tabSuspenderSettings: sampleSettings.aggressive
    },

    conservative: {
      tabSuspenderSettings: sampleSettings.conservative
    }
  },

  session: {
    fresh: {
      tabLastActivity: {},
      tabFormStatus: {}
    },

    active: {
      tabLastActivity: sampleTabActivity.mixed,
      tabFormStatus: sampleFormStatus.someForms
    }
  }
};

/**
 * Helper to set up a complete storage scenario
 * @param {object} mockChrome - The mock chrome object
 * @param {string} scenario - 'fresh' | 'active' | 'proUser' | 'freeUser'
 */
export function setStorageScenario(setStorageData, scenario) {
  switch (scenario) {
    case 'fresh':
      setStorageData('local', sampleStorage.local.fresh);
      setStorageData('sync', sampleStorage.sync.default);
      setStorageData('session', sampleStorage.session.fresh);
      break;

    case 'active':
      setStorageData('local', sampleStorage.local.withStats);
      setStorageData('sync', sampleStorage.sync.default);
      setStorageData('session', sampleStorage.session.active);
      break;

    case 'proUser':
      setStorageData('local', sampleStorage.local.proUser);
      setStorageData('sync', sampleStorage.sync.conservative);
      setStorageData('session', sampleStorage.session.active);
      break;

    case 'freeUser':
      setStorageData('local', sampleStorage.local.freeUser);
      setStorageData('sync', sampleStorage.sync.default);
      setStorageData('session', sampleStorage.session.active);
      break;

    default:
      setStorageData('local', sampleStorage.local.withStats);
      setStorageData('sync', sampleStorage.sync.default);
      setStorageData('session', sampleStorage.session.active);
  }
}

export default sampleStorage;
