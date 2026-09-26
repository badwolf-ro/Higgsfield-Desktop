// Keyboard shortcuts. App-level shortcuts are matched in before-input-event on
// the tab UI and each tab's webContents (not through menu accelerators, so the
// menu can show them without Electron also handling them). The one global
// action is registered system-wide with globalShortcut.
const { globalShortcut } = require('electron');
const keys = require('../shared/keys');
const { ACTIONS, byId } = require('../shared/actions');

let settings;
let dispatch;
let suspended = false; // global shortcuts are off while the Settings page records one

// Canonical accelerator -> actionId, for non-global actions only.
const appMap = new Map();

// Rebuilds both kinds of shortcut from the settings.
function apply() {
  const binds = settings.get().hotkeys;
  appMap.clear();
  globalShortcut.unregisterAll();
  for (const action of ACTIONS) {
    const accel = binds[action.id];
    if (!accel) continue;
    if (!action.global) appMap.set(accel, action.id);
    else if (!suspended && !keys.validate(accel, { global: true })) {
      globalShortcut.register(accel, () => dispatch(action.id));
    }
  }
}

function handleInput(event, input) {
  if (input.type !== 'keyDown' || input.isAutoRepeat) return;
  const id = appMap.get(keys.fromInput(input));
  if (!id) return;
  event.preventDefault();
  dispatch(id);
}

function init(opts) {
  settings = opts.settings;
  dispatch = opts.dispatch;
  apply();
  settings.on('change', (_snapshot, patch) => { if (patch.hotkeys) apply(); });
}

function attach(webContents) {
  webContents.on('before-input-event', handleInput);
}

function setHotkey(actionId, accel) {
  const action = byId[actionId];
  if (!action) return { ok: false, error: 'Unknown action.' };

  if (accel === '') return { ok: true, settings: settings.update({ hotkeys: { [actionId]: '' } }) };

  const normalized = keys.normalize(accel);
  const invalid = keys.validate(normalized, { global: !!action.global });
  if (invalid) return { ok: false, error: invalid };

  const binds = settings.get().hotkeys;
  for (const [otherId, otherAccel] of Object.entries(binds)) {
    if (otherId !== actionId && otherAccel === normalized) {
      return { ok: false, error: `Already used by "${byId[otherId].title}".` };
    }
  }

  // Registering is the only way to find out whether another app holds the shortcut.
  if (action.global && normalized !== binds[actionId]) {
    if (!globalShortcut.register(normalized, () => {})) {
      return { ok: false, error: 'Another app is already using this shortcut.' };
    }
    globalShortcut.unregister(normalized);
  }

  return { ok: true, settings: settings.update({ hotkeys: { [actionId]: normalized } }) };
}

function resetHotkeys() {
  return settings.update({ hotkeys: settings.defaults().hotkeys });
}

function suspendGlobal(on) {
  if (suspended === !!on) return;
  suspended = !!on;
  apply();
}

function dispose() {
  globalShortcut.unregisterAll();
}

module.exports = { init, attach, setHotkey, resetHotkeys, suspendGlobal, dispose };
