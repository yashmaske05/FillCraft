// Service worker — handles keyboard shortcuts. Results are shown on the toolbar
// icon badge (there is no popup open to show a status message).

importScripts('data.js', 'runner.js', 'fieldrules.js', 'menu.js');

// The right-click menu: made when FillCraft is installed / updated and when the browser starts;
// pages already open then get the small right-click listener too.
chrome.runtime.onInstalled.addListener(() => { FillCraftMenu.create().catch(() => {}); FillCraftMenu.listenInOpenTabs().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { FillCraftMenu.create().catch(() => {}); });
chrome.contextMenus.onClicked.addListener((info, tab) => { FillCraftMenu.onClick(info, tab).catch(() => {}); });

const COMMAND_TO_ACTION = {
  'fill-valid':   { action: 'fill',  mode: 'valid' },
  'fill-invalid': { action: 'fill',  mode: 'invalid' },
  'fill-edge':    { action: 'fill',  mode: 'edge' },
  'clear-form':   { action: 'clear', mode: 'clear' },
};

const BADGE_COLORS = { valid: '#2da44e', invalid: '#cf222e', edge: '#bf8700', clear: '#6e7681', error: '#cf222e' };

async function showBadge(tabId, text, color) {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    await chrome.action.setBadgeText({ tabId, text });
    setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {}), 4000);
  } catch (_) { /* tab may have closed */ }
}

// The popup asks the service worker to run fills/clears/detects rather than running
// them itself: a popup is destroyed the moment it closes (e.g. the user clicks the
// page to watch), which would lose the result of a long fill. Here it completes and
// is saved as the tab's last run.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'fillcraft:run' || sender.id !== chrome.runtime.id) return false;
  FillCraftRunner.run(msg.tabId, msg.action, msg.payload)
    .then((result) => {
      // A shortcut that failed earlier left its reason on the toolbar button: the page works now.
      chrome.action.setTitle({ tabId: msg.tabId, title: '' }).catch(() => {});
      sendResponse({ result });
    })
    .catch((err) => sendResponse({ error: String((err && err.message) || err) }));
  return true; // respond asynchronously
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  const map = COMMAND_TO_ACTION[command];
  if (!map) return;

  if (!tab?.id) {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  }
  if (!tab?.id) return;
  if (FillCraftRunner.restrictedReason(tab.url)) {
    showBadge(tab.id, '✕', BADGE_COLORS.error);
    return;
  }

  // Fall back to defaults if storage is unavailable.
  const stored = await chrome.storage.local.get(['options', 'edgeType', 'invalidType', 'settingsVersion']).catch(() => ({}));
  const options = { ...(stored.options || {}) };
  // Settings saved before v2 hold the old "custom dropdowns off" default (see popup.js).
  if ((stored.settingsVersion || 1) < 2) options.customDropdowns = true;
  const payload = {
    mode: map.mode,
    options,
    edgeType: stored.edgeType || 'random',
    invalidType: stored.invalidType || 'random',
  };

  try {
    const res = await FillCraftRunner.run(tab.id, map.action, payload);
    showBadge(tab.id, String(res.filled), BADGE_COLORS[map.mode]);
    chrome.action.setTitle({ tabId: tab.id, title: '' }).catch(() => {}); // back to the default tooltip
  } catch (err) {
    const why = FillCraftRunner.friendlyError(err, tab.url);
    console.warn('[FillCraft] Command failed:', why);
    showBadge(tab.id, '!', BADGE_COLORS.error);
    // The reason shows when pointing at the toolbar button (there is no popup to say it).
    chrome.action.setTitle({ tabId: tab.id, title: `FillCraft — the shortcut did not run: ${why}` }).catch(() => {});
  }
});

// A closed tab's last run is forgotten.
chrome.tabs.onRemoved.addListener((tabId) => FillCraftRunner.forgetTab(tabId));
