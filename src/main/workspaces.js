// Saved workspaces, like Unity layouts or DaVinci layout presets: each is a
// named snapshot of the tab/dock layout, and loading one replaces the current
// tabs. Stored in userData/workspaces.json. Call load() after app 'ready'.
// Emits 'change' (list) on every update.
const { app } = require('electron');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

const MAX_NAME = 60;

function newId() {
  return 'ws-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function tabCount(layout) {
  return layout && layout.panels && typeof layout.panels === 'object' ? Object.keys(layout.panels).length : 0;
}

function cleanName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
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
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (Array.isArray(data.items)) this.items = data.items.filter(w => w && w.id && w.name);
    } catch { /* none saved yet */ }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify({ items: this.items }));
    } catch (err) {
      console.error('Could not save workspaces:', err);
    }
  }

  changed() {
    this.save();
    this.emit('change', this.list());
  }

  get(id) {
    return this.items.find(w => w.id === id) || null;
  }

  // In order; the position is the N in "Load workspace N".
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

  move(id, delta) {
    const from = this.items.findIndex(w => w.id === id);
    if (from < 0) return { ok: false, error: 'That workspace no longer exists.' };
    const to = from + (delta < 0 ? -1 : 1);
    if (to < 0 || to >= this.items.length) return { ok: true, workspace: this.items[from] };
    this.items.splice(to, 0, this.items.splice(from, 1)[0]);
    this.changed();
    return { ok: true, workspace: this.items[to] };
  }
}

module.exports = new Workspaces();
