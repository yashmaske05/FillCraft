// FillCraft — the page-world half of "never submit".
// A page that reacts to a change by calling form.submit() fires no "submit" event, so the
// content script (which runs in its own isolated world) cannot see or stop it. This file
// runs in the page's world: while FillCraft is working — <html> carries the attribute
// data-fillcraft-busy, set and removed by the content script — form.submit() does nothing
// and the content script is told, so the popup can say a submit was stopped. At any other
// time form.submit() works exactly as before.
(() => {
  const FLAG = Symbol.for('fillcraft.submitGuard');
  if (HTMLFormElement.prototype[FLAG]) return; // already in place in this frame
  const original = HTMLFormElement.prototype.submit;
  const busy = () => { try { return document.documentElement.hasAttribute('data-fillcraft-busy'); } catch (_) { return false; } };
  const guarded = {
    submit() {
      if (busy()) {
        document.dispatchEvent(new CustomEvent('fillcraft-stopped', { detail: 'a form submit (form.submit())' }));
        return undefined;
      }
      return original.apply(this, arguments);
    },
  }.submit;
  Object.defineProperty(HTMLFormElement.prototype, 'submit', { value: guarded, writable: true, configurable: true, enumerable: true });
  Object.defineProperty(HTMLFormElement.prototype, FLAG, { value: true });
})();
