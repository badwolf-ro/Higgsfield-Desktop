// Keyboard shortcuts. App-level shortcuts are matched in before-input-event on
// each tab's webContents (not through menu accelerators, so the menu can show
// them without Electron also handling them). The one global action is
// registered system-wide with globalShortcut.
const { globalShortcut } = require('electron');
const keys = require('../shared/keys');
const { ACTIONS, byId } = require('../shared/actions');

let settings;
let dispatch = () => {};
let shouldHandle = () => true;
let onSettingsChange = null;
let suspended = false;

// Canonical accelerator -> actionId, for non-global actions only.
const appMap = new Map();

function rebuildAppMap() {
  appMap.clear();
  const binds = settings.get().hotkeys;
  for (const action of ACTIONS) {
    if (action.global) continue;
    const accel = binds[action.id];
    if (accel) appMap.set(accel, action.id);
  }
}

// Reads the bindings back from settings each time, so register and unregister
// always act on the same accelerators.
function registerGlobals() {
  if (suspended) return;
  const binds = settings.get().hotkeys;
  for (const action of ACTIONS) {
    if (!action.global) continue;
    const accel = binds[action.id];
    if (accel && !keys.validate(accel, { global: true })) {
      globalShortcut.register(accel, () => dispatch(action.id));
    }
  }
}

function unregisterGlobals() {
  const binds = settings.get().hotkeys;
  for (const action of ACTIONS) {
    if (!action.global) continue;
    const accel = binds[action.id];
    if (accel) globalShortcut.unregister(accel);
  }
}

function handleInput(wc, event, input) {
  if (input.type !== 'keyDown' || input.isAutoRepeat) return;
  const accel = keys.fromInput(input);
  if (!accel) return;
  const id = appMap.get(accel);
  if (!id) return;
  if (!shouldHandle(wc)) return;
  event.preventDefault();
  dispatch(id);
}

function labelFor(action) {
  return action.id.startsWith('open:') ? `Open ${action.label} in new tab` : action.label;
}

function init(opts) {
  settings = opts.settings;
  if (typeof opts.dispatch === 'function') dispatch = opts.dispatch;
  if (typeof opts.shouldHandle === 'function') shouldHandle = opts.shouldHandle;

  rebuildAppMap();
  registerGlobals();

  // Any binding change (including our own) rebuilds the app-level lookup.
  onSettingsChange = () => rebuildAppMap();
  settings.on('change', onSettingsChange);
}

function attach(webContents) {
  webContents.on('before-input-event', (event, input) => handleInput(webContents, event, input));
}

function setHotkey(actionId, accel) {
  const action = byId[actionId];
  if (!action) return { ok: false, error: 'Unknown action.' };

  if (accel === '') {
    if (action.global) unregisterGlobals();
    return { ok: true, settings: settings.update({ hotkeys: { [actionId]: '' } }) };
  }

  const normalized = keys.normalize(accel);
  const invalid = keys.validate(normalized, { global: !!action.global });
  if (invalid) return { ok: false, error: invalid };

  const binds = settings.get().hotkeys;
  for (const [otherId, otherAccel] of Object.entries(binds)) {
    if (otherId !== actionId && otherAccel && otherAccel === normalized) {
      return { ok: false, error: `Already used by "${labelFor(byId[otherId])}".` };
    }
  }

  if (action.global) {
    const old = binds[actionId];
    if (old) globalShortcut.unregister(old);
    const ok = suspended ? true : globalShortcut.register(normalized, () => dispatch(actionId));
    if (!ok) {
      if (old && !suspended) globalShortcut.register(old, () => dispatch(actionId));
      return { ok: false, error: 'Another app is already using this shortcut.' };
    }
  }

  return { ok: true, settings: settings.update({ hotkeys: { [actionId]: normalized } }) };
}

function resetHotkeys() {
  unregisterGlobals();
  const result = settings.update({ hotkeys: settings.defaults().hotkeys });
  registerGlobals();
  return result;
}

function suspendGlobal(bool) {
  if (bool === suspended) return;
  suspended = !!bool;
  if (suspended) unregisterGlobals();
  else registerGlobals();
}

function menuAccelerator(actionId) {
  if (!byId[actionId]) return undefined;
  return settings.get().hotkeys[actionId] || undefined;
}

function dispose() {
  unregisterGlobals();
  if (onSettingsChange && settings) settings.removeListener('change', onSettingsChange);
  onSettingsChange = null;
}

module.exports = { init, attach, setHotkey, resetHotkeys, suspendGlobal, menuAccelerator, dispose };
