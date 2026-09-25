// One DevTools Protocol session per tab, shared by notify.js and viewport.js.
// Throws when it cannot attach (for example if another debugger holds the tab).
function attach(contents) {
  const dbg = contents.debugger;
  if (!dbg.isAttached()) dbg.attach('1.3');
  return dbg;
}

module.exports = { attach };
