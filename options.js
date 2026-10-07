// "Test files" page: shows the sample file used for each upload type and lets the user
// replace it with their own test file (kept in chrome.storage.local → customSamples).
const SLOTS = FillCraftRunner.SAMPLE_SLOTS;
const MAX_BYTES = 2 * 1024 * 1024;
const $ = (id) => document.getElementById(id);

const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const shortName = (s) => (s.length > 48 ? s.slice(0, 30) + '…' + s.slice(-14) : s);

// The saved files, or null when they cannot be read right now (never taken for "none":
// saving on top of an unread list would erase the user's files).
async function getCustom() {
  try { return (await chrome.storage.local.get('customSamples')).customSamples || {}; } catch (_) { return null; }
}

// Saves run one after another, each on the latest list (two quick replacements both stay).
let saveQueue = Promise.resolve();
function queueSave(change) {
  const run = saveQueue.then(async () => {
    const map = await getCustom();
    if (!map) throw new Error('Your saved test files could not be read just now, so nothing was changed. Try again.');
    change(map);
    await chrome.storage.local.set({ customSamples: map });
  });
  saveQueue = run.catch(() => {});
  return run;
}

// What a file really is, from its content (a renamed .exe is not a .jpg).
async function sniffType(file) {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = (from, len) => String.fromCharCode(...b.slice(from, from + len));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && ascii(1, 3) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  // A PDF may start with a byte-order mark or a blank line before "%PDF-", and must end
  // with "%%EOF" (a text file that merely starts with "%PDF-" is not one).
  const head = new TextDecoder('latin1').decode(await file.slice(0, 1024).arrayBuffer());
  if (head.includes('%PDF-')) {
    const tail = new TextDecoder('latin1').decode(await file.slice(Math.max(0, file.size - 2048)).arrayBuffer());
    return tail.includes('%%EOF') ? 'application/pdf' : 'broken-pdf';
  }
  return null;
}
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
// The file name, ending in the extension of what the file really is (uploads that list
// accepted extensions check it).
function nameFor(file, type) {
  const ext = EXT[type];
  const base = file.name.replace(/\.[^.]+$/, '') || 'test-file';
  const current = (file.name.match(/\.([^.]+)$/) || [])[1];
  const fits = current && (current.toLowerCase() === ext || (ext === 'jpg' && current.toLowerCase() === 'jpeg'));
  return fits ? file.name : `${base}.${ext}`;
}

// Checks a chosen file. Returns { ok, type, note } or { ok: false, error }.
async function checkFile(file, slotDef) {
  const name = `"${shortName(file.name)}"`;
  if (!file.size) return { ok: false, error: `${name} is empty.` };
  if (file.size > MAX_BYTES) return { ok: false, error: `${name} is over 2 MB (${kb(file.size)}). Use a smaller file.` };
  let type;
  try { type = await sniffType(file); } catch (_) { return { ok: false, error: `${name} could not be read.` }; }
  if (type === 'broken-pdf') return { ok: false, error: `${name} is not a complete PDF — the file may be damaged.` };
  if (!type) {
    const ext = (file.name.match(/\.[^.]+$/) || [''])[0] || 'unknown type';
    return { ok: false, error: `${name} (${ext}) is not a JPG, PNG, WEBP or PDF file.` };
  }
  if (type.startsWith('image/')) {
    try { const bmp = await createImageBitmap(file); bmp.close && bmp.close(); } catch (_) {
      return { ok: false, error: `${name} could not be opened as an image — the file may be damaged.` };
    }
  }
  const wantsPdf = slotDef.file.endsWith('.pdf');
  const note = wantsPdf && type !== 'application/pdf' ? 'Uploads that accept only PDF will still get the built-in PDF.'
    : !wantsPdf && type === 'application/pdf' ? 'Uploads that accept only images will still get the built-in image.' : '';
  return { ok: true, type, note };
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function thumb(type, src, label) {
  if (type.startsWith('image/')) {
    const img = document.createElement('img');
    img.className = 'thumb';
    img.src = src;
    img.alt = `${label} preview`;
    return img;
  }
  const d = document.createElement('div');
  d.className = 'thumb pdf';
  d.setAttribute('role', 'img');
  d.setAttribute('aria-label', `${label} preview (PDF)`);
  const badge = document.createElement('span');
  badge.textContent = 'PDF';
  d.append(badge);
  return d;
}

// Upload types shown together: the front and back of one card side by side. A slot added to
// SAMPLE_SLOTS later that is not listed here is shown under "Other".
const GROUPS = [
  { title: 'Insurance card', slots: ['insuranceFront', 'insuranceBack'] },
  { title: 'Medicare card', slots: ['medicare', 'medicareBack'] },
  { title: 'Medicaid card', slots: ['medicaid', 'medicaidBack'] },
  { title: 'Photo ID', slots: ['photoId', 'photoIdBack'] },
  { title: 'Photos', slots: ['avatar', 'clinicalImage'] },
  { title: 'Documents & signature', slots: ['record', 'consent', 'documentImage', 'signature'] },
];
function slotGroups() {
  const listed = new Set(GROUPS.flatMap((g) => g.slots));
  const out = GROUPS.map((g) => ({ title: g.title, slots: g.slots.filter((s) => SLOTS[s]) })).filter((g) => g.slots.length);
  const rest = Object.keys(SLOTS).filter((s) => !listed.has(s));
  if (rest.length) out.push({ title: 'Other', slots: rest });
  return out;
}

// The latest message (one row at a time) and where keyboard focus goes back to after the
// list is redrawn.
let rowMessage = null; // { slot, kind, text }
let focusAfter = null; // { slot, action: 'replace' | 'reset' }
const say = (slot, kind, text) => { rowMessage = { slot, kind, text }; };

async function replaceSlot(slot, def, file) {
  focusAfter = { slot, action: 'replace' };
  const res = await checkFile(file, def);
  if (!res.ok) { say(slot, 'bad', res.error); render(); return; }
  try {
    const data = await readAsBase64(file);
    const name = nameFor(file, res.type);
    await queueSave((map) => { map[slot] = { name, type: res.type, size: file.size, data }; });
    say(slot, 'ok', `Now using "${shortName(name)}".${res.note ? ' ' + res.note : ''}`);
  } catch (err) {
    const msg = String(err && err.message || err);
    say(slot, 'bad', /quota/i.test(msg) ? 'Not enough storage space in this browser for this file.' : `Could not save the file: ${msg}`);
  }
  render();
}

async function useBuiltIn(slot) {
  focusAfter = { slot, action: 'replace' };
  try {
    await queueSave((map) => { delete map[slot]; });
    say(slot, 'ok', 'Back to the built-in sample.');
  } catch (err) {
    say(slot, 'bad', `Could not reset: ${err && err.message || err}`);
  }
  render();
}

// One upload type as a card: its preview, the file in use, what it is used for, its message
// and its buttons. c: the person's own file for this slot, if any.
function slotCard(slot, c, unreadable) {
  const def = SLOTS[slot];
  const li = document.createElement('li');
  li.className = c ? 'slot custom' : 'slot';

  const type = c ? c.type : def.file.endsWith('.pdf') ? 'application/pdf' : def.file.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const src = c ? `data:${c.type};base64,${c.data}` : `samples/${def.file}`;
  const preview = document.createElement('div');
  preview.className = 'preview';
  const hint = document.createElement('span');
  hint.className = 'drop-hint';
  hint.setAttribute('aria-hidden', 'true');
  hint.textContent = 'Drop to replace';
  preview.append(thumb(type, src, def.label), hint);
  li.append(preview);

  const meta = document.createElement('div');
  meta.className = 'meta';
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = def.label;
  const file = document.createElement('div');
  file.className = 'file';
  const tag = document.createElement('span');
  tag.className = c ? 'tag custom' : 'tag';
  tag.textContent = c ? 'Your file' : unreadable ? 'Unknown' : 'Built-in';
  const fname = document.createElement('span');
  fname.className = 'fname';
  fname.textContent = c ? `${shortName(c.name)} · ${kb(c.size || 0)}` : def.file;
  fname.title = c ? c.name : def.file;
  file.append(tag, fname);
  const used = document.createElement('div');
  used.className = 'used';
  used.textContent = `Used for: ${def.usedFor}`;
  meta.append(name, file, used);
  // The card's message area always exists, so a new message is announced when it changes.
  const msg = document.createElement('div');
  const m = rowMessage && rowMessage.slot === slot ? rowMessage : null;
  msg.className = `msg ${m ? m.kind : ''}`;
  msg.setAttribute('role', m && m.kind === 'bad' ? 'alert' : 'status');
  msg.setAttribute('aria-live', 'polite');
  msg.hidden = !m;
  meta.append(msg);
  li.append(meta);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf';
  input.hidden = true;
  input.addEventListener('change', () => { const f = input.files && input.files[0]; if (f) replaceSlot(slot, def, f); });
  const replace = document.createElement('button');
  replace.type = 'button';
  replace.className = 'primary';
  replace.textContent = 'Replace…';
  replace.dataset.slot = slot;
  replace.dataset.action = 'replace';
  replace.disabled = unreadable;
  replace.setAttribute('aria-label', `Replace ${def.label}`);
  replace.addEventListener('click', () => input.click());
  actions.append(input, replace);
  if (c) {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'Use built-in';
    reset.dataset.slot = slot;
    reset.dataset.action = 'reset';
    reset.setAttribute('aria-label', `Use the built-in file for ${def.label}`);
    reset.addEventListener('click', () => useBuiltIn(slot));
    actions.append(reset);
  }
  meta.append(actions);

  // Dropping a file on a card replaces that slot too.
  li.addEventListener('dragover', (e) => { e.preventDefault(); if (!unreadable) li.classList.add('over'); });
  // (Moving over the card's own parts is not leaving it.)
  li.addEventListener('dragleave', (e) => { if (!li.contains(e.relatedTarget)) li.classList.remove('over'); });
  li.addEventListener('drop', (e) => {
    e.preventDefault(); li.classList.remove('over');
    if (unreadable) return;
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    if (files.length > 1) { focusAfter = { slot, action: 'replace' }; say(slot, 'bad', 'Drop one file at a time.'); render(); return; }
    replaceSlot(slot, def, files[0]);
  });
  // (Set after the caller inserts the card: screen readers announce it.)
  if (m) requestAnimationFrame(() => { msg.textContent = m.text; });
  return li;
}

async function render() {
  const custom = await getCustom();
  const unreadable = custom === null;
  const banner = $('read-error');
  if (banner) banner.hidden = !unreadable;
  const root = $('slots');
  root.replaceChildren();
  let replaced = 0;
  for (const group of slotGroups()) {
    const section = document.createElement('section');
    section.className = 'group';
    const heading = document.createElement('h2');
    heading.textContent = group.title;
    const list = document.createElement('ul');
    list.className = 'slots';
    list.setAttribute('aria-label', group.title);
    for (const slot of group.slots) {
      const c = unreadable ? null : custom[slot];
      if (c) replaced++;
      list.append(slotCard(slot, c, unreadable));
    }
    section.append(heading, list);
    root.append(section);
  }
  // How many upload types use the person's own file.
  const summary = $('summary');
  if (summary) {
    const total = Object.keys(SLOTS).length;
    summary.textContent = unreadable ? '' : replaced ? `${replaced} of ${total} replaced with your files` : `All ${total} built-in`;
    summary.classList.toggle('has-custom', replaced > 0);
  }
  // Keyboard focus back where the person was (the list was redrawn).
  if (focusAfter) {
    const b = root.querySelector(`button[data-slot="${focusAfter.slot}"][data-action="${focusAfter.action}"]`) ||
      root.querySelector(`button[data-slot="${focusAfter.slot}"]`);
    if (b) b.focus();
    focusAfter = null;
  }
}

// A file dropped outside the rows does nothing (instead of the browser opening it).
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

render();
