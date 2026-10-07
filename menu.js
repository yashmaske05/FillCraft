// FillCraft's entries in Chrome's right-click menu (loaded by the service worker):
//   Fill this field ▸ Valid / Invalid / Edge        Fill this section ▸ Valid / Invalid / Edge
//   Treat this field as ▸ <group> ▸ <type>          Leave this field alone
//   Forget my setting for this field                 Field settings…
// Chrome draws the menu itself; the right-clicked element is remembered by ctxmenu.js.
const FillCraftMenu = (() => {
  const CONTEXTS = ['editable', 'page', 'frame'];
  const MODES = [['valid', 'Valid data'], ['invalid', 'Invalid data'], ['edge', 'Edge cases']];
  const BADGE = { ok: '#2da44e', error: '#cf222e' };

  // The menu, made once per install / browser start (Chrome keeps it between service-worker starts).
  async function create() {
    await new Promise((r) => chrome.contextMenus.removeAll(() => { void chrome.runtime.lastError; r(); }));
    const add = (props) => new Promise((r) => chrome.contextMenus.create({ contexts: CONTEXTS, ...props }, () => { void chrome.runtime.lastError; r(); }));
    await add({ id: 'fc-fill-field', title: 'Fill this field' });
    for (const [m, t] of MODES) await add({ id: `fc-fill-field:${m}`, parentId: 'fc-fill-field', title: t });
    await add({ id: 'fc-fill-section', title: 'Fill this section' });
    for (const [m, t] of MODES) await add({ id: `fc-fill-section:${m}`, parentId: 'fc-fill-section', title: t });
    await add({ id: 'fc-sep-1', type: 'separator' });
    await add({ id: 'fc-treat', title: 'Treat this field as' });
    for (const [group, items] of FillCraftRules.GROUPS) {
      await add({ id: `fc-group:${group}`, parentId: 'fc-treat', title: group });
      for (const [key, label] of items) await add({ id: `fc-type:${key}`, parentId: `fc-group:${group}`, title: label });
    }
    await add({ id: 'fc-type:leave', title: 'Leave this field alone' });
    await add({ id: 'fc-sep-2', type: 'separator' });
    await add({ id: 'fc-forget', title: 'Forget my setting for this field' });
    await add({ id: 'fc-settings', title: 'Field settings…' });
  }

  // What happened, on the toolbar button: a short badge, and in full when pointed at.
  async function tell(tabId, ok, title) {
    try {
      await chrome.action.setBadgeBackgroundColor({ tabId, color: ok ? BADGE.ok : BADGE.error });
      await chrome.action.setBadgeText({ tabId, text: ok ? '✓' : '!' });
      setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {}), 4000);
      await chrome.action.setTitle({ tabId, title: `FillCraft — ${title}` });
    } catch (_) { /* the tab is gone */ }
  }

  // The same settings a keyboard shortcut uses (what the popup saved).
  async function storedSettings() {
    const s = await chrome.storage.local.get(['options', 'edgeType', 'invalidType', 'settingsVersion']).catch(() => ({}));
    const options = { ...(s.options || {}) };
    if ((s.settingsVersion || 1) < 2) options.customDropdowns = true;
    return { options, edgeType: s.edgeType || 'random', invalidType: s.invalidType || 'random' };
  }

  // Fills only the right-clicked field / its section, in the frame it is in. The field is filled
  // even if it already holds a value (you asked for it); nothing outside is touched.
  async function fillTarget(tab, frameId, target, mode) {
    const st = await storedSettings();
    const payload = {
      mode, target, frameId,
      options: { ...st.options, skipFilled: false, expandSections: false, onlyRequired: false },
      edgeType: st.edgeType, invalidType: st.invalidType,
    };
    return FillCraftRunner.run(tab.id, 'fill', payload);
  }

  async function onClick(info, tab) {
    const id = String(info.menuItemId || '');
    if (!id.startsWith('fc-')) return;
    if (id === 'fc-settings') { chrome.tabs.create({ url: chrome.runtime.getURL('fieldsettings.html') }); return; }
    if (!tab || tab.id == null) return;
    if (FillCraftRunner.restrictedReason(tab.url)) { await tell(tab.id, false, "browsers don't allow extensions on this page."); return; }
    const frameId = info.frameId || 0;
    try {
      // Fill this field / section.
      const fill = id.match(/^fc-fill-(field|section):(valid|invalid|edge)$/);
      if (fill) {
        const res = await fillTarget(tab, frameId, fill[1], fill[2]);
        if (res && res.targetMissing) { await tell(tab.id, false, 'no field where you right-clicked — right-click inside the box of a field.'); return; }
        const what = fill[1] === 'field' ? 'this field' : 'this section';
        const failed = res && res.failed ? ` · ${res.failed} failed` : '';
        await tell(tab.id, !(res && res.failed), `filled ${what}: ${res ? res.filled : 0} of ${res ? res.total : 0}${failed}. Open FillCraft for the details.`);
        return;
      }
      // Treat as / leave alone / forget: which field is it?
      const d = await FillCraftRunner.describeTarget(tab.id, frameId);
      if (!d || !d.ok) { await tell(tab.id, false, (d && d.reason) || 'FillCraft could not tell which field you right-clicked.'); return; }
      const host = (() => { try { return new URL(d.origin).host || 'this site'; } catch (_) { return 'this site'; } })();
      if (id === 'fc-forget') {
        const had = await FillCraftRules.forget(d.origin, d.sig);
        await tell(tab.id, had, had ? `forgot your setting for “${d.label}” on ${host}; FillCraft recognises it by itself again.` : `there was no setting for “${d.label}” on ${host}.`);
        return;
      }
      const type = id.slice('fc-type:'.length);
      if (!(type in FillCraftRules.LABELS)) return;
      await FillCraftRules.save(d.origin, d.sig, type, d.label, d.path);
      if (type === 'leave') {
        await tell(tab.id, true, `on ${host}, “${d.label}” will be left alone. Right-click it again to change or forget this.`);
        return;
      }
      // The field is filled at once, the new way (Valid data).
      await fillTarget(tab, frameId, 'field', 'valid').catch(() => null);
      await tell(tab.id, true, `on ${host}, “${d.label}” will now be filled as ${FillCraftRules.LABELS[type]}. Right-click it again to change or forget this.`);
    } catch (err) {
      await tell(tab.id, false, FillCraftRunner.friendlyError(err, tab.url));
    }
  }

  // Pages already open when FillCraft was installed or updated get the right-click listener too
  // (otherwise only pages loaded afterwards would have it).
  async function listenInOpenTabs() {
    let tabs = [];
    try { tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*', 'file:///*'] }); } catch (_) { return; }
    for (const t of tabs) {
      try { await chrome.scripting.executeScript({ target: { tabId: t.id, allFrames: true }, files: ['ctxmenu.js'] }); } catch (_) { /* a page extensions may not touch */ }
    }
  }

  return { create, onClick, listenInOpenTabs, fillTarget };
})();
