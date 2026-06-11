// ============================================
// CONFIGURATION
// ============================================
const AUTO_SUSPEND_MINUTES = 30;
const ALARM_CHECK_MINUTES = 2;

// Auto suspend enabled by default
let autoSuspendEnabled = true;

// Load saved setting on startup
chrome.storage.local.get('autoSuspendEnabled', (result) => {
  if (result.autoSuspendEnabled !== undefined) {
    autoSuspendEnabled = result.autoSuspendEnabled;
  }
});

// ============================================
// TRACK TAB ACTIVITY
// Saved to storage so it survives restarts
// ============================================

// Save tab active time to storage
async function setTabActive(tabId) {
  const result = await chrome.storage.local.get('tabActivity');
  const tabActivity = result.tabActivity || {};
  tabActivity[tabId] = Date.now();
  await chrome.storage.local.set({ tabActivity });
}

// Get all tab activity from storage
async function getTabActivity() {
  const result = await chrome.storage.local.get('tabActivity');
  return result.tabActivity || {};
}

// Remove tab from activity storage when closed
async function removeTabActivity(tabId) {
  const result = await chrome.storage.local.get('tabActivity');
  const tabActivity = result.tabActivity || {};
  delete tabActivity[tabId];
  await chrome.storage.local.set({ tabActivity });
}

// ============================================
// INITIALIZE — mark all tabs as active now
// Runs every time service worker starts
// ============================================
async function initializeTabActivity() {
  const tabs = await chrome.tabs.query({});
  const result = await chrome.storage.local.get('tabActivity');
  const tabActivity = result.tabActivity || {};
  const now = Date.now();

  // Only set timestamp if tab doesn't already
  // have one — preserves existing inactive time
  for (const tab of tabs) {
    if (!tabActivity[tab.id]) {
      tabActivity[tab.id] = now;
    }
  }

  await chrome.storage.local.set({ tabActivity });
}

// Run on every service worker startup
initializeTabActivity();

// ============================================
// TAB EVENT LISTENERS
// ============================================
chrome.tabs.onActivated.addListener(({ tabId }) => {
  setTabActive(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    setTabActive(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  removeTabActivity(tabId);
});

// ============================================
// AUTO SUSPEND ALARM
// ============================================
chrome.alarms.create('autoSuspendCheck', {
  periodInMinutes: ALARM_CHECK_MINUTES
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autoSuspendCheck') {
    checkAndSuspendInactiveTabs();
  }
});

// ============================================
// CORE SUSPEND LOGIC
// ============================================
async function checkAndSuspendInactiveTabs() {
  if (!autoSuspendEnabled) return;

  const tabs = await chrome.tabs.query({});
  const now = Date.now();
  const suspendThreshold = AUTO_SUSPEND_MINUTES * 60 * 1000;
  const tabActivity = await getTabActivity();

  for (const tab of tabs) {
    const skip = await shouldSkipTab(tab);
    if (skip) continue;

    const lastActive = tabActivity[tab.id] || now;
    const inactiveTime = now - lastActive;

    if (inactiveTime > suspendThreshold) {
      await suspendTab(tab);
    }
  }
}

async function shouldSkipTab(tab) {
  if (tab.active) return true;
  if (tab.pinned) return true;
  if (tab.url.startsWith(
    chrome.runtime.getURL('suspend.html'))) return true;
  if (tab.url.startsWith('chrome://')) return true;
  if (tab.url === 'about:blank') return true;
  if (tab.audible) return true;

  const result = await chrome.storage.local.get('whitelist');
  const whitelist = result.whitelist || [];
  if (whitelist.includes(tab.url)) return true;

  return false;
}

async function suspendTab(tab) {
  try {
    const suspendUrl = chrome.runtime.getURL('suspend.html') +
      `?url=${encodeURIComponent(tab.url)}` +
      `&title=${encodeURIComponent(tab.title)}`;

    await chrome.tabs.update(tab.id, { url: suspendUrl });

    // Remove from activity tracking after suspension
    await removeTabActivity(tab.id);

  } catch (error) {
    console.error(`Failed to suspend tab ${tab.id}:`, error);
  }
}

// ============================================
// MESSAGE LISTENER
// ============================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'suspendTab') {
    suspendTab(message.tab).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'getSuspendedCount') {
    chrome.tabs.query({}).then(tabs => {
      const suspendUrl = chrome.runtime.getURL('suspend.html');
      const count = tabs.filter(t =>
        t.url.startsWith(suspendUrl)).length;
      sendResponse({ count });
    });
    return true;
  }

  if (message.action === 'getRamSaved') {
    chrome.tabs.query({}, (tabs) => {
      const suspendPageUrl = chrome.runtime.getURL('suspend.html');
      const suspendedCount = tabs.filter(t =>
        t.url.startsWith(suspendPageUrl)
      ).length;
      const ramSavedMB = suspendedCount * 75;
      sendResponse({ ramSavedMB, suspendedCount });
    });
    return true;
  }

  if (message.action === 'updateAutoSuspend') {
    autoSuspendEnabled = message.enabled;
    sendResponse({ success: true });
    return true;
  }
});

// ============================================
// HELPER — Count suspended tabs
// ============================================
async function getSuspendedCount() {
  const tabs = await chrome.tabs.query({});
  const suspendUrl = chrome.runtime.getURL('suspend.html');
  return tabs.filter(tab =>
    tab.url.startsWith(suspendUrl)).length;
}