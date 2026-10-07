// FillCraft — the Field settings page: every "Treat this field as…" / "Leave this field alone"
// setting, by site. Change the type, remove, filter, export / import (never values).
// (Labels come from web pages: they are always put in as text, never as HTML.)
(() => {
  const $ = (id) => document.getElementById(id);
  const R = globalThis.FillCraftRules;
  const el = (tag, props = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.className = v;
      else if (k.startsWith('aria') || k === 'title' || k === 'type' || k === 'scope') n.setAttribute(k.replace(/^aria([A-Z])/, (m, c) => 'aria-' + c.toLowerCase()), v);
      else n[k] = v;
    }
    for (const c of kids) if (c) n.append(c);
    return n;
  };
  const say = (text, ok = true) => { const m = $('msg'); m.textContent = text; m.className = 'msg ' + (ok ? 'ok' : 'bad'); };
  const host = (origin) => { try { return origin === 'null' ? 'Local files' : new URL(origin).host; } catch (_) { return origin; } };
  const day = (t) => { try { return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch (_) { return ''; } };

  // The type list, grouped like the menu (+ "Left alone").
  function typeSelect(rule, origin, label) {
    const sel = el('select', { class: 'type-select' + (rule.type === 'leave' ? ' leave' : ''), ariaLabel: `FillCraft fills ${label} as` });
    sel.append(el('option', { value: 'leave', text: R.LABELS.leave }));
    for (const [group, items] of R.GROUPS) {
      const og = el('optgroup', { label: group });
      for (const [k, t] of items) og.append(el('option', { value: k, text: t }));
      sel.append(og);
    }
    sel.value = rule.type;
    sel.addEventListener('change', async () => {
      await R.setType(origin, rule.id, sel.value);
      say(`“${label}” on ${host(origin)} is now filled as ${R.LABELS[sel.value]}.`);
    });
    return sel;
  }

  // What the setting recognises the field by.
  function chips(sig) {
    const out = [];
    if (sig.label) out.push(`label “${sig.label}”`);
    if (sig.name) out.push(`name=${sig.name}`);
    if (sig.id) out.push(`id=${sig.id}`);
    if (sig.testid) out.push(`data-testid=${sig.testid}`);
    if (!out.length && sig.placeholder) out.push(`placeholder “${sig.placeholder}”`);
    out.push(sig.kind === 'dropdown' ? 'a dropdown' : sig.tag === 'select' ? 'a list' : sig.tag === 'textarea' ? 'a text area' : 'a text box');
    return el('span', { class: 'chips' }, out.map((t) => el('code', { class: 'chip', title: t, text: t })));
  }

  async function render() {
    const rules = await R.all();
    const q = $('filter').value.trim().toLowerCase();
    const sites = $('sites');
    sites.replaceChildren();
    let shownSites = 0, total = 0;
    const origins = Object.keys(rules).sort((a, b) => host(a).localeCompare(host(b)));
    for (const origin of origins) {
      const list = (rules[origin] || []).filter((r) => r && r.sig);
      total += list.length;
      const rows = list.filter((r) => !q || host(origin).toLowerCase().includes(q) || String(r.label || '').toLowerCase().includes(q) || String(r.sig.label || '').includes(q));
      if (!rows.length) continue;
      shownSites++;
      const headId = `site-${shownSites}`;
      const removeAll = el('button', { type: 'button', text: 'Remove all for this site' });
      removeAll.addEventListener('click', async () => {
        if (removeAll.dataset.armed !== '1') { removeAll.dataset.armed = '1'; removeAll.textContent = `Click again to remove ${list.length} setting${list.length === 1 ? '' : 's'}`; setTimeout(() => { removeAll.dataset.armed = ''; removeAll.textContent = 'Remove all for this site'; }, 4000); return; }
        await R.removeSite(origin);
        say(`Removed every field setting for ${host(origin)}.`);
      });
      const tbody = el('tbody');
      for (const r of rows.sort((a, b) => (b.at || 0) - (a.at || 0))) {
        const label = r.label || r.sig.label || r.sig.name || 'this field';
        const remove = el('button', { type: 'button', text: 'Remove', ariaLabel: `Remove the setting for ${label}` });
        remove.addEventListener('click', async () => { await R.removeById(origin, r.id); say(`Removed the setting for “${label}” on ${host(origin)}.`); });
        tbody.append(el('tr', {}, [
          el('td', {}, [el('span', { class: 'field-name', text: label }), el('span', { class: 'field-where', text: r.imported ? 'imported' : r.setOn ? `first set on ${r.setOn}` : '' })]),
          el('td', {}, [chips(r.sig)]),
          el('td', {}, [typeSelect(r, origin, label)]),
          el('td', { class: 'when', text: day(r.at) }),
          el('td', { class: 'act' }, [remove]),
        ]));
      }
      const head = el('tr', {}, ['Field', 'Recognised by', 'FillCraft fills it as', 'Set on'].map((t) => el('th', { scope: 'col', text: t })).concat([el('th', { scope: 'col' }, [el('span', { class: 'sr-only', text: 'Actions' })])]));
      sites.append(el('section', { class: 'site', ariaLabelledby: headId }, [
        el('div', { class: 'site-head' }, [el('h2', { id: headId, text: host(origin) }), el('span', { class: 'site-count', text: `${list.length} setting${list.length === 1 ? '' : 's'}` }), el('span', { class: 'spacer' }), removeAll]),
        el('div', { class: 'table-box' }, [el('table', {}, [el('thead', {}, [head]), tbody])]),
      ]));
    }
    const siteCount = origins.filter((o) => (rules[o] || []).length).length;
    $('summary').textContent = total ? `${total} setting${total === 1 ? '' : 's'} · ${siteCount} site${siteCount === 1 ? '' : 's'}` : '';
    $('empty').hidden = total > 0;
    $('hint').hidden = total === 0;
    if (total && !shownSites) sites.append(el('p', { class: 'empty', text: 'No setting matches the filter.' }));
    $('btn-export').disabled = total === 0;
  }

  $('filter').addEventListener('input', () => render());
  $('btn-export').addEventListener('click', async () => {
    const data = await R.exportRules();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'fillcraft-field-settings.json' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    say('Exported to fillcraft-field-settings.json (site addresses and field labels — no values).');
  });
  $('btn-import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const r = await R.importRules(JSON.parse(await f.text()));
      say(`Imported ${r.added + r.replaced} setting${r.added + r.replaced === 1 ? '' : 's'} from ${f.name}${r.replaced ? ` · ${r.replaced} replaced an older one` : ''}${r.skipped ? ` · ${r.skipped} not usable, skipped` : ''}.`);
    } catch (err) {
      say(`Could not import ${f.name}: ${err && err.message ? err.message : 'not a FillCraft field settings file'}.`, false);
    }
  });
  // Changes made elsewhere (the right-click menu, another window) show at once.
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.fieldRules) render(); });
  render();
})();
