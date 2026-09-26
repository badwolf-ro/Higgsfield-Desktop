// Saved workspaces, like Unity layouts or DaVinci layout presets: each is a
// named snapshot of the tab/dock layout, and loading one replaces the current
// tabs. Stored in userData/workspaces.json. Call load() after app 'ready'.
// Emits 'change' (list) on every update.
const { app } = require('electron');
const { EventEmitter } = require('events');
const path = require('path');
const { readJson, writeJson, cleanName } = require('./store');

function newId() {
  return 'ws-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function tabCount(layout) {
  return layout && layout.panels && typeof layout.panels === 'object' ? Object.keys(layout.panels).length : 0;
}

class Workspaces extends EventEmitter {
  constructor() {
    super();
    this.items = [];
  }

  get file() {
    return path.join(app.getPath('userData'), 'workspaces.json');
  }

  load() {
    const data = readJson(this.file);
    if (data && Array.isArray(data.items)) this.items = data.items.filter(w => w && w.id && w.name);
  }

  changed() {
    writeJson(this.file, { items: this.items });
    this.emit('change', this.list());
  }

  get(id) {
    return this.items.find(w => w.id === id) || null;
  }

  // In the order they were saved.
  list() {
    return this.items.map(w => ({ id: w.id, name: w.name, tabCount: tabCount(w.layout), savedAt: w.savedAt }));
  }

  // The operations below return { ok: true, workspace } or { ok: false, error, code? }.

  create(name, layout) {
    const clean = cleanName(name);
    if (!clean) return { ok: false, error: 'Give the workspace a name.' };
    if (!layout) return { ok: false, error: 'There is no layout to save yet.' };
    const existing = this.items.find(w => w.name.toLowerCase() === clean.toLowerCase());
    if (existing) {
      return { ok: false, code: 'exists', id: existing.id, error: `A workspace called "${existing.name}" already exists.` };
    }
    const ws = { id: newId(), name: clean, layout, savedAt: Date.now() };
    this.items.push(ws);
    this.changed();
    return { ok: true, workspace: ws };
  }

  replace(id, layout) {
    const ws = this.get(id);
    if (!ws) return { ok: false, error: 'That workspace no longer exists.' };
    if (!layout) return { ok: false, error: 'There is no layout to save yet.' };
    ws.layout = layout;
    ws.savedAt = Date.now();
    this.changed();
    return { ok: true, workspace: ws };
  }

  rename(id, name) {
    const ws = this.get(id);
    if (!ws) return { ok: false, error: 'That workspace no longer exists.' };
    const clean = cleanName(name);
    if (!clean) return { ok: false, error: 'Give the workspace a name.' };
    if (this.items.some(w => w.id !== id && w.name.toLowerCase() === clean.toLowerCase())) {
      return { ok: false, code: 'exists', error: `A workspace called "${clean}" already exists.` };
    }
    ws.name = clean;
    this.changed();
    return { ok: true, workspace: ws };
  }

  remove(id) {
    const index = this.items.findIndex(w => w.id === id);
    if (index < 0) return { ok: false, error: 'That workspace no longer exists.' };
    const [ws] = this.items.splice(index, 1);
    this.changed();
    return { ok: true, workspace: ws };
  }
}

module.exports = new Workspaces();
