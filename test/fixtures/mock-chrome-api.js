/**
 * Mock Chrome Extension APIs for Testing
 *
 * Provides mock implementations of chrome.* APIs used by Tab Suspender Pro.
 * Use this in unit tests to simulate browser behavior.
 *
 * @example
 * import { mockChrome, resetMocks } from './mock-chrome-api.js';
 * global.chrome = mockChrome;
 *
 * beforeEach(() => resetMocks());
 */

// Internal state for mocks
const state = {
  storage: {
    local: {},
    sync: {},
    session: {}
  },
  alarms: {},
  tabs: [],
  windows: [],
  listeners: {
    storage: [],
    alarms: [],
    tabs: [],
    runtime: []
  }
};

/**
 * Reset all mock state
 */
export function resetMocks() {
  state.storage.local = {};
  state.storage.sync = {};
  state.storage.session = {};
  state.alarms = {};
  state.tabs = [];
  state.windows = [];
  state.listeners.storage = [];
  state.listeners.alarms = [];
  state.listeners.tabs = [];
  state.listeners.runtime = [];
}

/**
 * Set initial storage data for tests
 * @param {string} area - 'local', 'sync', or 'session'
 * @param {object} data - Initial data
 */
export function setStorageData(area, data) {
  state.storage[area] = { ...data };
}

/**
 * Set initial tabs for tests
 * @param {Array} tabs - Array of tab objects
 */
export function setTabs(tabs) {
  state.tabs = tabs.map((tab, i) => ({
    id: tab.id || i + 1,
    windowId: tab.windowId || 1,
    url: tab.url || 'https://example.com',
    title: tab.title || 'Example',
    active: tab.active || false,
    pinned: tab.pinned || false,
    audible: tab.audible || false,
    discarded: tab.discarded || false,
    favIconUrl: tab.favIconUrl || '',
    ...tab
  }));
}

/**
 * Set initial windows for tests
 * @param {Array} windows - Array of window objects
 */
export function setWindows(windows) {
  state.windows = windows;
}

/**
 * Trigger an alarm (simulates timer firing)
 * @param {string} alarmName - Name of alarm to trigger
 */
export function triggerAlarm(alarmName) {
  const alarm = state.alarms[alarmName];
  if (alarm) {
    state.listeners.alarms.forEach(listener => {
      listener({ name: alarmName, scheduledTime: alarm.scheduledTime });
    });
  }
}

/**
 * Trigger a storage change event
 * @param {string} area - 'local', 'sync', or 'session'
 * @param {object} changes - Changes object
 */
export function triggerStorageChange(area, changes) {
  state.listeners.storage.forEach(listener => {
    listener(changes, area);
  });
}

// Mock chrome.storage
const createStorageArea = (areaName) => ({
  get: jest.fn((keys) => {
    return new Promise((resolve) => {
      if (typeof keys === 'string') {
        resolve({ [keys]: state.storage[areaName][keys] });
      } else if (Array.isArray(keys)) {
        const result = {};
        keys.forEach(key => {
          result[key] = state.storage[areaName][key];
        });
        resolve(result);
      } else if (keys === null || keys === undefined) {
        resolve({ ...state.storage[areaName] });
      } else {
        const result = {};
        Object.keys(keys).forEach(key => {
          result[key] = state.storage[areaName][key] ?? keys[key];
        });
        resolve(result);
      }
    });
  }),

  set: jest.fn((data) => {
    return new Promise((resolve) => {
      const changes = {};
      Object.entries(data).forEach(([key, value]) => {
        changes[key] = {
          oldValue: state.storage[areaName][key],
          newValue: value
        };
        state.storage[areaName][key] = value;
      });
      // Trigger change listeners
      state.listeners.storage.forEach(listener => {
        listener(changes, areaName);
      });
      resolve();
    });
  }),

  remove: jest.fn((keys) => {
    return new Promise((resolve) => {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      keysArray.forEach(key => {
        delete state.storage[areaName][key];
      });
      resolve();
    });
  }),

  clear: jest.fn(() => {
    return new Promise((resolve) => {
      state.storage[areaName] = {};
      resolve();
    });
  })
});

// Mock chrome.alarms
const mockAlarms = {
  create: jest.fn((name, alarmInfo) => {
    return new Promise((resolve) => {
      const scheduledTime = Date.now() + (alarmInfo.delayInMinutes || 0) * 60 * 1000;
      state.alarms[name] = {
        name,
        scheduledTime,
        periodInMinutes: alarmInfo.periodInMinutes
      };
      resolve();
    });
  }),

  get: jest.fn((name) => {
    return new Promise((resolve) => {
      resolve(state.alarms[name] || null);
    });
  }),

  getAll: jest.fn(() => {
    return new Promise((resolve) => {
      resolve(Object.values(state.alarms));
    });
  }),

  clear: jest.fn((name) => {
    return new Promise((resolve) => {
      const existed = !!state.alarms[name];
      delete state.alarms[name];
      resolve(existed);
    });
  }),

  clearAll: jest.fn(() => {
    return new Promise((resolve) => {
      state.alarms = {};
      resolve();
    });
  }),

  onAlarm: {
    addListener: jest.fn((callback) => {
      state.listeners.alarms.push(callback);
    }),
    removeListener: jest.fn((callback) => {
      state.listeners.alarms = state.listeners.alarms.filter(l => l !== callback);
    })
  }
};

// Mock chrome.tabs
const mockTabs = {
  query: jest.fn((queryInfo) => {
    return new Promise((resolve) => {
      let result = [...state.tabs];

      if (queryInfo.active !== undefined) {
        result = result.filter(t => t.active === queryInfo.active);
      }
      if (queryInfo.currentWindow !== undefined && queryInfo.currentWindow) {
        result = result.filter(t => t.windowId === 1); // Assume window 1 is current
      }
      if (queryInfo.windowId !== undefined) {
        result = result.filter(t => t.windowId === queryInfo.windowId);
      }
      if (queryInfo.pinned !== undefined) {
        result = result.filter(t => t.pinned === queryInfo.pinned);
      }
      if (queryInfo.audible !== undefined) {
        result = result.filter(t => t.audible === queryInfo.audible);
      }

      resolve(result);
    });
  }),

  get: jest.fn((tabId) => {
    return new Promise((resolve, reject) => {
      const tab = state.tabs.find(t => t.id === tabId);
      if (tab) {
        resolve(tab);
      } else {
        reject(new Error(`No tab with id: ${tabId}`));
      }
    });
  }),

  update: jest.fn((tabId, updateProperties) => {
    return new Promise((resolve) => {
      const tabIndex = state.tabs.findIndex(t => t.id === tabId);
      if (tabIndex !== -1) {
        state.tabs[tabIndex] = { ...state.tabs[tabIndex], ...updateProperties };
        resolve(state.tabs[tabIndex]);
      } else {
        resolve(null);
      }
    });
  }),

  reload: jest.fn((tabId) => {
    return new Promise((resolve) => {
      resolve();
    });
  }),

  discard: jest.fn((tabId) => {
    return new Promise((resolve) => {
      const tabIndex = state.tabs.findIndex(t => t.id === tabId);
      if (tabIndex !== -1) {
        state.tabs[tabIndex].discarded = true;
      }
      resolve();
    });
  }),

  create: jest.fn((createProperties) => {
    return new Promise((resolve) => {
      const newTab = {
        id: state.tabs.length + 1,
        windowId: createProperties.windowId || 1,
        url: createProperties.url || 'chrome://newtab',
        title: 'New Tab',
        active: createProperties.active !== false,
        pinned: false,
        audible: false,
        discarded: false,
        favIconUrl: ''
      };
      state.tabs.push(newTab);
      resolve(newTab);
    });
  }),

  onActivated: {
    addListener: jest.fn((callback) => {
      state.listeners.tabs.push({ type: 'activated', callback });
    })
  },

  onUpdated: {
    addListener: jest.fn((callback) => {
      state.listeners.tabs.push({ type: 'updated', callback });
    })
  },

  onRemoved: {
    addListener: jest.fn((callback) => {
      state.listeners.tabs.push({ type: 'removed', callback });
    })
  },

  onCreated: {
    addListener: jest.fn((callback) => {
      state.listeners.tabs.push({ type: 'created', callback });
    })
  }
};

// Mock chrome.windows
const mockWindows = {
  getAll: jest.fn((getInfo) => {
    return new Promise((resolve) => {
      let result = state.windows.length > 0 ? state.windows : [{
        id: 1,
        focused: true,
        tabs: state.tabs.filter(t => t.windowId === 1)
      }];

      if (getInfo && getInfo.populate) {
        result = result.map(win => ({
          ...win,
          tabs: state.tabs.filter(t => t.windowId === win.id)
        }));
      }

      resolve(result);
    });
  }),

  update: jest.fn((windowId, updateInfo) => {
    return new Promise((resolve) => {
      resolve({ id: windowId, ...updateInfo });
    });
  })
};

// Mock chrome.runtime
const mockRuntime = {
  getURL: jest.fn((path) => `chrome-extension://mock-extension-id/${path}`),

  sendMessage: jest.fn((message) => {
    return new Promise((resolve) => {
      // Default response - can be overridden in tests
      resolve({ success: true });
    });
  }),

  onMessage: {
    addListener: jest.fn((callback) => {
      state.listeners.runtime.push(callback);
    })
  },

  onInstalled: {
    addListener: jest.fn()
  },

  onStartup: {
    addListener: jest.fn()
  },

  openOptionsPage: jest.fn(() => Promise.resolve())
};

// Mock chrome.action
const mockAction = {
  setBadgeText: jest.fn(() => Promise.resolve()),
  setBadgeBackgroundColor: jest.fn(() => Promise.resolve()),
  setIcon: jest.fn(() => Promise.resolve())
};

// Mock chrome.contextMenus
const mockContextMenus = {
  create: jest.fn(),
  removeAll: jest.fn((callback) => callback && callback()),
  onClicked: {
    addListener: jest.fn()
  }
};

// Mock chrome.commands
const mockCommands = {
  onCommand: {
    addListener: jest.fn()
  }
};

// Complete mock chrome object
export const mockChrome = {
  storage: {
    local: createStorageArea('local'),
    sync: createStorageArea('sync'),
    session: createStorageArea('session'),
    onChanged: {
      addListener: jest.fn((callback) => {
        state.listeners.storage.push(callback);
      }),
      removeListener: jest.fn((callback) => {
        state.listeners.storage = state.listeners.storage.filter(l => l !== callback);
      })
    }
  },
  alarms: mockAlarms,
  tabs: mockTabs,
  windows: mockWindows,
  runtime: mockRuntime,
  action: mockAction,
  contextMenus: mockContextMenus,
  commands: mockCommands
};

// Default export for easy importing
export default mockChrome;
