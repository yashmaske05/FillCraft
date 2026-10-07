// FillCraft's own dropdown for the popup. A native <select> opens an operating-system
// list that Chrome lets spill outside the extension popup; this one always opens inside
// it — below the button, or above when there is no room — and scrolls within itself.
//
// The original <select> stays in the page (hidden) and remains the source of truth:
// picking an option sets select.value and fires "change", so existing code keeps
// working. Call select._fcRefresh() after changing select.value from code.
//
// Keyboard (combobox pattern): ↓ ↑ Home End PageUp PageDown move, Enter / Space pick,
// Esc closes, Tab closes, typing jumps to the first option starting with the letters.
//
// An <option hidden> is left out of the list (call select._fcRefresh() after changing it);
// <select data-hide-groups> shows its options without the group headings.
(() => {
  let uid = 0;
  let openApi = null; // the dropdown that is open (only one at a time)

  function enhance(sel) {
    if (!sel || sel._fcRefresh) return;
    const id = sel.id || `fcsel-${++uid}`;
    const wrap = document.createElement('div');
    wrap.className = 'fc-select';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fc-select-btn';
    btn.id = `${id}-btn`;
    btn.setAttribute('role', 'combobox');
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', `${id}-list`);
    const labelId = sel.getAttribute('aria-labelledby');
    if (labelId) btn.setAttribute('aria-labelledby', `${labelId} ${btn.id}`);
    // (Its help text too — screen readers read it after the name.)
    const helpId = sel.getAttribute('aria-describedby');
    if (helpId) btn.setAttribute('aria-describedby', helpId);
    const text = document.createElement('span');
    text.className = 'fc-select-text';
    btn.append(text);

    const list = document.createElement('ul');
    list.className = 'fc-select-list';
    list.id = `${id}-list`;
    list.setAttribute('role', 'listbox');
    list.tabIndex = -1;
    if (labelId) list.setAttribute('aria-labelledby', labelId);
    list.hidden = true;

    // Options (and group headings) from the select.
    const items = []; // { li, option }
    const hideGroups = sel.hasAttribute('data-hide-groups');
    for (const node of sel.children) {
      if (node.tagName === 'OPTGROUP' && hideGroups) {
        for (const o of node.children) addOption(o, node.label);
      } else if (node.tagName === 'OPTGROUP') {
        const head = document.createElement('li');
        head.className = 'fc-select-group';
        head.setAttribute('role', 'presentation');
        head.textContent = node.label;
        list.append(head);
        for (const o of node.children) addOption(o, node.label);
      } else if (node.tagName === 'OPTION') addOption(node);
    }
    function addOption(o, group) {
      const li = document.createElement('li');
      li.className = 'fc-select-option';
      li.id = `${id}-opt-${items.length}`;
      li.setAttribute('role', 'option');
      li.textContent = o.textContent;
      // Its name for screen readers: the option and its group ("At minimum, Each field's own
      // limits") — without the check mark drawn by CSS.
      li.setAttribute('aria-label', group ? `${o.textContent}, ${group}` : o.textContent);
      if (o.disabled) li.setAttribute('aria-disabled', 'true');
      li.addEventListener('pointermove', () => setActive(items.findIndex((it) => it.li === li)));
      li.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus on the button
      li.addEventListener('click', () => { if (!o.disabled) { pick(o.value); close(); } });
      list.append(li);
      items.push({ li, option: o });
    }

    // Pressing anywhere in the list (its scrollbar, a group heading) keeps focus on the
    // button, so the list stays open.
    list.addEventListener('mousedown', (e) => e.preventDefault());

    sel.hidden = true;
    sel.tabIndex = -1;
    sel.parentNode.insertBefore(wrap, sel);
    wrap.append(btn, sel);
    document.body.append(list); // positioned against the popup window, never clipped

    let active = -1;
    let typed = '';
    let typedAt = 0;

    const selectedIndex = () => items.findIndex((it) => it.option.value === sel.value);
    const enabled = (i) => i >= 0 && i < items.length && !items[i].option.disabled && !items[i].option.hidden;

    function refresh() {
      const i = selectedIndex();
      text.textContent = i >= 0 ? items[i].option.textContent : '';
      items.forEach((it, j) => {
        it.li.setAttribute('aria-selected', String(j === i));
        it.li.hidden = !!it.option.hidden;
        // (An option switched off or on since — e.g. Medicare only for seniors.)
        if (it.option.disabled) it.li.setAttribute('aria-disabled', 'true'); else it.li.removeAttribute('aria-disabled');
      });
    }

    function setActive(i) {
      if (!enabled(i)) return;
      if (active >= 0 && items[active]) items[active].li.classList.remove('active');
      active = i;
      items[i].li.classList.add('active');
      btn.setAttribute('aria-activedescendant', items[i].li.id);
      items[i].li.scrollIntoView({ block: 'nearest' });
    }

    function move(from, step) {
      for (let i = from + step; i >= 0 && i < items.length; i += step) if (enabled(i)) return i;
      return from;
    }

    function place() {
      const r = btn.getBoundingClientRect();
      const gap = 4, margin = 8;
      list.style.width = `${r.width}px`;
      list.style.left = `${Math.max(margin, Math.min(r.left, innerWidth - r.width - margin))}px`;
      list.style.maxHeight = 'none';
      const natural = Math.min(list.scrollHeight, 280);
      const below = innerHeight - r.bottom - gap - margin;
      const above = r.top - gap - margin;
      const down = below >= natural || below >= above;
      const h = Math.max(80, Math.min(natural, down ? below : above));
      list.style.maxHeight = `${h}px`;
      list.style.top = down ? `${r.bottom + gap}px` : `${r.top - gap - Math.min(h, list.scrollHeight)}px`;
      list.classList.toggle('up', !down);
    }

    function open(at) {
      if (openApi && openApi !== api) openApi.close();
      openApi = api;
      list.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      wrap.classList.add('open');
      place();
      setActive(enabled(at) ? at : enabled(selectedIndex()) ? selectedIndex() : move(-1, 1));
    }

    function close() {
      if (list.hidden) return;
      list.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      btn.removeAttribute('aria-activedescendant');
      wrap.classList.remove('open');
      if (openApi === api) openApi = null;
    }

    function pick(value) {
      if (sel.value === value) { refresh(); return; }
      sel.value = value;
      refresh();
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function typeAhead(ch) {
      const now = Date.now();
      typed = now - typedAt > 700 ? ch : typed + ch;
      typedAt = now;
      const start = list.hidden ? selectedIndex() : active;
      const order = items.map((_, i) => (start + 1 + i) % items.length);
      // A repeated single letter cycles through matches; otherwise match the whole prefix.
      const needle = typed.split('').every((c) => c === typed[0]) ? typed[0] : typed;
      const hit = order.find((i) => enabled(i) && items[i].option.textContent.toLowerCase().startsWith(needle.toLowerCase()));
      if (hit === undefined) return;
      if (list.hidden) open(hit); else setActive(hit);
    }

    btn.addEventListener('click', () => (list.hidden ? open() : close()));
    btn.addEventListener('keydown', (e) => {
      const isOpen = !list.hidden;
      const k = e.key;
      if (!isOpen) {
        if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') { e.preventDefault(); open(); return; }
        if (k === 'Home') { e.preventDefault(); open(move(-1, 1)); return; }
        if (k === 'End') { e.preventDefault(); open(move(items.length, -1)); return; }
      } else {
        if (k === 'ArrowDown') { e.preventDefault(); setActive(move(active, 1)); return; }
        if (k === 'ArrowUp') { e.preventDefault(); if (e.altKey) { pick(items[active].option.value); close(); } else setActive(move(active, -1)); return; }
        if (k === 'Home') { e.preventDefault(); setActive(move(-1, 1)); return; }
        if (k === 'End') { e.preventDefault(); setActive(move(items.length, -1)); return; }
        if (k === 'PageDown') { e.preventDefault(); let i = active; for (let n = 0; n < 5; n++) i = move(i, 1); setActive(i); return; }
        if (k === 'PageUp') { e.preventDefault(); let i = active; for (let n = 0; n < 5; n++) i = move(i, -1); setActive(i); return; }
        if (k === 'Enter' || k === ' ') { e.preventDefault(); if (enabled(active)) pick(items[active].option.value); close(); return; }
        // Esc closes the list only — it must not also leave the Settings view.
        if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
        if (k === 'Tab') { close(); return; }
      }
      if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && k !== ' ') { e.preventDefault(); typeAhead(k); }
    });
    btn.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== btn) close(); }, 0));
    sel.addEventListener('change', refresh);

    const api = { close, place };
    sel._fcRefresh = refresh;
    refresh();
  }

  // Outside clicks, scrolling and resizing close / follow the open list.
  document.addEventListener('pointerdown', (e) => {
    if (!openApi) return;
    const t = e.target;
    if (t.closest && (t.closest('.fc-select-list') || t.closest('.fc-select.open'))) return;
    openApi.close();
  }, true);
  addEventListener('scroll', (e) => { if (openApi && !(e.target.closest && e.target.closest('.fc-select-list'))) openApi.place(); }, true);
  addEventListener('resize', () => { if (openApi) openApi.place(); });
  addEventListener('blur', () => { if (openApi) openApi.close(); });

  window.FillCraftSelect = { enhance, closeAll: () => { if (openApi) openApi.close(); } };
})();
