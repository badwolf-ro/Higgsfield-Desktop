// User preferences, stored as JSON in the app's userData folder.
// Call load() once after app 'ready'. Emits 'change' (settings, patch) on every update.
const { app } = require('electron');
const { EventEmitter } = require('events');
const path = require('path');
const store = require('./store');
const { ACTIONS } = require('../shared/actions');
const keys = require('../shared/keys');

function defaults() {
  return {
    downloads: {
      autoSave: true, // the site's Download button saves without a Save dialog
      autoDownload: false, // also save every finished generation on its own
      folder: path.join(app.getPath('downloads'), 'Higgsfield'),
    },
    tray: {
      closeToTray: true,
      hintShown: false, // the one-time "still running in the tray" balloon
    },
    notifications: {
      generationDone: true,
      flashTaskbar: true,
    },
    menuBar: {
      autoHide: false,
    },
    toolbar: {
      sections: ['image', 'video', 'cinema'], // site sections shown as toolbar buttons
    },
    layout: {
      fitDesktop: true, // lay narrow panels out at the desktop width and scale them down
      locked: false,
    },
    hotkeys: Object.fromEntries(ACTIONS.map(a => [a.id, a.hotkey])),
  };
}

// Copies known keys from `source` onto `base`, keeping the shape of `base`.
function mergeKnown(base, source) {
  if (!source || typeof source !== 'object') return base;
  for (const k of Object.keys(base)) {
    if (!(k in source)) continue;
    const b = base[k];
    const s = source[k];
    if (b && typeof b === 'object' && !Array.isArray(b)) mergeKnown(b, s);
    else if (typeof s === typeof b) base[k] = s;
  }
  return base;
}

class Settings extends EventEmitter {
  constructor() {
    super();
    this.data = null;
  }

  get file() {
    return path.join(app.getPath('userData'), 'settings.json');
  }

  load() {
    this.data = mergeKnown(defaults(), store.readJson(this.file));
    for (const id of Object.keys(this.data.hotkeys)) {
      this.data.hotkeys[id] = keys.normalize(this.data.hotkeys[id]);
    }
    return this.get();
  }

  get() {
    return JSON.parse(JSON.stringify(this.data));
  }

  defaults() {
    return defaults();
  }

  // Deep-merges `patch` (same shape as the settings) and saves.
  update(patch) {
    mergeKnown(this.data, patch);
    store.writeJson(this.file, this.data, 2);
    const snapshot = this.get();
    this.emit('change', snapshot, patch);
    return snapshot;
  }
}

module.exports = new Settings();
