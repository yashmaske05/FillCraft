const $ = (id) => document.getElementById(id);

const state = {
  options: {
    highlight: true,
    onlyRequired: false,
    skipFilled: true,
    customDropdowns: true,
    expandSections: true,
    attachFiles: false,
    testPassword: 'Admin@1234',
    dropdownStrategy: 'match',
    // Test patient: who the data describes (the defaults make the person FillCraft always made).
    patientAge: 'adult',
    patientInsurance: 'any',
    patientState: 'any',
    samePerson: false,
  },
  edgeType: 'random',
  invalidType: 'random',
};

const DEFAULTS = JSON.parse(JSON.stringify(state));
const SETTINGS_VERSION = 2;

const OPTION_INPUTS = {
  'opt-highlight': 'highlight',
  'opt-required': 'onlyRequired',
  'opt-skip-filled': 'skipFilled',
  'opt-custom-dropdowns': 'customDropdowns',
  'opt-expand-sections': 'expandSections',
  'opt-attach-files': 'attachFiles',
  'opt-same-person': 'samePerson',
};

// Results currently shown in the list, the tab they belong to, and how they were made
// (for the "Copy report" button).
const view = { tabId: null, log: [], filter: 'all', action: '', status: '', pageUrl: '', run: null };

// Remembered to put keyboard focus back on the button that opened Settings / Help.
let openedViewFrom = null;

// ---------- Views (main / settings / help) ----------
function showView(name) {
  if (window.FillCraftSelect) FillCraftSelect.closeAll();
  const from = ['settings', 'help'].find((v) => !$(`view-${v}`).hidden);
  for (const v of ['main', 'settings', 'help']) $(`view-${v}`).hidden = v !== name;
  if (name === 'main' && !$('results').hidden) fitResultList();
  const back = from === 'help' ? $('btn-help') : openedViewFrom && openedViewFrom.isConnected && !openedViewFrom.hidden ? openedViewFrom : $('btn-settings');
  const focusTarget = name === 'main' ? back : document.querySelector(`#view-${name} [data-back]`);
  focusTarget?.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

// ---------- Options ----------
// Sets a <select> to a stored value, or back to its first option if that value
// no longer exists in the list.
function setSelectValue(sel, value) {
  sel.value = value;
  if (!sel.value) sel.selectedIndex = 0;
  if (sel._fcRefresh) sel._fcRefresh(); // FillCraft's in-popup dropdown shows the new value
  return sel.value;
}

function setStrategy(value) {
  const radio = document.querySelector(`input[name="dropdown-strategy"][value="${value}"]`) ||
    document.querySelector('input[name="dropdown-strategy"][value="match"]');
  radio.checked = true;
  return radio.value;
}

async function loadOptions() {
  let stored = null;
  try {
    stored = await chrome.storage.local.get(['options', 'edgeType', 'invalidType', 'settingsVersion']);
  } catch (err) {
    // Saved settings could not be read: the controls still show the settings in use.
    console.warn('[FillCraft] Could not load saved options:', err);
  }
  let migrated = false;
  if (stored) {
    if (stored.options) Object.assign(state.options, stored.options);
    // v2: custom dropdowns became on by default. Settings saved before that stored
    // "off" only because it was the old default — switch them on once.
    if ((stored.settingsVersion || 1) < SETTINGS_VERSION) {
      state.options.customDropdowns = true;
      migrated = true;
    }
    if (stored.edgeType) state.edgeType = stored.edgeType;
    if (stored.invalidType) state.invalidType = stored.invalidType;
  }

  showSettingControls();
  // (Saved only now, with the stored Invalid / Edge choices in place — not the defaults.)
  if (migrated) saveOptions();
}

// Edge cases come in two kinds — payloads, and each field's own limits ("limit-…" values).
// The switch above the list picks the kind; the list shows only that kind's options. The
// setting itself is still the one edgeType value.
const isLimitEdge = (v) => String(v || '').startsWith('limit-');
function showEdgeKind() {
  const limit = isLimitEdge(state.edgeType);
  const radio = document.querySelector(`input[name="edge-kind"][value="${limit ? 'limit' : 'payload'}"]`);
  if (radio) radio.checked = true;
  const sel = $('edge-type');
  for (const o of sel.options) o.hidden = isLimitEdge(o.value) !== limit;
  if (sel._fcRefresh) sel._fcRefresh();
  $('edge-type-help').textContent = limit
    ? "Each field's own maxlength / min / max. Fields without a length limit get 255 / 256 characters."
    : 'The same kind of test text in every field ("Random mix": a different kind per field).';
}

// ---------- Test patient ----------
const PATIENT_AGES = ['any', 'child', 'adult', 'senior'];
const PATIENT_LABEL = { any: 'Any age', child: 'Child', adult: 'Adult', senior: 'Senior 65+' };

// The states FillCraft has cities for (the State list), by name.
function fillStateList() {
  const sel = $('patient-state');
  if (!sel || sel.options.length > 1 || !globalThis.QAData) return;
  const names = Object.fromEntries(QAData.STATES.map((s) => [s.code, s.name]));
  const codes = [...new Set(QAData.LOCATIONS.map((l) => l.state))].sort((a, b) => names[a].localeCompare(names[b]));
  for (const c of codes) sel.append(new Option(names[c], c));
}

// Medicare is for patients of 65 and over: offered with Any / Senior only (Any + Medicare
// makes a senior). Leaving Senior while Medicare is chosen goes back to Any insurance.
function applyMedicareRule() {
  const o = state.options;
  const medicareOk = o.patientAge === 'any' || o.patientAge === 'senior';
  if (!medicareOk && o.patientInsurance === 'medicare') o.patientInsurance = 'any';
  const sel = $('patient-insurance');
  sel.querySelector('option[value="medicare"]').disabled = !medicareOk;
  setSelectValue(sel, o.patientInsurance);
  const help = $('patient-insurance-help');
  help.classList.toggle('warn', false);
  help.textContent = !medicareOk ? 'Medicare is for patients 65 and over — choose Any or Senior 65+ to get it.'
    : o.patientInsurance === 'none' ? 'Insurance boxes are left empty (a self-pay patient).'
    : o.patientInsurance === 'medicare' ? 'Original Medicare or a Medicare Advantage plan, with a Medicare ID (MBI).' : '';
  $('patient-age-help').textContent = o.patientAge === 'child' ? 'Ages 2–17, with a parent or guardian (emergency contact and, on a private plan, the subscriber).'
    : o.patientAge === 'senior' ? 'Ages 65–90, retired.'
    : o.patientAge === 'any' ? 'A child, an adult or a senior, a different one each time.' : '';
}

function showPatientControls() {
  const o = state.options;
  if (!PATIENT_AGES.includes(o.patientAge)) o.patientAge = DEFAULTS.options.patientAge;
  const radio = document.querySelector(`input[name="patient-age"][value="${o.patientAge}"]`);
  if (radio) radio.checked = true;
  o.patientState = setSelectValue($('patient-state'), o.patientState || 'any');
  if (!['any', 'private', 'medicare', 'medicaid', 'none'].includes(o.patientInsurance)) o.patientInsurance = 'any';
  applyMedicareRule();
}

// What the person bar says about the insurance.
function planLabel(d) {
  if (d.insuranceType === 'Self-pay' || !d.insuranceCarrier) return 'No insurance';
  if (d.insuranceType === 'Medicare') return 'Medicare';
  if (d.insuranceType === 'Medicare Advantage') return `${d.insuranceCarrier} Medicare Advantage`;
  if (/medicaid/i.test(d.insuranceType)) return `Medicaid (${d.insuranceCarrier})`;
  return d.insuranceCarrier;
}

// "Keep the same person" on: the bar under the mode cards shows who every fill uses (made
// now if there is nobody yet, or the Test patient settings changed). makeNew: New person.
let personBarRun = 0;
async function refreshPersonBar(makeNew = false) {
  const bar = $('person-bar');
  const run = ++personBarRun;
  if (!state.options.samePerson) { bar.hidden = true; return; }
  let p = null;
  try {
    p = makeNew ? null : await FillCraftRunner.keptPerson(state.options);
    if (!p) p = await FillCraftRunner.newPerson(state.options);
  } catch (_) { p = null; }
  if (run !== personBarRun) return; // a newer refresh is on its way
  if (!p || !p.base) { bar.hidden = true; return; }
  const d = p.base;
  $('person-initials').textContent = `${(d.firstName || '?')[0]}${(d.lastName || '?')[0]}`.toUpperCase();
  $('person-name').textContent = `${d.firstName} ${d.lastName} · ${d.age} · ${planLabel(d)}`;
  $('person-name').title = $('person-name').textContent; // (in full when the line is cut short)
  // (The number first: the line is cut short when it is long.)
  $('person-sub').textContent = `#${p.id} · ${p.fills ? `same person, used ${p.fills}×` : 'same person for every fill'}`;
  $('person-sub').title = 'Every fill uses this patient until you press New person or change Settings → Test patient';
  $('btn-new-person').setAttribute('aria-label', `New person (now ${d.firstName} ${d.lastName})`);
  bar.hidden = false;
}

// Puts the settings in use into the Settings controls.
function showSettingControls() {
  for (const [id, key] of Object.entries(OPTION_INPUTS)) $(id).checked = !!state.options[key];
  showPatientControls();
  $('opt-test-password').value = typeof state.options.testPassword === 'string' ? state.options.testPassword : DEFAULTS.options.testPassword;
  state.edgeType = setSelectValue($('edge-type'), state.edgeType);
  showEdgeKind();
  state.invalidType = setSelectValue($('invalid-type'), state.invalidType);
  state.options.dropdownStrategy = setStrategy(state.options.dropdownStrategy);
  reflectSettings();
}

// "Reset to defaults" asks once more (a stray click must not wipe someone's settings).
let resetArmed = null;
let resetArmedAt = 0;
function onResetSettings() {
  const btn = $('btn-reset-settings');
  if (!resetArmed) {
    btn.textContent = 'Click again to reset all settings';
    btn.classList.add('armed');
    resetArmedAt = performance.now();
    resetArmed = setTimeout(() => { resetArmed = null; btn.textContent = 'Reset to defaults'; btn.classList.remove('armed'); }, 4000);
    return;
  }
  // The second click of a double-click is not a deliberate "yes".
  if (performance.now() - resetArmedAt < 600) return;
  clearTimeout(resetArmed);
  resetArmed = null;
  btn.textContent = 'Reset to defaults';
  btn.classList.remove('armed');
  const fresh = JSON.parse(JSON.stringify(DEFAULTS));
  Object.assign(state.options, fresh.options);
  state.edgeType = fresh.edgeType;
  state.invalidType = fresh.invalidType;
  showSettingControls();
  saveOptions();
  // ("Keep the same person" is off again: the kept patient is forgotten.)
  FillCraftRunner.forgetPerson().catch(() => {});
  refreshPersonBar().catch(() => {});
  // The button hides once nothing differs: keep keyboard focus in Settings.
  if (btn.hidden) document.querySelector('#view-settings [data-back]')?.focus({ preventScroll: true });
}

function saveOptions() {
  reflectSettings();
  chrome.storage.local.set({
    settingsVersion: SETTINGS_VERSION,
    options: state.options,
    edgeType: state.edgeType,
    invalidType: state.invalidType,
  }).catch((err) => console.warn('[FillCraft] Could not save options:', err));
}

const optionText = (sel) => (sel.selectedOptions[0]?.textContent || '').split(' (')[0];

// The help under "Password for test accounts": a gentle warning when most forms would
// refuse the password (it is still used — the page's own error then gets it adjusted).
function showPasswordHelp() {
  const el = $('test-password-help');
  if (!el) return;
  const pw = (state.options.testPassword || '').trim();
  const missing = [];
  if (pw && pw.length < 8) missing.push('8+ characters');
  if (pw && !/[A-Z]/.test(pw)) missing.push('an uppercase letter');
  if (pw && !/[a-z]/.test(pw)) missing.push('a lowercase letter');
  if (pw && !/\d/.test(pw)) missing.push('a digit');
  if (pw && !/[^A-Za-z0-9]/.test(pw)) missing.push('a symbol');
  el.classList.toggle('warn', missing.length > 0);
  el.textContent = !pw ? 'Empty: each fill uses a random strong password. Test systems only.'
    : missing.length ? `Most forms need ${missing.join(', ')}. Used anyway; FillCraft adjusts it if the page shows an error.`
    : 'Used in every password field with Valid data, so anyone can sign in to the test accounts. Test systems only.';
}

// Settings that differ from the defaults, the ones that leave fields empty first.
// short: for the one-line note on the main view; long: for its tooltip.
function changedSettings() {
  const o = state.options;
  const d = DEFAULTS.options;
  const out = [];
  const add = (id, short, long, skips = false) => out.push({ id, short, long, skips });
  if (o.expandSections !== d.expandSections) add('opt-expand-sections', 'Sections & tabs skipped', 'Collapsed sections and tabs are not opened, so their fields stay empty', true);
  if (o.onlyRequired !== d.onlyRequired) add('opt-required', 'Only required fields', 'Only required fields are filled', true);
  if (o.customDropdowns !== d.customDropdowns) add('opt-custom-dropdowns', 'Custom dropdowns skipped', 'Custom dropdowns (Material UI, React-Select, Ant…) are not filled', true);
  if (o.skipFilled !== d.skipFilled) add('opt-skip-filled', 'Overwrites filled fields', 'Values already on the page are overwritten');
  if (o.attachFiles !== d.attachFiles) add('opt-attach-files', 'Attaches sample files', 'Upload fields get sample files');
  const pw = (o.testPassword || '').trim();
  if (pw !== d.testPassword) {
    add('opt-test-password', pw ? 'Own test password' : 'Random passwords',
      pw ? 'Password fields get your own test password' : 'Each fill uses a random password');
  }
  if (o.dropdownStrategy !== d.dropdownStrategy) {
    add('dropdown-strategy', `${o.dropdownStrategy[0].toUpperCase()}${o.dropdownStrategy.slice(1)} dropdown option`,
      `Dropdowns and radio buttons get the ${o.dropdownStrategy} option, not one that matches the data`);
  }
  if (o.highlight !== d.highlight) add('opt-highlight', 'No highlight', 'Filled fields are not highlighted');
  if (o.patientAge !== d.patientAge) add('patient-age', `Patient: ${PATIENT_LABEL[o.patientAge] || o.patientAge}`, `The test patient is: ${PATIENT_LABEL[o.patientAge] || o.patientAge}`);
  if (o.patientInsurance !== d.patientInsurance) {
    const ins = optionText($('patient-insurance'));
    add('patient-insurance', `Insurance: ${ins}`, o.patientInsurance === 'none' ? 'No insurance: insurance fields are left empty' : `Insurance: ${ins}`, o.patientInsurance === 'none');
  }
  if (o.patientState !== d.patientState) add('patient-state', `State: ${optionText($('patient-state'))}`, `Addresses are in ${optionText($('patient-state'))}`);
  if (o.samePerson !== d.samePerson) add('opt-same-person', 'Same person', 'Every fill uses the same patient until New person');
  if (state.invalidType !== DEFAULTS.invalidType) add('invalid-type', `Invalid: ${optionText($('invalid-type'))}`, `Invalid data: ${optionText($('invalid-type'))} only`);
  if (state.edgeType !== DEFAULTS.edgeType) add('edge-type', `Edge: ${optionText($('edge-type'))}`, `Edge cases: ${optionText($('edge-type'))} only`);
  return out;
}

// Mirrors the settings on the main view: the Invalid / Edge cards name their current
// type, and one line under the cards says when settings differ from the defaults (so a
// hidden setting such as "Only required" never surprises anyone) — the one that leaves
// fields empty named, the rest counted; the full list is in its tooltip and marked in
// Settings.
function reflectSettings() {
  $('invalid-desc').textContent = optionText($('invalid-type'));
  const edgeSel = $('edge-type');
  const group = edgeSel.selectedOptions[0]?.parentElement?.label || '';
  $('edge-desc').textContent = (group.startsWith('Each') ? 'Limits: ' : '') + optionText(edgeSel);
  showPasswordHelp();

  const changes = changedSettings();
  const note = $('settings-note');
  note.hidden = !changes.length;
  $('settings-dot').hidden = !changes.length;
  $('btn-reset-settings').hidden = !changes.length;
  if (changes.length) {
    note.querySelector('.note-count').textContent = changes.length > 1 ? `${changes.length} settings changed · ` : 'Changed: ';
    const key = note.querySelector('.note-key');
    key.textContent = changes[0].short;
    key.classList.toggle('warn', changes[0].skips);
    const full = `Settings changed from the defaults:\n${changes.map((c) => '• ' + c.long).join('\n')}\nClick to review them.`;
    note.title = full;
    note.setAttribute('aria-label', `Settings changed from the defaults: ${changes.map((c) => c.long).join('; ')}. Click to review them.`);
  }
  // In Settings: a dot on each changed setting, explained when pointed at.
  document.querySelectorAll('#view-settings .changed').forEach((n) => {
    n.classList.remove('changed');
    if (n.dataset.changedTip) { n.removeAttribute('title'); delete n.dataset.changedTip; }
  });
  for (const c of changes) {
    const n = $(c.id);
    const row = n && (n.closest('.switch-row, .field') || n.closest('.group'));
    if (!row) continue;
    row.classList.add('changed');
    if (!row.title) { row.title = 'Changed from the default'; row.dataset.changedTip = '1'; }
  }
}

// Show the user's actual shortcuts (they can be changed in chrome://extensions/shortcuts).
async function loadShortcuts() {
  try {
    const commands = await chrome.commands.getAll();
    const byName = Object.fromEntries(commands.map((c) => [c.name, c.shortcut]));
    document.querySelectorAll('.mode').forEach((btn) => {
      const kbd = btn.querySelector('kbd');
      const shortcut = byName[btn.dataset.command];
      kbd.textContent = shortcut || '';
      kbd.hidden = !shortcut;
      if (shortcut) btn.title = `Shortcut: ${shortcut}`;
    });
  } catch (_) { /* leave shortcuts hidden */ }
}

// ---------- Status ----------
function setStatus(msg, type = 'info') {
  $('status').hidden = false;
  $('status').dataset.type = type;
  $('status-msg').textContent = msg;
  if (!$('results').hidden) fitResultList();
}

// Disables the action buttons while a run is in progress. Focus is put back where it
// was afterwards (disabling the focused button would otherwise drop it to <body>).
let focusBeforeBusy = null;
function setBusy(busy, mode) {
  if (busy) focusBeforeBusy = document.activeElement;
  document.querySelectorAll('.mode, #btn-detect').forEach((b) => {
    b.disabled = busy;
    b.classList.toggle('running', busy && b.dataset.mode === mode);
  });
  $('status').classList.toggle('busy', busy);
  if (!busy && focusBeforeBusy && focusBeforeBusy.isConnected && document.activeElement === document.body) {
    focusBeforeBusy.focus({ preventScroll: true });
  }
}

// "firstName" → "First name"; "?input:text" → "Other (text field)" — a field not matched to
// a known type ("Other" reads as a category, not as a failure).
const ACRONYMS = new Set(['id', 'npi', 'dea', 'mrn', 'cpt', 'ssn', 'dob', 'icd10', 'bp', 'cc', 'url', 'mbi']);
const OTHER_TIP = 'Not matched to a known field type — its value comes from its label';
function friendlyKey(k) {
  if (!k) return '';
  const unknown = k.match(/^\?([\w-]+)(?::([\w-]+))?$/);
  if (unknown) {
    const [, tag, type] = unknown;
    if (tag === 'custom-dropdown') return 'Other (dropdown)';
    if (tag === 'choice-group') return 'Other (choice buttons)';
    if (tag === 'leave') return 'Left alone';
    const kind = tag === 'input' ? `${type || 'text'} field` : tag;
    return `Other (${kind})`;
  }
  const words = k
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(' ')
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w))
    .join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ---------- Results list ----------
const STATUS_WORD = { filled: 'Filled', skipped: 'Skipped', failed: 'Failed', detected: 'Detected' };
const STATUS_ICON = { filled: 'i-check', skipped: 'i-minus', failed: 'i-x', detected: 'i-dot' };
const SVG_NS = 'http://www.w3.org/2000/svg';

function icon(id) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'ic');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}

function hideResults() {
  document.body.classList.remove('compact');
  $('results').hidden = true;
  $('result-list').replaceChildren();
  view.log = [];
}

function renderResults() {
  const isDetect = view.log.length > 0 && view.log[0].status === 'detected';
  const counts = { all: view.log.length, filled: 0, skipped: 0, failed: 0 };
  for (const e of view.log) if (counts[e.status] != null) counts[e.status]++;

  // Filters (not for a detect preview — everything there is "detected").
  $('results').querySelector('.filters').hidden = isDetect;
  document.querySelectorAll('.chip').forEach((chip) => {
    const f = chip.dataset.filter;
    chip.querySelector('.count').textContent = counts[f];
    chip.hidden = f !== 'all' && !counts[f];
    chip.setAttribute('aria-pressed', String(view.filter === f));
  });

  const shown = view.log.filter((e) => view.filter === 'all' || e.status === view.filter);
  $('result-list').replaceChildren(...shown.map(renderRow));
  const first = $('result-list').querySelector('.row');
  if (first) first.tabIndex = 0;
  $('results').hidden = false;
  document.body.classList.add('compact'); // condense the mode cards to one row
  fitResultList();
}

// Chrome caps extension popups at 600px tall: give the list whatever height is left
// so the whole view fits without the popup itself scrolling.
const POPUP_MAX_HEIGHT = 600;
function fitResultList() {
  const list = $('result-list');
  list.style.maxHeight = '';
  const others = document.body.getBoundingClientRect().height - list.getBoundingClientRect().height;
  list.style.maxHeight = `${Math.max(140, Math.floor(POPUP_MAX_HEIGHT - others - 14))}px`;
}

function renderRow(e) {
  const li = document.createElement('li');
  const row = document.createElement('button');
  row.type = 'button';
  row.className = `row ${e.status}`;
  // The full label and reason (the row itself cuts long ones off).
  const why = e.status === 'failed' || e.status === 'skipped' ? e.reason : e.note;
  row.title = `${e.label}${why ? ' — ' + why : ''}\nClick to show this field on the page`;
  // One tab stop for the whole list; the arrow keys move between rows.
  row.tabIndex = -1;

  const badge = document.createElement('span');
  badge.className = 'row-icon';
  badge.append(icon(STATUS_ICON[e.status] || 'i-dot'));
  const statusText = document.createElement('span');
  statusText.className = 'sr-only';
  statusText.textContent = `${STATUS_WORD[e.status] || e.status}: `;

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = e.label;
  if (e.required) {
    const req = document.createElement('span');
    req.className = 'req';
    req.textContent = ' *';
    req.title = 'Required';
    label.append(req);
  }
  // Filled or left alone by your right-click setting for this site.
  if (e.rule) {
    const yours = document.createElement('span');
    yours.className = 'yours';
    yours.textContent = 'Your setting';
    yours.title = 'Set by you (right-click → FillCraft) for this site — Settings → Field settings';
    label.append(yours);
  }
  const kind = document.createElement('span');
  kind.className = 'kind';
  kind.textContent = (e.inFrame ? 'iframe · ' : '') + (friendlyKey(e.key || e.kind) || 'Other');
  if (!e.key && !e.rule) kind.title = OTHER_TIP;
  const top = document.createElement('span');
  top.className = 'top';
  top.append(label, kind);

  const detail = document.createElement('span');
  detail.className = 'detail';
  if (e.status === 'failed' || e.status === 'skipped') {
    detail.textContent = e.reason + (e.value && e.value !== '—' ? ` · now: ${e.value}` : '');
  } else if (e.status === 'detected') {
    detail.textContent = e.value && e.value !== '—' ? `now: ${e.value}` : '';
  } else {
    detail.textContent = e.note ? `${e.value} · ${e.note}` : e.value;
  }
  // (A setting of yours that fits two fields here was not used — said, not hidden.)
  if (e.ruleNote) detail.textContent += `${detail.textContent ? ' · ' : ''}${e.ruleNote}`;

  const main = document.createElement('span');
  main.className = 'main';
  main.append(top);
  if (detail.textContent) main.append(detail);
  row.append(badge, statusText, main);
  row.addEventListener('click', () => revealField(e));
  li.append(row);
  return li;
}

// run: the settings the run used (the report states those, not today's settings).
function showResults(tabId, log, action, run) {
  view.tabId = tabId;
  view.run = run || null;
  view.action = action || view.action;
  view.status = $('status-msg').textContent;
  chrome.tabs.get(tabId).then((t) => { view.pageUrl = t.url || ''; }).catch(() => {});
  view.log = log || [];
  view.filter = 'all';
  if (view.log.length) renderResults();
  else hideResults();
}

async function revealField(entry) {
  try {
    await FillCraftRunner.reveal(view.tabId, entry.frameId, entry.idx);
  } catch (err) {
    setStatus(FillCraftRunner.friendlyError(err, ''), 'error');
  }
}

// ---------- "Copy report" (troubleshooting) ----------
// Everything needed to diagnose a field FillCraft handled badly — WITHOUT any field
// values (they could be real data): label, how it was recognised, the result and a
// value-free description of the element. The page address is reduced to site + path.
// Record numbers and ids in an address or message ("/patients/448120/edit") are masked.
const maskIds = (s) => String(s || '')
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{id}')
  .replace(/\d{3,}/g, '#');
// What the page itself said (its error messages can repeat the value, or name a patient)
// is described, not copied.
function redactPageText(s) {
  return maskIds(String(s || '')
    .replace(/((?:Page says|Page showed|page said)[:]?\s*).*$/i, (m, p) => `${p}(the page's own message — not copied)`)
    // Quoted page text (an option picked, a button's words) can name a patient: only a
    // list's "No matches"-style message and the short letters FillCraft typed stay.
    .replace(/"([^"]*)"/g, (m, t) => (/^(no\s|nothing\b|loading|searching)/i.test(t) || /^[a-z]{1,4}$/i.test(t) ? m : '"…"')));
}

function buildReport() {
  let page = '';
  try { const u = new URL(view.pageUrl); page = u.origin + maskIds(u.pathname); } catch (_) { page = '(unknown)'; }
  const run = view.run;
  const o = (run && run.options) || state.options;
  const lines = [
    `FillCraft ${chrome.runtime.getManifest().version} — troubleshooting report (no field values; page text, record numbers and dialog titles left out)`,
    `Date: ${new Date().toISOString()}`,
    `Browser: ${navigator.userAgent}`,
    `Page: ${page}`,
    `Action: ${view.action}`,
    `Settings${run ? '' : ' (now — not recorded with this run)'}: skipFilled=${o.skipFilled} onlyRequired=${o.onlyRequired} customDropdowns=${o.customDropdowns} expandSections=${o.expandSections} attachFiles=${o.attachFiles} dropdownChoice=${o.dropdownStrategy} invalid=${(run && run.invalidType) || state.invalidType} edge=${(run && run.edgeType) || state.edgeType}`,
    // (The test patient's kind and, with "Keep the same person", its number — never the person.)
    `Test patient: ${o.patientAge || 'adult'}, insurance ${o.patientInsurance || 'any'}, state ${o.patientState || 'any'}${run && run.person && run.person.id ? `, same person #${run.person.id} (fill ${run.person.fill || '?'})` : o.samePerson ? ', same person on' : ''}`,
    // (A dialog's title can name a patient: it is left out.)
    `Result: ${maskIds(view.status.replace(/(in the open dialog) "[^"]*"/, '$1').replace(/A dialog \("[^"]*"\)/, 'A dialog').replace(/(an option in) "[^"]*"/, '$1 a field'))}`,
    '',
    '#  | status   | label | recognized as | reason | element',
  ];
  view.log.forEach((e, i) => {
    lines.push([
      String(i + 1).padStart(2),
      e.status.padEnd(8),
      (e.ctxLabel ? '(named by nearby page text — left out)' : maskIds(e.label)) + (e.required ? ' *' : ''),
      (friendlyKey(e.key || e.kind) || 'Other') + (e.rule ? ' (your setting)' : ''),
      redactPageText(e.status === 'filled' || e.status === 'detected' ? (e.note || '') : e.reason || ''),
      (e.inFrame ? '[iframe] ' : '') + maskIds(e.sig || ''),
    ].join(' | '));
  });
  // What each failed dropdown saw and did, recorded the moment it failed (structure only: tags,
  // classes, roles; a text only as its length) — what a fix for that page needs.
  const diags = view.log.map((e, i) => [i + 1, e]).filter(([, e]) => e.diag);
  if (diags.length) {
    lines.push('', 'FIELDS THAT FAILED OR LEFT A LIST OPEN, AS FILLCRAFT SAW THEM (page structure only — no field values, no page text)');
    // (Lists that were already open: named by their field's row number in the table above.)
    const rowOf = (idx, frameId) => { const r = view.log.findIndex((x) => x.idx === idx && (x.frameId || 0) === (frameId || 0)); return r >= 0 ? `#${r + 1}` : 'not in the table'; };
    for (const [n, e] of diags) {
      const d = { ...e.diag };
      if (Array.isArray(d.openBefore)) d.openBefore = d.openBefore.map((o) => ({ list: o.list, field: o.ownerIdx == null ? 'unknown' : rowOf(o.ownerIdx, e.frameId) }));
      lines.push(`#${n} ${e.ctxLabel ? '(label left out)' : maskIds(e.label)}: ${maskIds(JSON.stringify(d))}`);
    }
  }
  return lines.join('\n');
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.remove();
    return ok;
  }
}

// Opens each still-empty dropdown on the page, records how its list is built and copies
// that (structure only — no field values) for troubleshooting.
// One dropdown in plain words: what it is, whether it opened, and what that means.
function dropdownSummary(it, n) {
  const cls = [it.field && it.field.t, it.clicked && it.clicked.t].join(' ');
  const kind = /MuiAutocomplete/.test(cls) ? 'Material UI searchable dropdown'
    : /MuiSelect|MuiInputBase/.test(cls) ? 'Material UI dropdown'
    : /mat-(mdc-)?select/.test(cls) ? 'Angular Material dropdown'
    : /react-select|__control/.test(cls) ? 'React-Select dropdown'
    : /ant-select/.test(cls) ? 'Ant Design dropdown'
    : /select2/.test(cls) ? 'Select2 dropdown'
    : /choices/.test(cls) ? 'Choices.js dropdown'
    : 'custom dropdown';
  const opened = it.expandedNow === 'true' || it.newElements > 0;
  let verdict;
  if (!opened) verdict = 'The list did NOT open when FillCraft clicked it.';
  else if (it.optionsFillCraftSees > 0) verdict = `The list opened and FillCraft can see ${it.optionsFillCraftSees} option(s) — it should be able to fill this one.`;
  else if (it.rawOptionsSeen > 0) verdict = 'The list opened, but FillCraft did not accept its entries as choices.';
  else if (it.newElements > 0) verdict = 'The list opened, but FillCraft does not recognize how its options are built.';
  else verdict = 'The dropdown says it is open, but no list appeared on the page (it may still be loading, or it needs typing first).';
  return `${n}. ${it.label || '(no label)'} — ${kind}\n   ${verdict}`;
}

async function copyDropdownDetails() {
  const btn = $('btn-inspect');
  btn.disabled = true;
  btn.textContent = 'Checking dropdowns…';
  setBusy(true); // (opening dropdowns while a fill runs would disturb both)
  let res;
  try { res = await runOnPage('inspect', {}); } finally { setBusy(false); }
  let label = 'Copy failed';
  if (res) {
    const items = res.inspect || [];
    const text = [
      'FillCraft dropdown check',
      `Version: ${chrome.runtime.getManifest().version}`,
      `Page: ${(() => { try { const u = new URL(view.pageUrl); return u.origin + maskIds(u.pathname); } catch (_) { return ''; } })()}`,
      `Empty dropdowns checked: ${items.length}`,
      '',
      'SUMMARY',
      ...items.map((it, i) => dropdownSummary(it, i + 1)),
      '',
      'TECHNICAL DETAILS (for the FillCraft developer — page structure only: no field values, no page text)',
      JSON.stringify(items, null, 1),
    ].join('\n');
    label = items.length ? ((await copyText(text)) ? 'Copied ✓ — paste it to support' : 'Copy failed') : 'No empty dropdowns found';
  }
  btn.textContent = label;
  btn.disabled = false;
  // (Disabling the button took the keyboard focus off it: give it back.)
  if (document.activeElement === document.body) btn.focus({ preventScroll: true });
  setTimeout(() => { btn.textContent = 'Copy dropdown details'; }, 2500);
}

async function copyReport() {
  const text = buildReport();
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (_) {
    // Fallback for when the async clipboard is unavailable.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.remove();
  }
  const btn = $('btn-report');
  btn.textContent = ok ? 'Copied ✓' : 'Copy failed';
  setTimeout(() => { btn.textContent = 'Copy report'; }, 1600);
}

// ---------- Running actions ----------
async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function runOnPage(action, payload) {
  const tab = await activeTab();
  if (!tab?.id) {
    setStatus('No active tab', 'error');
    return null;
  }
  const blocked = FillCraftRunner.restrictedReason(tab.url);
  if (blocked) {
    setStatus(blocked, 'error');
    return null;
  }
  try {
    // Run in the service worker, not here: if the popup closes mid-fill (e.g. the
    // user clicks the page to watch), the fill still completes and is saved.
    // Build the fill data here: the popup always runs the current data.js, while a
    // background worker can still hold an older copy until the extension is reloaded.
    // (With "Keep the same person" on: the kept patient.)
    if (action === 'fill' && !payload.dataset && globalThis.QAData) {
      try { payload = { ...payload, dataset: await FillCraftRunner.datasetFor(payload) }; } catch (_) { /* the runner builds one */ }
    }
    const msg = { type: 'fillcraft:run', tabId: tab.id, action, payload };
    let reply;
    try {
      reply = await chrome.runtime.sendMessage(msg);
    } catch (err) {
      // "Receiving end does not exist": the background service worker is restarting
      // (e.g. right after the extension was reloaded). Try once more, then run here.
      if (!/receiving end does not exist|could not establish connection|message port closed/i.test(String(err && err.message))) throw err;
      await new Promise((r) => setTimeout(r, 400));
      try { reply = await chrome.runtime.sendMessage(msg); } catch (_) { reply = null; }
      if (!reply) reply = { result: await FillCraftRunner.run(tab.id, action, payload) };
    }
    if (!reply) throw new Error("Couldn't reach the extension. Reload it and try again.");
    if (reply.error) throw new Error(reply.error);
    const res = reply.result;
    res.tabId = tab.id;
    // Which kept patient the fill used (a number only), for the status line and the report.
    res.person = (payload.dataset && payload.dataset._person) || null;
    return res;
  } catch (err) {
    setStatus(FillCraftRunner.friendlyError(err, tab.url), 'error');
    return null;
  }
}

const MODE_LABEL = { valid: 'valid data', invalid: 'invalid data', edge: 'edge cases' };

const ONLY_CUSTOM = (n) => `Only ${n} custom dropdown${n === 1 ? '' : 's'} found — turn on Custom dropdowns in Settings to fill ${n === 1 ? 'it' : 'them'}`;

// With a dialog open, Fill / Clear / Detect work only inside it (never on the page behind).
const dialogTitle = (d) => String(d.name || '').replace(/"/g, "'");
const dialogWhere = (d) => (d ? ` in the open dialog${d.name ? ` "${dialogTitle(d)}"` : ''}` : '');
const DIALOG_EMPTY = (d) => `A dialog${d.name ? ` ("${dialogTitle(d)}")` : ''} is open in front of the page and has no fields. FillCraft works only in the open dialog — close it to fill the page.`;
const stoppedNote = (n) => (n ? ` · stopped ${n} page action${n === 1 ? '' : 's'} (submit / close) — nothing was submitted or closed` : '');

// "Only required fields" is on and nothing matched: say that, not "no fields".
const NO_FIELDS = (opts) => (opts && opts.onlyRequired
  ? 'No required fields found — "Only required fields" is on in Settings'
  : 'No form fields found on this page');

function describeFill(res, mode, opts) {
  // Stopped with the Stop button: say what was done (the results list shows each field).
  if (res.cancelled) {
    return {
      text: `Stopped by you — filled ${res.filled || 0} field${res.filled === 1 ? '' : 's'}${res.failed ? ` · ${res.failed} failed` : ''}${dialogWhere(res.dialog)}${stoppedNote(res.stopped)}. What was filled stays; use Clear form to empty it.`,
      type: 'warn',
    };
  }
  if (!res.total && res.dialog) return { text: DIALOG_EMPTY(res.dialog), type: 'info' };
  if (!res.total) {
    return res.customNotFilled
      ? { text: ONLY_CUSTOM(res.customNotFilled), type: 'warn' }
      : { text: NO_FIELDS(opts), type: 'info' };
  }
  // A choice took the page to another address: the fill stopped there.
  if (res.navigatedBy && res.navigatedBy.closedDialog) {
    return {
      text: `Stopped: the dialog closed after choosing an option in "${res.navigatedBy.label}" (the page closes it when something outside it is clicked). Filled ${res.filled} field${res.filled === 1 ? '' : 's'} before that; nothing else was touched.`,
      type: 'warn',
    };
  }
  if (res.navigatedBy) {
    return {
      text: `Stopped: choosing an option in "${res.navigatedBy.label}" took the page to ${res.navigatedBy.to}. Filled ${res.filled} field${res.filled === 1 ? '' : 's'} before that.`,
      type: 'warn',
    };
  }
  // Nothing filled because everything already has a value: say what to do instead.
  const log = res.log || [];
  if (!res.filled && !res.failed && log.length && log.every((e) => e.reason === 'Already filled')) {
    return {
      text: 'Nothing filled — every field already has a value. Clear the form first, or turn off "Skip already-filled fields" in Settings.',
      type: 'warn',
    };
  }
  const parts = [`Filled ${res.filled} of ${res.total}`];
  if (res.skipped) parts.push(`${res.skipped} skipped`);
  if (res.failed) parts.push(`${res.failed} failed`);
  // Custom dropdowns were left alone (the option is off) — say so, and how to fill them.
  const n = res.customNotFilled || 0;
  const hint = n ? ` · ${n} custom dropdown${n === 1 ? '' : 's'} left (turn on Custom dropdowns in Settings)` : '';
  return {
    text: `${parts.join(' · ')} — ${MODE_LABEL[mode] || mode}${dialogWhere(res.dialog)}${hint}${stoppedNote(res.stopped)}` +
      (res.leftOpen ? ` · a dropdown list stayed open — click the page to close it` : '') + frameErrorNote(res),
    type: res.failed || (res.frameErrors && res.frameErrors.length) ? 'warn' : res.filled ? 'success' : 'info',
  };
}

// The kept patient a fill used — by number only.
function personNote(person) {
  return person && person.id ? ` · same person #${person.id}${person.fill ? ` (fill ${person.fill})` : ''}` : '';
}

// A form in a frame (iframe) that stopped with an error while the rest of the page worked.
function frameErrorNote(res) {
  const errs = (res && res.frameErrors) || [];
  if (!errs.length) return '';
  return ` · ${errs.length === 1 ? 'a form in a frame' : `${errs.length} forms in frames`} of this page could not be done (${String(errs[0]).replace(/^FillCraft stopped with an error:\s*/i, 'error: ').slice(0, 120)})`;
}

// Set once the user starts a run, so a slower "last run" restore never overwrites it.
let userRunStarted = false;

// The Stop button, shown while a fill runs (in this popup, or one started earlier).
function showStop(on) {
  const btn = $('btn-stop');
  btn.hidden = !on;
  btn.disabled = false;
  btn.querySelector('.stop-label').textContent = 'Stop';
}

// Stop: the fill ends after the field it is working on and reports what it did (that
// report arrives the normal way, through the running fill).
async function stopFill() {
  const btn = $('btn-stop');
  if (btn.disabled) return;
  btn.disabled = true;
  btn.querySelector('.stop-label').textContent = 'Stopping…';
  setStatus('Stopping after the field FillCraft is working on…', 'info');
  try {
    const tab = await activeTab();
    if (tab?.id) await FillCraftRunner.stop(tab.id);
  } catch (err) {
    btn.disabled = false;
    btn.querySelector('.stop-label').textContent = 'Stop';
    setStatus(`Could not stop: ${FillCraftRunner.friendlyError(err, '')}`, 'error');
  }
}

async function handleFill(mode) {
  userRunStarted = true;
  hideResults();
  setBusy(true, mode);
  setStatus(mode === 'clear' ? 'Clearing the form…' : `Filling with ${MODE_LABEL[mode]}…`, 'info');
  if (mode !== 'clear') showStop(true);
  try {
    // (A copy: a setting changed while the fill runs must not change what its report says it used.)
    const payload = {
      mode,
      options: JSON.parse(JSON.stringify(state.options)),
      edgeType: state.edgeType,
      invalidType: state.invalidType,
    };
    const res = await runOnPage(mode === 'clear' ? 'clear' : 'fill', payload);
    if (!res) return;
    if (mode === 'clear') {
      const n = res.notCleared || 0;
      // (Clear empties every field, required or not: "Only required fields" plays no part.)
      if (!res.total && !n) setStatus(res.dialog ? DIALOG_EMPTY(res.dialog) : NO_FIELDS(null), 'info');
      else {
        const parts = [(res.filled ? `Cleared ${res.filled} field${res.filled === 1 ? '' : 's'}` : 'Nothing to clear') + dialogWhere(res.dialog)];
        if (res.stopped) parts.push(stoppedNote(res.stopped).slice(3));
        if (res.failed) parts.push(`${res.failed} could not be cleared (the page kept the value)`);
        if (res.kept) parts.push(`${res.kept} date picker${res.kept === 1 ? '' : 's'} left as is (clearing one can break some pages)`);
        // Custom dropdowns, rich-text boxes, sliders, colour pickers, choice buttons: Clear does not empty them.
        if (n) parts.push(`${n} field${n === 1 ? '' : 's'} Clear does not empty (custom dropdowns, text editors, sliders, colour pickers…) left as ${n === 1 ? 'it is' : 'they are'}`);
        setStatus(parts.join(' · ') + frameErrorNote(res), res.failed || res.kept || n || (res.frameErrors && res.frameErrors.length) ? 'warn' : 'success');
      }
      return;
    }
    const d = describeFill(res, mode, payload.options);
    setStatus(d.text + personNote(res.person), d.type);
    showResults(res.tabId, res.log, `fill (${MODE_LABEL[mode] || mode})`, { ...JSON.parse(JSON.stringify(payload)), person: res.person || null });
    if (res.person) refreshPersonBar().catch(() => {});
  } finally {
    showStop(false);
    setBusy(false);
  }
}

// What a detect found, in words (also for a detect restored when the popup reopens).
function describeDetect(res, opts) {
  if (!res.total) {
    if (res.dialog) return { text: DIALOG_EMPTY(res.dialog), type: 'info' };
    if (res.customNotFilled) return { text: ONLY_CUSTOM(res.customNotFilled), type: 'warn' };
    return { text: NO_FIELDS(opts), type: 'info' };
  }
  return { text: detectSummary(res), type: 'success' };
}

async function handleDetect() {
  userRunStarted = true;
  hideResults();
  setBusy(true);
  setStatus('Scanning the page…', 'info');
  try {
    const opts = JSON.parse(JSON.stringify(state.options));
    const res = await runOnPage('detect', { options: opts });
    if (!res) return;
    const d = describeDetect(res, opts);
    setStatus(d.text, d.type);
    if (res.total) showResults(res.tabId, res.log, 'detect', { options: opts });
  } finally {
    setBusy(false);
  }
}

function detectSummary(res) {
  const log = res.log || [];
  const required = log.filter((e) => e.required).length;
  const unknown = log.filter((e) => !e.key).length;
  const custom = res.customNotFilled || 0;
  const extra = [
    required && `${required} required`,
    unknown && `${unknown} other (no known type)`,
    custom && `${custom} custom dropdown${custom === 1 ? '' : 's'} (turn on Custom dropdowns in Settings to fill them)`,
  ].filter(Boolean);
  return `Found ${res.total} field${res.total === 1 ? '' : 's'}${dialogWhere(res.dialog)}${extra.length ? ' · ' + extra.join(' · ') : ''}`;
}

// How many right-click field settings the site in this tab has (a line under the mode cards,
// shown only when there are some).
async function showSiteRules() {
  const line = $('site-rules');
  if (!globalThis.FillCraftRules) { line.hidden = true; return; }
  const tab = await activeTab();
  let origin = '';
  try { origin = tab && tab.url ? new URL(tab.url).origin : ''; } catch (_) { origin = ''; }
  const list = origin ? ((await FillCraftRules.all())[origin] || []) : [];
  line.hidden = !list.length;
  if (!list.length) return;
  const host = (() => { try { return origin === 'null' ? 'local files' : new URL(origin).host; } catch (_) { return 'this site'; } })();
  const n = list.length;
  $('site-rules-text').textContent = `${n} field setting${n === 1 ? '' : 's'} of yours on ${host} · Manage`;
  line.title = `Fields you set by right-clicking them on ${host} (Treat this field as… / Leave this field alone). Click to see or change them.`;
}

// When the popup opens, show the last fill/detect on this tab — e.g. one run by a
// keyboard shortcut, whose only other feedback is the toolbar badge.
async function showLastRun() {
  const tab = await activeTab();
  if (!tab?.id || FillCraftRunner.restrictedReason(tab.url)) return;
  // A fill started earlier (the popup was closed meanwhile) is still running: say so and
  // wait for it — starting anything else now would run at the same time.
  let running = await FillCraftRunner.runningOn(tab.id);
  if (running && !userRunStarted) {
    setBusy(true);
    setStatus(running.action === 'clear' ? 'Still clearing this page…' : 'A fill is still running on this page — its result shows here when it is done…', 'info');
    if (running.action === 'fill') showStop(true);
    const t0 = Date.now();
    while (running && Date.now() - t0 < 5 * 60000) {
      await new Promise((r) => setTimeout(r, 700));
      running = await FillCraftRunner.runningOn(tab.id);
    }
    showStop(false);
    setBusy(false);
    if (userRunStarted) return;
  }
  const last = await FillCraftRunner.lastRun(tab.id);
  if (!last || !last.result || userRunStarted) return;
  const mins = Math.round((Date.now() - last.at) / 60000);
  const ago = mins < 1 ? 'just now' : `${mins} min ago`;
  const run = { options: last.options || null, invalidType: last.invalidType, edgeType: last.edgeType, person: last.person || null };
  if (last.action === 'fill') {
    const d = describeFill(last.result, last.mode, last.options);
    // (Started from the right-click menu: say which.)
    const via = last.target === 'field' ? 'right-click → Fill this field: ' : last.target === 'section' ? 'right-click → Fill this section: ' : '';
    setStatus(`Last run ${ago}: ${via}${d.text}${personNote(last.person)}`, d.type);
  } else {
    const d = describeDetect(last.result, last.options);
    setStatus(`Last scan ${ago}: ${d.text}`, d.type === 'success' ? 'info' : d.type);
  }
  showResults(tab.id, last.result.log, last.action === 'fill' ? `fill (${MODE_LABEL[last.mode] || last.mode}) — last run` : 'detect — last run', last.options ? run : null);
}

document.addEventListener('DOMContentLoaded', () => {
  // In-popup dropdowns (a native <select> list can open outside the popup).
  fillStateList();
  ['invalid-type', 'edge-type', 'patient-insurance', 'patient-state'].forEach((id) => window.FillCraftSelect && FillCraftSelect.enhance($(id)));
  // Wire up the UI first, so the popup still works if storage is unavailable
  // (it then runs with the defaults shown in the HTML).
  document.querySelectorAll('.mode').forEach((btn) => {
    btn.addEventListener('click', () => handleFill(btn.dataset.mode));
  });
  $('btn-detect').addEventListener('click', handleDetect);
  $('btn-stop').addEventListener('click', stopFill);
  $('btn-report').addEventListener('click', copyReport);
  $('btn-inspect').addEventListener('click', copyDropdownDetails);
  $('btn-test-files').addEventListener('click', () => chrome.runtime.openOptionsPage());
  const openFieldSettings = () => chrome.tabs.create({ url: chrome.runtime.getURL('fieldsettings.html') });
  $('btn-field-settings').addEventListener('click', openFieldSettings);
  $('site-rules').addEventListener('click', openFieldSettings);

  // Views
  $('btn-settings').addEventListener('click', () => { openedViewFrom = $('btn-settings'); showView('settings'); });
  $('settings-note').addEventListener('click', () => { openedViewFrom = $('settings-note'); showView('settings'); });
  // Result rows: one tab stop; Up / Down / Home / End move between rows.
  $('result-list').addEventListener('keydown', (e) => {
    const rows = Array.from($('result-list').querySelectorAll('.row'));
    const i = rows.indexOf(document.activeElement);
    if (i < 0) return;
    const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : null;
    if (to == null || !rows[to]) return;
    e.preventDefault();
    rows.forEach((r) => { r.tabIndex = -1; });
    rows[to].tabIndex = 0;
    rows[to].focus();
  });
  $('btn-reset-settings').addEventListener('click', onResetSettings);
  $('btn-help').addEventListener('click', () => showView('help'));
  document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => showView('main')));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('view-main').hidden) { e.preventDefault(); showView('main'); }
  });

  // Settings
  for (const [id, key] of Object.entries(OPTION_INPUTS)) {
    $(id).addEventListener('change', (e) => {
      state.options[key] = e.target.checked;
      saveOptions();
    });
  }
  $('edge-type').addEventListener('change', (e) => { state.edgeType = e.target.value; showEdgeKind(); saveOptions(); });
  // Switching the kind picks that kind's first option (Random mix / At minimum).
  document.querySelectorAll('input[name="edge-kind"]').forEach((r) => {
    r.addEventListener('change', () => {
      if (!r.checked || isLimitEdge(state.edgeType) === (r.value === 'limit')) return;
      state.edgeType = setSelectValue($('edge-type'), r.value === 'limit' ? 'limit-min' : 'random');
      showEdgeKind();
      saveOptions();
    });
  });
  let pwTimer = null;
  const flushPassword = () => { if (pwTimer) { clearTimeout(pwTimer); pwTimer = null; saveOptions(); } };
  $('opt-test-password').addEventListener('input', (e) => {
    state.options.testPassword = e.target.value;
    showPasswordHelp();
    clearTimeout(pwTimer);
    pwTimer = setTimeout(() => { pwTimer = null; saveOptions(); }, 300);
  });
  $('opt-test-password').addEventListener('change', flushPassword);
  $('opt-test-password').addEventListener('blur', flushPassword);
  window.addEventListener('pagehide', flushPassword);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushPassword(); });
  $('invalid-type').addEventListener('change', (e) => { state.invalidType = e.target.value; saveOptions(); });
  document.querySelectorAll('input[name="dropdown-strategy"]').forEach((r) => {
    r.addEventListener('change', () => { if (r.checked) { state.options.dropdownStrategy = r.value; saveOptions(); } });
  });
  // Test patient. (A change of who to make gives the person bar a new patient of that kind.)
  document.querySelectorAll('input[name="patient-age"]').forEach((r) => {
    r.addEventListener('change', () => {
      if (!r.checked) return;
      state.options.patientAge = r.value;
      applyMedicareRule();
      saveOptions();
      refreshPersonBar().catch(() => {});
    });
  });
  $('patient-insurance').addEventListener('change', (e) => { state.options.patientInsurance = e.target.value; applyMedicareRule(); saveOptions(); refreshPersonBar().catch(() => {}); });
  $('patient-state').addEventListener('change', (e) => { state.options.patientState = e.target.value; saveOptions(); refreshPersonBar().catch(() => {}); });
  // (The switch itself is saved by the loop above; turning it off forgets the kept patient.)
  $('opt-same-person').addEventListener('change', (e) => {
    if (e.target.checked) refreshPersonBar().catch(() => {});
    else { FillCraftRunner.forgetPerson().catch(() => {}); refreshPersonBar().catch(() => {}); }
  });
  $('btn-new-person').addEventListener('click', () => refreshPersonBar(true).catch(() => {}));

  // Result filters
  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => { view.filter = chip.dataset.filter; renderResults(); });
  });

  $('link-shortcuts').addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  $('app-version').textContent = `v${chrome.runtime.getManifest().version}`;
  showEdgeKind();
  reflectSettings();
  loadOptions().then(() => refreshPersonBar()).catch((err) => console.warn('[FillCraft] Could not load saved options:', err));
  loadShortcuts();
  showLastRun().catch(() => {});
  showSiteRules().catch(() => {});
});
