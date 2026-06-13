const suspendUrl = chrome.runtime.getURL('suspend.html');

// ============================================
// INITIALIZE — runs when popup opens
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  await renderTabs();
  await renderSessions();
  setupButtons();
  await setupAutoSuspendToggle();
  await showAutoSuspendNotice();
});

// ============================================
// RENDER TABS
// ============================================
async function renderTabs() {

    const tabs = await chrome.tabs.query({ currentWindow: true });
    const tabList = document.getElementById('tabList');

    tabList.innerHTML = '';

    const activeTabs = tabs.filter(t => !t.url.startsWith(suspendUrl));
    const frozenTabs = tabs.filter(t => t.url.startsWith(suspendUrl));

    // Update header stats
    document.getElementById('suspendedCount').textContent = frozenTabs.length;
    document.getElementById('ramSaved').textContent =
        `~${frozenTabs.length * 75} MB`;

    // First time user — show welcome if no frozen tabs yet
    const result = await chrome.storage.local.get('hasUsedBefore');


    if (!result.hasUsedBefore && frozenTabs.length === 0) {
  await chrome.storage.local.set({ hasUsedBefore: true });
  showWelcomeScreen(tabList, activeTabs, frozenTabs);
  return;
}
// ============================================
// WELCOME SCREEN — shows once, auto dismisses
// ============================================
function showWelcomeScreen(tabList, activeTabs, frozenTabs) {
  // Show welcome content
  tabList.innerHTML = `
    <div class="welcome-state" id="welcomeState">
      <div class="welcome-icon">❄️</div>
      <div class="welcome-title">Welcome to TabFrost</div>
      <div class="welcome-text">
        Click <strong>Freeze</strong> on any tab to suspend 
        it and save RAM instantly. TabFrost will also 
        auto-freeze tabs inactive for 30 minutes.
      </div>
      <div class="welcome-timer" id="welcomeTimer">
        Taking you in 10 seconds...
      </div>
    </div>
  `;

  // Countdown timer
  let seconds = 10;
  const timerEl = document.getElementById('welcomeTimer');

  const countdown = setInterval(() => {
    seconds--;
    if (timerEl) {
      timerEl.textContent = seconds > 0
        ? `Taking you in ${seconds} second${seconds !== 1 ? 's' : ''}...`
        : 'Loading your tabs...';
    }

    if (seconds <= 0) {
      clearInterval(countdown);
      // Fade out welcome
      const welcomeState = document.getElementById('welcomeState');
      if (welcomeState) {
        welcomeState.style.transition = 'opacity 0.4s ease';
        welcomeState.style.opacity = '0';
      }
      // Load real tabs after fade
      setTimeout(async () => {
        tabList.innerHTML = '';
        for (const tab of activeTabs) {
          const item = await createTabItem(tab, false);
          tabList.appendChild(item);
        }
        for (const tab of frozenTabs) {
          const item = await createTabItem(tab, true);
          tabList.appendChild(item);
        }
        if (activeTabs.length === 0 && frozenTabs.length === 0) {
          tabList.innerHTML =
            '<div class="empty-state">No tabs open</div>';
        }
      }, 400);
    }
  }, 1000);
}
    // Show active tabs first
    // Show active tabs first
    for (const tab of activeTabs) {
        const item = await createTabItem(tab, false);
        tabList.appendChild(item);
    }

    // Show suspended tabs after
    for (const tab of frozenTabs) {
        const item = await createTabItem(tab, true);
        tabList.appendChild(item);
    }

    if (tabs.length === 0) {
        tabList.innerHTML = '<div class="empty-state">No tabs open</div>';
    }
}

// ============================================
// AUTO SUSPEND TOGGLE
// ============================================
async function setupAutoSuspendToggle() {
  const toggle = document.getElementById('autoSuspendToggle');
  const result = await chrome.storage.local.get('autoSuspendEnabled');

  // Default is ON if never set before
  const isEnabled = result.autoSuspendEnabled !== false;
  toggle.checked = isEnabled;

  toggle.addEventListener('change', async () => {
    await chrome.storage.local.set({
      autoSuspendEnabled: toggle.checked
    });
    // Notify background
    chrome.runtime.sendMessage({
      action: 'updateAutoSuspend',
      enabled: toggle.checked
    });
  });
}

// ============================================
// FIRST LAUNCH NOTICE
// ============================================
async function showAutoSuspendNotice() {
  const result = await chrome.storage.local.get('noticeDismissed');
  if (result.noticeDismissed) return;

  const sessionList = document.getElementById('sessionList');

  const notice = document.createElement('div');
  notice.className = 'auto-notice';

  const text = document.createElement('div');
  text.className = 'auto-notice-text';
  text.innerHTML = `
    <strong>Auto-Suspend is ON</strong> — inactive tabs 
    freeze after 30 mins. Turn it off in Settings below.
  `;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'auto-notice-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', async () => {
    notice.remove();
    await chrome.storage.local.set({ noticeDismissed: true });
  });

  notice.appendChild(text)
  notice.appendChild(closeBtn);

  // Insert before session list
  sessionList.parentNode.insertBefore(notice, sessionList);
}
// ============================================
// WHITELIST HELPERS
// ============================================
async function getWhitelist() {
    const result = await chrome.storage.local.get('whitelist');
    return result.whitelist || [];
}

async function toggleWhitelist(url) {
    const whitelist = await getWhitelist();
    const index = whitelist.indexOf(url);
    if (index === -1) {
        whitelist.push(url);
    } else {
        whitelist.splice(index, 1);
    }
    await chrome.storage.local.set({ whitelist });
    return whitelist.includes(url);
}

// ============================================
// CREATE TAB ITEM — no inline handlers
// ============================================
async function createTabItem(tab, isSuspended) {
    const item = document.createElement('div');
    item.className = 'tab-item';

    const title = isSuspended
        ? getOriginalTitle(tab.url)
        : (tab.title || 'Untitled');

    // Build favicon
    let faviconEl;
    if (tab.favIconUrl && !isSuspended) {
        faviconEl = document.createElement('img');
        faviconEl.className = 'tab-favicon';
        faviconEl.src = tab.favIconUrl;
        faviconEl.addEventListener('error', () => {
            faviconEl.style.display = 'none';
        });
    } else {
        faviconEl = document.createElement('span');
        faviconEl.className = 'tab-favicon';
        faviconEl.textContent = '❄️';
    }

    // Build tab info
    const tabInfo = document.createElement('div');
    tabInfo.className = 'tab-info';

    const tabTitle = document.createElement('span');
    tabTitle.className = `tab-title ${isSuspended ? 'suspended' : ''}`;
    tabTitle.title = title;
    tabTitle.textContent = title;

    tabInfo.appendChild(faviconEl);
    tabInfo.appendChild(tabTitle);

    // Build actions container
    const actionsEl = document.createElement('div');
    actionsEl.style.display = 'flex';
    actionsEl.style.alignItems = 'center';
    actionsEl.style.gap = '4px';

    // Only show protect button on active tabs
    if (!isSuspended) {
        const whitelist = await getWhitelist();
        const isProtected = whitelist.includes(tab.url);

        const protectBtn = document.createElement('button');
        protectBtn.className = `protect-btn ${isProtected ? 'protected' : ''}`;
        protectBtn.title = isProtected ? 'Click to unprotect' : 'Click to protect';
        protectBtn.textContent = '🛡️';

        protectBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const nowProtected = await toggleWhitelist(tab.url);
            protectBtn.className = `protect-btn ${nowProtected ? 'protected' : ''}`;
            protectBtn.title = nowProtected
                ? 'Click to unprotect'
                : 'Click to protect';
        });

        actionsEl.appendChild(protectBtn);
    }

    // Freeze or frozen button
    let actionEl;
    if (isSuspended) {
        actionEl = document.createElement('button');
        actionEl.className = 'frozen-tag';

        const defaultText = document.createElement('span');
        defaultText.className = 'default-text';
        defaultText.textContent = 'Frozen';

        const hoverText = document.createElement('span');
        hoverText.className = 'hover-text';
        hoverText.textContent = 'Unfreeze';

        actionEl.appendChild(defaultText);
        actionEl.appendChild(hoverText);

        actionEl.addEventListener('click', async () => {
            const params = new URLSearchParams(tab.url.split('?')[1]);
            const originalUrl = params.get('url');
            if (originalUrl) {
                await chrome.tabs.update(tab.id, { url: originalUrl });
                setTimeout(async () => {
                    await renderTabs();
                }, 500);
            }
        });
    } else {
        actionEl = document.createElement('button');
        actionEl.className = 'freeze-btn';
        actionEl.dataset.tabId = tab.id;
        actionEl.textContent = 'Freeze';
        actionEl.addEventListener('click', async () => {
            await chrome.runtime.sendMessage({
                action: 'suspendTab',
                tab: tab
            });
            await renderTabs();
        });
    }

    actionsEl.appendChild(actionEl);

    item.appendChild(tabInfo);
    item.appendChild(actionsEl);

    return item;
}

function getOriginalTitle(url) {
    try {
        const params = new URLSearchParams(url.split('?')[1]);
        return params.get('title') || params.get('url') || 'Suspended Tab';
    } catch {
        return 'Suspended Tab';
    }
}

// ============================================
// RENDER SESSIONS
// ============================================
async function renderSessions() {
    const sessionList = document.getElementById('sessionList');
    const result = await chrome.storage.local.get('sessions');
    const sessions = result.sessions || [];

    sessionList.innerHTML = '';

    if (sessions.length === 0) {
        sessionList.innerHTML =
            '<div class="empty-state">No saved sessions yet</div>';
        return;
    }

    // Show newest first
    const sorted = [...sessions].reverse();

    for (const session of sorted) {
        sessionList.appendChild(createSessionItem(session, sessions));
    }
}

function createSessionItem(session, allSessions) {
    const item = document.createElement('div');
    item.className = 'session-item';

    const date = new Date(session.savedAt).toLocaleDateString();

    // Build session info
    const sessionInfo = document.createElement('div');
    sessionInfo.className = 'session-info';

    const sessionName = document.createElement('div');
    sessionName.className = 'session-name';
    sessionName.title = session.name;
    sessionName.textContent = session.name;

    const sessionMeta = document.createElement('div');
    sessionMeta.className = 'session-meta';
    sessionMeta.textContent = `${session.tabs.length} tabs · ${date}`;

    sessionInfo.appendChild(sessionName);
    sessionInfo.appendChild(sessionMeta);

    // Build session actions
    const sessionActions = document.createElement('div');
    sessionActions.className = 'session-actions';

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'restore-btn';
    restoreBtn.textContent = 'Restore';
    restoreBtn.addEventListener('click', () => restoreSession(session));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '✕';
    deleteBtn.addEventListener('click', async () => {
        const updated = allSessions.filter(s => s.id !== session.id);
        await chrome.storage.local.set({ sessions: updated });
        await renderSessions();
    });

    sessionActions.appendChild(restoreBtn);
    sessionActions.appendChild(deleteBtn);

    item.appendChild(sessionInfo);
    item.appendChild(sessionActions);

    return item;
}

async function restoreSession(session) {
    for (const tab of session.tabs) {
        await chrome.tabs.create({ url: tab.url, active: false });
    }
}

// ============================================
// BUTTONS
// ============================================
function setupButtons() {
    // Freeze all tabs
    // REPLACE WITH:
document.getElementById('suspendAllBtn')
    .addEventListener('click', async () => {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const whitelist = await getWhitelist();
        for (const tab of tabs) {
            if (!tab.active &&
                !tab.pinned &&
                !tab.url.startsWith(suspendUrl) &&
                !tab.url.startsWith('chrome://') &&
                !whitelist.includes(tab.url)) {
                await chrome.runtime.sendMessage({
                    action: 'suspendTab',
                    tab: tab
                });
            }
        }
        // Wait for all tabs to finish navigating to suspend.html
        // before re-rendering, otherwise some still show as active
        await new Promise(resolve => setTimeout(resolve, 600));
        await renderTabs();
    });

    // Save session — open modal instead of prompt
    document.getElementById('saveSessionBtn')
        .addEventListener('click', async () => {
            const tabs = await chrome.tabs.query({ currentWindow: true });
            const realTabs = tabs.filter(t =>
                !t.url.startsWith('chrome://') &&
                t.url !== 'about:blank'
            );

            if (realTabs.length === 0) return;

            // Show modal
            openSessionModal(realTabs);
        });
}

// ============================================
// SESSION MODAL
// ============================================
function openSessionModal(tabs) {
    const overlay = document.getElementById('modalOverlay');
    const input = document.getElementById('sessionNameInput');
    const subtitle = document.getElementById('modalSubtitle');
    const saveBtn = document.getElementById('modalSave');
    const cancelBtn = document.getElementById('modalCancel');

    // Set default name and tab count
    subtitle.textContent = `${tabs.length} tabs will be saved`;
    input.value = `Session ${new Date().toLocaleDateString()}`;

    // Show modal
    overlay.classList.add('active');

    // Focus and select input text
    setTimeout(() => {
        input.focus();
        input.select();
    }, 50);

    // Save button
    saveBtn.onclick = async () => {
        const name = input.value.trim();
        if (!name) return;
        await saveSession(name, tabs);
        overlay.classList.remove('active');
    };

    // Cancel button
    cancelBtn.onclick = () => {
        overlay.classList.remove('active');
    };

    // Close on overlay click
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('active');
        }
    };

    // Save on Enter key
    input.onkeydown = async (e) => {
        if (e.key === 'Enter') {
            const name = input.value.trim();
            if (!name) return;
            await saveSession(name, tabs);
            overlay.classList.remove('active');
        }
        if (e.key === 'Escape') {
            overlay.classList.remove('active');
        }
    };
}

async function saveSession(name, tabs) {
    const session = {
        id: Date.now(),
        name: name,
        savedAt: Date.now(),
        tabs: tabs.map(t => ({
            url: t.url,
            title: t.title,
            favIconUrl: t.favIconUrl
        }))
    };

    const result = await chrome.storage.local.get('sessions');
    const sessions = result.sessions || [];
    sessions.push(session);
    await chrome.storage.local.set({ sessions });
    await renderSessions();
}
