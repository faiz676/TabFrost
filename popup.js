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
// WELCOME SCREEN — shows once, auto dismisses
// ============================================
function showWelcomeScreen(tabList, activeTabs, frozenTabs) {
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
      const welcomeState = document.getElementById('welcomeState');
      if (welcomeState) {
        welcomeState.style.transition = 'opacity 0.4s ease';
        welcomeState.style.opacity = '0';
      }
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
          tabList.innerHTML = '<div class="empty-state">No tabs open</div>';
        }
      }, 400);
    }
  }, 1000);
}

// ============================================
// AUTO SUSPEND TOGGLE
// ============================================
async function setupAutoSuspendToggle() {
  const toggle = document.getElementById('autoSuspendToggle');
  const result = await chrome.storage.local.get('autoSuspendEnabled');

  const isEnabled = result.autoSuspendEnabled !== false;
  toggle.checked = isEnabled;

  toggle.addEventListener('change', async () => {
    await chrome.storage.local.set({
      autoSuspendEnabled: toggle.checked
    });
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

  notice.appendChild(text);
  notice.appendChild(closeBtn);

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
// CREATE TAB ITEM
// FEATURE 1: clicking tab info navigates to that tab
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

    // Build tab info — clickable to switch to that tab
    const tabInfo = document.createElement('div');
    tabInfo.className = 'tab-info tab-info-clickable';
    tabInfo.title = `Go to: ${title}`;

    // FEATURE 1: click to navigate to the tab
    tabInfo.addEventListener('click', async () => {
        await chrome.tabs.update(tab.id, { active: true });
        // Also focus the window that contains the tab
        await chrome.windows.update(tab.windowId, { focused: true });
        window.close(); // close popup after switching
    });

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
        actionEl.addEventListener('click', async (e) => {
            e.stopPropagation();
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

    const sorted = [...sessions].reverse();

    for (const session of sorted) {
        sessionList.appendChild(createSessionItem(session, sessions));
    }
}

// ============================================
// CREATE SESSION ITEM
// FEATURE 2: Preview button to expand/collapse session tabs
// FEATURE 3: Restore individual tab from preview
// ============================================
function createSessionItem(session, allSessions) {
    const wrapper = document.createElement('div');
    wrapper.className = 'session-wrapper';

    // --- Main session row ---
    const item = document.createElement('div');
    item.className = 'session-item';

    const date = new Date(session.savedAt).toLocaleDateString();

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

    const sessionActions = document.createElement('div');
    sessionActions.className = 'session-actions';

    // FEATURE 2: Preview button — toggles the tab list below
    const previewBtn = document.createElement('button');
    previewBtn.className = 'preview-btn';
    previewBtn.title = 'Preview tabs in this session';
    previewBtn.textContent = '👁';

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

    sessionActions.appendChild(previewBtn);
    sessionActions.appendChild(restoreBtn);
    sessionActions.appendChild(deleteBtn);

    item.appendChild(sessionInfo);
    item.appendChild(sessionActions);

    // --- Tab preview panel (hidden by default) ---
    const previewPanel = document.createElement('div');
    previewPanel.className = 'session-preview';
    previewPanel.style.display = 'none';

    // Build the list of tabs inside this session
    for (const savedTab of session.tabs) {
        const tabRow = document.createElement('div');
        tabRow.className = 'preview-tab-row';

        // Favicon
        const favicon = document.createElement('img');
        favicon.className = 'preview-favicon';
        if (savedTab.favIconUrl && !savedTab.favIconUrl.startsWith('data:')) {
            favicon.src = savedTab.favIconUrl;
        } else {
            try {
                const hostname = new URL(savedTab.url).hostname;
                favicon.src = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
            } catch {
                favicon.style.display = 'none';
            }
        }
        favicon.addEventListener('error', () => {
            favicon.style.display = 'none';
        });

        // Tab title
        const tabTitle = document.createElement('span');
        tabTitle.className = 'preview-tab-title';
        tabTitle.textContent = savedTab.title || savedTab.url;
        tabTitle.title = savedTab.url;

        // FEATURE 3: Restore individual tab
        const restoreTabBtn = document.createElement('button');
        restoreTabBtn.className = 'restore-tab-btn';
        restoreTabBtn.textContent = 'Open';
        restoreTabBtn.title = `Open: ${savedTab.url}`;
        restoreTabBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: savedTab.url, active: true });
        });

        tabRow.appendChild(favicon);
        tabRow.appendChild(tabTitle);
        tabRow.appendChild(restoreTabBtn);
        previewPanel.appendChild(tabRow);
    }

    // Toggle preview on preview button click
    let isExpanded = false;
    previewBtn.addEventListener('click', () => {
        isExpanded = !isExpanded;
        previewPanel.style.display = isExpanded ? 'block' : 'none';
        previewBtn.classList.toggle('active', isExpanded);
        previewBtn.title = isExpanded ? 'Hide tabs' : 'Preview tabs in this session';
    });

    wrapper.appendChild(item);
    wrapper.appendChild(previewPanel);

    return wrapper;
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
            await new Promise(resolve => setTimeout(resolve, 600));
            await renderTabs();
        });

    document.getElementById('saveSessionBtn')
        .addEventListener('click', async () => {
            const tabs = await chrome.tabs.query({ currentWindow: true });
            const realTabs = tabs.filter(t =>
                !t.url.startsWith('chrome://') &&
                t.url !== 'about:blank'
            );

            if (realTabs.length === 0) return;

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

    subtitle.textContent = `${tabs.length} tabs will be saved`;
    input.value = `Session ${new Date().toLocaleDateString()}`;

    overlay.classList.add('active');

    setTimeout(() => {
        input.focus();
        input.select();
    }, 50);

    saveBtn.onclick = async () => {
        const name = input.value.trim();
        if (!name) return;
        await saveSession(name, tabs);
        overlay.classList.remove('active');
    };

    cancelBtn.onclick = () => {
        overlay.classList.remove('active');
    };

    overlay.onclick = (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('active');
        }
    };

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
