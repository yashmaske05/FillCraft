// Shared by popup.js (via <script>) and background.js (via importScripts):
// injects the engine into every frame of a tab, runs an action and aggregates results.

const FillCraftRunner = (() => {
  // Pages where browsers never allow extension scripts.
  const RESTRICTED = [
    /^chrome:/i, /^edge:/i, /^brave:/i, /^opera:/i, /^vivaldi:/i, /^about:/i,
    /^chrome-extension:/i, /^extension:/i, /^devtools:/i, /^view-source:/i, /^chrome-search:/i,
    /^https:\/\/chromewebstore\.google\.com\//i,
    /^https:\/\/chrome\.google\.com\/webstore/i,
    /^https:\/\/microsoftedge\.microsoft\.com\/addons/i,
  ];

  function restrictedReason(url) {
    if (url && RESTRICTED.some((r) => r.test(url))) {
      return "Browsers don't allow extensions on this page. Open the page with your form.";
    }
    return null;
  }

  function friendlyError(err, url) {
    const msg = String((err && err.message) || err || 'Unknown error');
    if (/^file:/i.test(url || '') && /cannot access|permission/i.test(msg)) {
      return 'To use FillCraft on local files, turn on "Allow access to file URLs" for it in chrome://extensions.';
    }
    // (A time-out: the page is busy or frozen — not a page extensions are kept out of.)
    if (/did not answer/i.test(msg)) return 'The page is not responding (it may be busy or frozen). Wait a moment or reload it, then try again.';
    if (/cannot access|cannot be scripted|extensions gallery|Missing host permission/i.test(msg)) {
      return "This page can't be accessed by extensions.";
    }
    if (/No tab with id|tab was closed/i.test(msg)) return 'The tab was closed.';
    if (/showing error page/i.test(msg)) return 'This page did not load properly. Reload it, then try again.';
    if (/message port closed/i.test(msg)) return "FillCraft's background service stopped for a moment. Try again.";
    if (/Frame with ID|frame was removed|navigat/i.test(msg)) {
      return 'The page changed while running. Try again once it has loaded.';
    }
    return msg;
  }

  // A browser call that can hang on some pages (view-source:, a frozen tab) gets a time limit.
  function withTimeout(promise, ms, message) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })])
      .finally(() => clearTimeout(timer));
  }

  // One person per fill, shared by every frame (otherwise an iframe'd address block
  // would belong to a different person than the main form).
  // Built-in sample upload files (samples/), by slot. A file the user saved on the
  // "Test files" page (chrome.storage.local → customSamples[slot]) replaces the built-in one.
  const SAMPLE_SLOTS = {
    avatar: { file: 'avatar.jpg', label: 'Profile photo', usedFor: 'Profile / patient / resident photo, avatar, picture' },
    insuranceFront: { file: 'insurance-front.jpg', label: 'Insurance card — front', usedFor: 'Insurance card front, any "card" upload' },
    insuranceBack: { file: 'insurance-back.jpg', label: 'Insurance card — back', usedFor: 'Back of health, dental, vision and Rx plan cards' },
    medicare: { file: 'medicare-card.jpg', label: 'Medicare card', usedFor: 'Medicare ID / card (front)' },
    medicaid: { file: 'medicaid-card.jpg', label: 'Medicaid card', usedFor: 'Medicaid ID / card (front)' },
    photoId: { file: 'photo-id.jpg', label: "Photo ID (driver's license)", usedFor: "Photo ID, driver's license, state ID, passport" },
    record: { file: 'medical-record.pdf', label: 'Medical record (PDF)', usedFor: 'Medical records, lab results, reports, referrals, other documents' },
    consent: { file: 'consent-form.pdf', label: 'Consent form (PDF)', usedFor: 'Signed consent, advance directive, power of attorney' },
    medicareBack: { file: 'medicare-back.jpg', label: 'Medicare card — back', usedFor: 'Back of the Medicare card' },
    medicaidBack: { file: 'medicaid-back.jpg', label: 'Medicaid card — back', usedFor: 'Back of the Medicaid card' },
    photoIdBack: { file: 'photo-id-back.jpg', label: 'Photo ID — back', usedFor: "Back of a driver's license or state ID" },
    documentImage: { file: 'document-scan.jpg', label: 'Document (image)', usedFor: 'Documents where only images are accepted — photo / scan of a record, prescription, vaccine card' },
    signature: { file: 'signature.png', label: 'Signature (image)', usedFor: 'Signature uploads' },
    clinicalImage: { file: 'clinical-photo.jpg', label: 'Clinical photo', usedFor: 'Wound, skin, rash, injury or x-ray photos' },
  };

  function toBase64(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const typeOfSample = (name) => (name.endsWith('.pdf') ? 'application/pdf' : name.endsWith('.png') ? 'image/png' : 'image/jpeg');

  // { slot: { name, type, data (base64) } } for every slot that could be loaded. When the
  // user replaced a slot, the built-in file travels along as "<slot>@builtin": an upload
  // that cannot take the user's file (a PDF-only upload and a photo) gets the built-in one.
  async function loadSampleFiles() {
    let custom = {};
    try { custom = (await chrome.storage.local.get('customSamples')).customSamples || {}; } catch (_) { /* built-ins only */ }
    const out = {};
    for (const [slot, def] of Object.entries(SAMPLE_SLOTS)) {
      let builtin = null;
      try {
        const res = await fetch(chrome.runtime.getURL('samples/' + def.file));
        if (res.ok) builtin = { name: def.file, type: typeOfSample(def.file), data: toBase64(await res.arrayBuffer()) };
      } catch (_) { /* no built-in for this slot */ }
      const c = custom[slot];
      // A saved file that is not valid base64 (damaged storage) is not used.
      let usable = !!(c && c.data && c.name);
      if (usable) { try { atob(c.data.slice(0, 4096)); } catch (_) { usable = false; } }
      if (usable) {
        out[slot] = { name: c.name, type: c.type || 'application/octet-stream', data: c.data };
        if (builtin) out[slot + '@builtin'] = builtin;
      } else if (builtin) {
        out[slot] = builtin;
      }
    }
    return out;
  }

  // Settings → Test patient: the kind of person to make. (Missing settings = the defaults:
  // an adult, any insurance, any state — the person FillCraft always made.)
  function profileOf(options) {
    const o = options || {};
    return { patient: o.patientAge || 'adult', insurance: o.patientInsurance || 'any', state: o.patientState || 'any' };
  }

  // `base`: the kept person ("Keep the same person"), else a new one is made.
  function makeDataset(payload, base) {
    const Q = globalThis.QAData;
    if (!Q) return undefined; // frames fall back to generating their own
    const profile = profileOf(payload.options);
    if (payload.mode === 'invalid') return Q.generateInvalid(payload.invalidType || 'random', profile, base);
    if (payload.mode === 'edge') {
      // Per-field boundary types build their values from each field's limits; the
      // dataset is only used for fields where limits do not apply.
      const t = payload.edgeType || 'random';
      return Q.generateEdge(t.startsWith('limit-') ? 'random' : t, profile, base);
    }
    const d = base ? JSON.parse(JSON.stringify(base)) : Q.generateValid(profile);
    // Settings → "Password for test accounts": a team password, or empty for a random one.
    const pw = payload.options && payload.options.testPassword;
    if (typeof pw === 'string') {
      const v = pw.trim() ? pw.trim() : d.passwordRandom; // (stray spaces around it are not part of it)
      d.password = d.passwordConfirm = v;
    }
    return d;
  }

  // ---- "Keep the same person" ----
  // One person for every fill (Valid, Invalid and Edge start from them) until "New person",
  // a change of the Test patient settings, or the browser closes (session storage). Shared by
  // the popup and the keyboard shortcuts. Only a short number (#7K3Q) ever goes into a report.
  const SAME_KEY = 'samePerson';
  const profileKey = (options) => JSON.stringify(profileOf(options));
  // (Letters only: reports mask runs of digits as record numbers.)
  const newPersonId = () => Array.from({ length: 4 }, () => 'ACDEFGHJKMNPQRTUVWXY'[Math.floor(Math.random() * 20)]).join('');

  // The kept person if it still fits the settings — else null.
  async function keptPerson(options) {
    try {
      const saved = (await chrome.storage.session.get(SAME_KEY))[SAME_KEY];
      if (!saved || !saved.base || saved.profileKey !== profileKey(options)) return null;
      // (Made by another FillCraft version: its fields may differ — made again.)
      if (saved.version !== chrome.runtime.getManifest().version) return null;
      return saved;
    } catch (_) { return null; }
  }

  // Makes (and keeps) a new person for these settings.
  async function newPerson(options) {
    const Q = globalThis.QAData;
    if (!Q) return null;
    const saved = { id: newPersonId(), profileKey: profileKey(options), version: chrome.runtime.getManifest().version, base: Q.generateValid(profileOf(options)), fills: 0, at: Date.now() };
    try { await chrome.storage.session.set({ [SAME_KEY]: saved }); } catch (_) { /* used for this fill only */ }
    return saved;
  }

  async function forgetPerson() {
    try { await chrome.storage.session.remove(SAME_KEY); } catch (_) { /* nothing kept */ }
  }

  // The data for one fill: the kept person when "Keep the same person" is on, otherwise a new
  // one. `_person` says which (a number and how many fills used it) — not a field.
  async function datasetFor(payload) {
    const options = payload.options || {};
    if (!options.samePerson) return makeDataset(payload);
    let saved = await keptPerson(options);
    if (!saved) saved = await newPerson(options);
    if (!saved) return makeDataset(payload);
    saved.fills = (saved.fills || 0) + 1;
    try { await chrome.storage.session.set({ [SAME_KEY]: saved }); } catch (_) { /* count only */ }
    const d = makeDataset(payload, saved.base);
    if (d) d._person = { id: saved.id, fill: saved.fills };
    return d;
  }

  // Runs `action` in EVERY frame (main document + iframes) so forms embedded in
  // iframes are handled too — or, with a dialog open, in the page and the frames inside
  // that dialog only. Returns { filled, skipped, failed, total, summary, log } where each
  // log entry carries the frameId it came from.
  // While a fill / clear runs on a tab, the popup (reopened meanwhile) can tell.
  const runningKey = (tabId) => `running:${tabId}`;
  async function runningOn(tabId) {
    try {
      const v = (await chrome.storage.session.get(runningKey(tabId)))[runningKey(tabId)];
      if (!v) return null;
      // (A marker older than 5 minutes that the page does not confirm is left over from a
      // stopped service worker; a long fill the page confirms is still running.)
      const old = Date.now() - v.at >= 5 * 60000;
      // The page confirms it: its engine says whether it is working (after the first
      // seconds, which go to loading the engine) — in any frame: a form in an iframe is
      // still being filled after the page itself is done.
      if (Date.now() - v.at > 3000) {
        try {
          const rs = await withTimeout(chrome.scripting.executeScript({
            target: { tabId, allFrames: true }, injectImmediately: true, func: () => !!window.__qaFormFillerBusy,
          }), 2000, 'busy');
          const answered = (rs || []).filter((r) => r && typeof r.result === 'boolean');
          if (answered.some((r) => r.result === true)) return v;
          if (answered.length) { clearRunning(tabId, v.token); return null; }
        } catch (_) { /* cannot tell: trust the marker (unless it is old) */ }
      }
      return old ? null : v;
    } catch (_) { return null; }
  }

  // The marker is removed only by the run that set it (a run refused meanwhile must not
  // remove the marker of the fill that is still going).
  async function clearRunning(tabId, token) {
    try {
      const cur = (await chrome.storage.session.get(runningKey(tabId)))[runningKey(tabId)];
      if (cur && (!token || cur.token === token)) await chrome.storage.session.remove(runningKey(tabId));
    } catch (_) { /* gone */ }
  }

  async function run(tabId, action, payload) {
    // A fill knows when it started: a Stop pressed after this moment stops it (also while
    // the engine is still being loaded into the page).
    if (action === 'fill') payload = { ...payload, startedAt: Date.now() };
    const marks = action === 'fill' || action === 'clear';
    let token = null;
    if (marks) {
      // A fill or clear already working on this tab (started from the popup, a shortcut or
      // another window): one at a time.
      const busy = await runningOn(tabId);
      if (busy) throw new Error(`A ${busy.action === 'clear' ? 'clear' : 'fill'} is already running on this page — wait for it to finish, or press Stop`);
      token = Math.random().toString(36).slice(2);
      try { await chrome.storage.session.set({ [runningKey(tabId)]: { action, at: Date.now(), token } }); } catch (_) { /* informational only */ }
    }
    try {
      return await runInner(tabId, action, payload);
    } finally {
      if (marks) await clearRunning(tabId, token);
    }
  }

  // The engine's files, in order (the field settings module before the engine that uses it).
  const ENGINE_FILES = ['data.js', 'fieldrules.js', 'content.js'];

  async function fieldRulesNow() {
    try { const v = (await chrome.storage.local.get('fieldRules')).fieldRules; return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; }
  }

  // The right-click menu: the field that was right-clicked in this frame — how a setting would
  // recognise it, and its name for messages. { ok, sig, label, origin, path } or { ok: false, reason }.
  async function describeTarget(tabId, frameId) {
    try {
      await withTimeout(chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId || 0] }, injectImmediately: true, files: ENGINE_FILES }), 10000, 'The page did not answer.');
      const [r] = await withTimeout(chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId || 0] },
        injectImmediately: true,
        func: () => (window.__qaFormFiller && window.__qaFormFiller.describeTarget ? window.__qaFormFiller.describeTarget() : { ok: false, reason: 'FillCraft could not start on this page.' }),
      }), 10000, 'The page did not answer.');
      return (r && r.result) || { ok: false, reason: 'FillCraft could not read this page.' };
    } catch (err) {
      return { ok: false, reason: friendlyError(err, '') };
    }
  }

  async function runInner(tabId, action, payload) {
    // The popup builds the dataset itself (its scripts are always the current files); the
    // keyboard-shortcut path arrives without one.
    if (action === 'fill') payload = { ...payload, dataset: payload.dataset || await datasetFor(payload) };
    // Sample files for upload fields: only when switched on, and only for valid data.
    if (action === 'fill' && payload.options && payload.options.attachFiles && (payload.mode || 'valid') === 'valid' && !payload.files) {
      payload = { ...payload, files: await loadSampleFiles() };
    }
    // Your field settings (right-click menu), all sites: each frame uses its own site's.
    if (action === 'fill' || action === 'detect') payload = { ...payload, fieldRules: await fieldRulesNow() };

    // (Re)inject the engine. Per-frame failures (sandboxed / about:blank frames) are
    // expected and non-fatal; if the main frame failed, the call below reports it.
    try {
      await withTimeout(chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        injectImmediately: true, // do not wait for slow ads / trackers to finish loading
        files: ENGINE_FILES,
      }), 15000, 'The page did not answer.');
    } catch (err) {
      if (/did not answer/.test(String(err && err.message))) throw err;
      /* see comment above */
    }
    // The page-world half of the guard: form.submit() does nothing while FillCraft works
    // (it fires no event the content script could stop). Not having it is not fatal.
    // (Inspect opens dropdowns too.)
    if (action === 'fill' || action === 'clear' || action === 'inspect') {
      try {
        await withTimeout(chrome.scripting.executeScript({
          target: { tabId, allFrames: true }, world: 'MAIN', injectImmediately: true, files: ['guard-main.js'],
        }), 10000, 'The page did not answer.');
      } catch (_) { /* the content script's own guard still runs */ }
    }

    // (The right-click menu: the frame the field is in, only.)
    const plan = payload.frameId != null
      ? { frameIds: [payload.frameId], withFiles: new Set([payload.frameId]), nonce: null }
      : await planFrames(tabId, payload.files ? 'files' : '');
    // Big sample files go only to frames that have an upload field.
    const { files, ...lean } = payload;
    const groups = files
      ? [{ ids: plan.frameIds.filter((id) => plan.withFiles.has(id)), payload }, { ids: plan.frameIds.filter((id) => !plan.withFiles.has(id)), payload: lean }]
      : [{ ids: plan.frameIds, payload }];
    const runIn = (ids, p) => (ids.length ? chrome.scripting.executeScript({
      target: { tabId, frameIds: ids },
      injectImmediately: true, // do not wait for slow ads / trackers to finish loading
      func: async (a, pl) => {
        const api = window.__qaFormFiller;
        if (!api || typeof api[a] !== 'function') return null;
        // An error thrown on the page is reported, not lost.
        try { return await api[a](pl); } catch (e) { return { error: 'FillCraft stopped with an error: ' + String((e && e.message) || e) }; }
      },
      args: [action, p],
    }) : Promise.resolve([]));
    let results;
    // A page that goes to another address mid-fill (a field whose change opens another
    // page) never answers: stop waiting and say so.
    const watch = action === 'fill' || action === 'clear' ? watchNavigation(tabId, await currentDocumentId(tabId).catch(() => null)) : null;
    try {
      const all = Promise.all(groups.map((g) => runIn(g.ids, g.payload)));
      results = (await (watch ? Promise.race([all, watch.moved]) : all)).flat();
    } finally {
      if (watch) watch.stop();
      // The mark FillCraft put on the open dialog (to find the frames inside it) goes away.
      if (plan.nonce) chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, injectImmediately: true, func: () => { const api = window.__qaFormFiller; if (api && api.unmarkDialog) api.unmarkDialog(); } }).catch(() => {});
    }

    const agg = { filled: 0, skipped: 0, failed: 0, total: 0, customNotFilled: 0, summary: {}, log: [] };
    const errors = [];
    let responded = false;
    // Main frame (id 0) first, then iframes, each in its own document order.
    const ordered = (results || []).slice().sort((a, b) => (a.frameId || 0) - (b.frameId || 0));
    // The main page's own error (e.g. "A fill is already running") must not be hidden
    // just because an iframe responded.
    const mainError = ordered.find((r) => (r.frameId || 0) === 0 && r.result && r.result.error);
    if (mainError) throw new Error(mainError.result.error);
    for (const r of ordered) {
      const v = r && r.result;
      if (!v) continue;
      if (v.error) { errors.push(v.error); continue; }
      responded = true;
      agg.filled += v.filled || 0;
      agg.skipped += v.skipped || 0;
      agg.failed += v.failed || 0;
      agg.total += v.total || 0;
      agg.customNotFilled += v.customNotFilled || 0;
      if (v.navigatedBy && !agg.navigatedBy) agg.navigatedBy = v.navigatedBy;
      // "In the open dialog" describes the page itself, not a dialog inside an iframe.
      if (v.dialog && (r.frameId || 0) === 0) agg.dialog = v.dialog;
      if (v.stopped) agg.stopped = (agg.stopped || 0) + v.stopped;
      if (v.leftOpen) agg.leftOpen = (agg.leftOpen || 0) + v.leftOpen;
      if (v.notCleared) agg.notCleared = (agg.notCleared || 0) + v.notCleared;
      if (v.cancelled) agg.cancelled = true;
      if (v.targetMissing) agg.targetMissing = true; // (right-click menu: no field where it was clicked)
      agg.kept = (agg.kept || 0) + (v.kept || 0);
      for (const k in v.summary || {}) agg.summary[k] = (agg.summary[k] || 0) + v.summary[k];
      if (v.inspect) agg.inspect = (agg.inspect || []).concat(v.inspect.map((x) => ({ ...x, frameId: r.frameId || 0 })));
      for (const e of v.log || []) agg.log.push({ ...e, frameId: r.frameId || 0, inFrame: (r.frameId || 0) !== 0 });
    }
    if (!responded) throw new Error(errors[0] || "Couldn't run on this page. Reload it and try again.");
    // A frame (a form in an iframe) that stopped with an error while others worked: said, not lost.
    if (errors.length) agg.frameErrors = errors.slice(0, 3);

    // Remember the last fill/detect per tab (in memory only, cleared when the browser
    // closes or the tab is closed) so the popup can show it — e.g. after a keyboard-
    // shortcut run. It is tied to the exact document and address, so it is never shown for
    // a page that has since navigated, reloaded or changed its route. A Clear forgets it
    // (its values are no longer on the page).
    const key = `lastRun:${tabId}`;
    try {
      if (action === 'fill' || action === 'detect') {
        const main = ordered.find((r) => (r.frameId || 0) === 0);
        // (The settings the run used go along: the report states those.)
        const entry = {
          action, mode: payload.mode || null, at: Date.now(), documentId: main && main.documentId, url: await pageAddress(tabId), result: agg,
          options: payload.options || null, invalidType: payload.invalidType || null, edgeType: payload.edgeType || null,
          person: (payload.dataset && payload.dataset._person) || null,
          // (Started from the right-click menu: "field" / "section".)
          target: payload.target || null,
        };
        await chrome.storage.session.set({ [key]: entry });
      } else if (action === 'clear') {
        await chrome.storage.session.remove(key);
      }
    } catch (_) { /* session storage unavailable — the popup just won't show it */ }
    return agg;
  }

  // Which frames to run in, and which of them have an upload field. Every frame — unless
  // a dialog is open in the page: then the page and the frames inside that dialog only,
  // never forms in frames behind it. A frame is inside the dialog when its <iframe> sits in
  // it (checked through same-origin parents, so srcdoc / about:blank / nested frames and
  // frames in shadow DOM count); a cross-origin frame is matched by its address, and one
  // that cannot be matched for sure is left alone.
  async function planFrames(tabId, want) {
    const nonce = Math.random().toString(36).slice(2);
    let info = null;
    try {
      const [top] = await withTimeout(chrome.scripting.executeScript({
        target: { tabId, frameIds: [0] },
        injectImmediately: true,
        func: (n) => (window.__qaFormFiller && window.__qaFormFiller.dialogFrames ? window.__qaFormFiller.dialogFrames(n) : null),
        args: [nonce],
      }), 10000, 'The page did not answer.');
      info = top && top.result;
    } catch (_) { info = null; }
    let frames = [];
    try {
      frames = await withTimeout(chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        injectImmediately: true,
        func: (n) => {
          const href = location.href.split('#')[0];
          let inDialog = null; // unknown
          try {
            const marked = (el) => {
              for (let x = el; x; x = x.parentElement || (x.getRootNode && x.getRootNode().host) || null) {
                if (x.getAttribute && x.getAttribute('data-fillcraft-dialog') === n) return true;
              }
              return false;
            };
            let w = window;
            while (w !== w.top) {
              const fe = w.frameElement;
              if (!fe) { inDialog = null; break; } // a cross-origin parent: cannot tell
              if (marked(fe)) { inDialog = true; break; }
              w = w.parent;
              if (w === w.top) { inDialog = false; break; }
            }
          } catch (_) { inDialog = null; }
          let hasFile = !!document.querySelector('input[type="file"]');
          if (!hasFile) { try { hasFile = Array.from(document.querySelectorAll('*')).some((e) => e.shadowRoot && e.shadowRoot.querySelector('input[type="file"]')); } catch (_) { /* no */ } }
          return { href, inDialog, hasFile };
        },
        args: [nonce],
      }), 10000, 'The page did not answer.');
    } catch (_) { frames = []; }
    const all = frames.length ? frames : [{ frameId: 0, result: { hasFile: true } }];
    const inPlan = (f) => {
      if ((f.frameId || 0) === 0 || !info || !info.open) return true;
      const r = f.result || {};
      if (r.inDialog === true) return true;
      if (r.inDialog === false) return false;
      return (info.inside || []).includes(r.href) && !(info.outside || []).includes(r.href);
    };
    const chosen = all.filter((f) => inPlan(f) && !((f.frameId || 0) !== 0 && CAPTCHA_FRAME_RE.test((f.result && f.result.href) || '')));
    return {
      frameIds: Array.from(new Set(chosen.map((f) => f.frameId || 0))),
      withFiles: new Set(chosen.filter((f) => !want || (f.result && f.result.hasFile)).map((f) => f.frameId || 0)),
      nonce: info && info.open ? nonce : null,
    };
  }

  // Frames of CAPTCHA services (reCAPTCHA, hCaptcha, Turnstile, Arkose, GeeTest…).
  const CAPTCHA_FRAME_RE = /^https?:\/\/(?:[^/]+\.)?(?:(?:google\.com|recaptcha\.net|gstatic\.com)\/recaptcha\/|hcaptcha\.com\/|challenges\.cloudflare\.com\/|(?:client-api\.)?arkoselabs\.com\/|funcaptcha\.com\/|geetest\.com\/|captcha-delivery\.com\/|mtcaptcha\.com\/|friendlycaptcha\.(?:com|eu)\/)/i;

  // The tab's address without the #fragment ('' when it cannot be read).
  async function pageAddress(tabId) {
    try { const t = await chrome.tabs.get(tabId); return String((t && t.url) || '').split('#')[0]; } catch (_) { return ''; }
  }

  // Resolves never; rejects once the tab's main frame holds another document than docId.
  function watchNavigation(tabId, docId) {
    let timer = null;
    let stopped = false;
    let fail;
    const moved = new Promise((_, reject) => { fail = reject; });
    moved.catch(() => {});
    const check = async () => {
      if (stopped || !docId) return;
      let now = null;
      try { now = await withTimeout(currentDocumentId(tabId), 2500, 'busy'); } catch (_) { now = null; }
      if (stopped) return;
      if (now && now !== docId) {
        stopped = true;
        fail(new Error('The page went to another address while FillCraft was filling (a field on it opens another page when it changes), so FillCraft stopped. Check the page before trying again.'));
        return;
      }
      timer = setTimeout(check, 1000);
    };
    const onUpdated = (id, info) => { if (id === tabId && info.status === 'loading') { clearTimeout(timer); timer = setTimeout(check, 300); } };
    try { chrome.tabs.onUpdated.addListener(onUpdated); } catch (_) { /* polling only */ }
    timer = setTimeout(check, 1000);
    return {
      moved,
      stop() { stopped = true; clearTimeout(timer); try { chrome.tabs.onUpdated.removeListener(onUpdated); } catch (_) { /* gone */ } },
    };
  }

  // The id of the document currently loaded in the tab's main frame.
  async function currentDocumentId(tabId) {
    const [r] = await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, injectImmediately: true, func: () => 0 });
    return r && r.documentId;
  }

  // Scrolls to and highlights one field from a log, in the frame it lives in.
  async function reveal(tabId, frameId, idx) {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId || 0] },
      injectImmediately: true,
      func: (i) => {
        const api = window.__qaFormFiller;
        return api && api.reveal ? api.reveal({ idx: i }) : { error: 'The page has changed since this run — run it again to show its fields' };
      },
      args: [idx],
    });
    const v = r && r.result;
    if (!v || v.error) throw new Error((v && v.error) || 'That field is no longer on the page');
    return true;
  }

  // The last run on this tab — only if the same document is still loaded at the same
  // address (a single-page app's route change counts as another page).
  async function lastRun(tabId) {
    try {
      const k = `lastRun:${tabId}`;
      const entry = (await chrome.storage.session.get(k))[k];
      if (!entry) return null;
      const sameDoc = entry.documentId && entry.documentId === await currentDocumentId(tabId);
      const sameUrl = !entry.url || entry.url === await pageAddress(tabId);
      if (!sameDoc || !sameUrl) {
        chrome.storage.session.remove(k).catch(() => {});
        return null;
      }
      return entry;
    } catch (_) {
      return null;
    }
  }

  // A closed tab's last run is forgotten (session storage has a size limit).
  function forgetTab(tabId) {
    try { chrome.storage.session.remove(`lastRun:${tabId}`).catch(() => {}); } catch (_) { /* nothing stored */ }
  }

  // The person pressed Stop: every frame's fill ends after the field it is working on (and
  // reports what it did). Marked with the time, so it never stops a fill started later.
  // Resolves to true when a fill was running in the tab.
  async function stop(tabId) {
    const results = await withTimeout(chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      injectImmediately: true,
      func: () => { window.__qaFormFillerStopAt = Date.now(); return !!window.__qaFormFillerBusy; },
    }), 3000, 'The page did not answer.');
    return (results || []).some((r) => r && r.result === true);
  }

  return { run, stop, reveal, lastRun, runningOn, forgetTab, restrictedReason, friendlyError, makeDataset, datasetFor, keptPerson, newPerson, forgetPerson, describeTarget, SAMPLE_SLOTS };
})();
