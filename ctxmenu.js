// FillCraft — remembers which element was right-clicked last, for FillCraft's entries in
// Chrome's right-click menu (Chrome tells the extension a right-click happened, not on what).
// Nothing else: it fills nothing, sends nothing and changes nothing on the page.
(() => {
  if (window.__fcCtxListening) return;
  window.__fcCtxListening = true;
  addEventListener('contextmenu', (e) => {
    // (Inside a shadow DOM component: the element really clicked, not the component's host.)
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    const t = path.find((n) => n && n.nodeType === 1) || e.target;
    window.__fcCtxTarget = t && t.nodeType === 1 ? t : null;
  }, { capture: true, passive: true });
})();
